/**
 * Regression tests for the import → queue flow.
 *
 * Target: lock down the business rules that were recently stabilised.
 * Covers:
 *   1. Worksheet-level X/Twitter exclusion
 *   2. Deterministic column extraction (Date, Title, Brief, LinkedIn Copy, Published)
 *   3. Queue candidate qualification (teaser, Substack, brief-only, published, empty/decorative)
 *   4. Duplicate title + different date → distinct content signatures
 *   5. Published / unpublished operational-status mapping
 */

import { describe, it, expect } from "vitest";

import {
  isXAccountWorksheet,
  buildWorksheetColumnMap,
  extractColumnarRowFields,
  isRowQueueCandidate,
  buildFallbackTitle,
  buildContentSignature,
  normalizeBooleanish,
  type AiSemanticFlags,
  type WorksheetExtractedFields,
} from "@/modules/content-intake/application/__internal__/queue-helpers";

import { inferContentOperationalStatus } from "@/modules/content-intake/domain/infer-content-status";

// ============================================================
// 1. WORKSHEET EXCLUSION
// ============================================================

describe("isXAccountWorksheet — worksheet-level X/Twitter exclusion", () => {
  const excluded = [
    "X Account",
    "x account",
    "X ACCOUNT",
    "  X Account  ",   // leading/trailing spaces
    "X.com",
    "x.com",
    "Twitter",
    "twitter",
    "Twitter/X",
    "twitter/x",
    "Twitter / X",
    "X",
    " x ",
  ];

  for (const name of excluded) {
    it(`excludes worksheet named "${name}"`, () => {
      expect(isXAccountWorksheet(name)).toBe(true);
    });
  }

  const included = [
    "LinkedIn",
    "Yann",
    "Brazil",
    "Yann Content Plan",
    "April 2025",
    "Q2",
    "Shawn",
    "Operations",
    "Substack",           // Substack is NOT a worksheet-level exclusion
    "Company Page",
    "",                    // empty string — not excluded, just meaningless
  ];

  for (const name of included) {
    it(`does NOT exclude worksheet named "${name}"`, () => {
      expect(isXAccountWorksheet(name)).toBe(false);
    });
  }
});

// ============================================================
// 2. DETERMINISTIC EXTRACTION
// ============================================================

describe("buildWorksheetColumnMap — header alias detection", () => {
  it("maps standard Yann-style headers correctly", () => {
    const headers = ["Date", "Title", "Copywriter Brief", "LinkedIn Copy", "Published", "Platform", "Deadline"];
    const colMap = buildWorksheetColumnMap(headers);

    expect(colMap.plannedDate).toBe(0);
    expect(colMap.title).toBe(1);
    expect(colMap.brief).toBe(2);
    expect(colMap.linkedinCopy).toBe(3);
    expect(colMap.publishedFlag).toBe(4);
    expect(colMap.platformLabel).toBe(5);
    expect(colMap.contentDeadline).toBe(6);
  });

  it("handles multi-line headers — collapses to first line", () => {
    // Real Yann sheet: "LinkedIn\n(Up to 3000 characters)"
    const headers = ["Date", "LinkedIn\n(Up to 3000 characters)"];
    const colMap = buildWorksheetColumnMap(headers);

    expect(colMap.plannedDate).toBe(0);
    expect(colMap.linkedinCopy).toBe(1);
  });

  it("first-match-wins: first 'copy' column wins when there are duplicates", () => {
    const headers = ["Date", "Copy", "English Copy"];
    const colMap = buildWorksheetColumnMap(headers);

    // "copy" matches linkedinCopy first, so index 1 wins
    expect(colMap.linkedinCopy).toBe(1);
  });

  it("maps alternative header names", () => {
    const headers = ["Planned Date", "Post Title", "Topic", "Copy (EN)", "Status"];
    const colMap = buildWorksheetColumnMap(headers);

    expect(colMap.plannedDate).toBe(0);
    expect(colMap.title).toBe(1);
    expect(colMap.brief).toBe(2);
    expect(colMap.linkedinCopy).toBe(3);
    expect(colMap.publishedFlag).toBe(4);
  });

  it("returns empty map for unrecognised headers", () => {
    const headers = ["Foo", "Bar", "Baz"];
    const colMap = buildWorksheetColumnMap(headers);
    expect(Object.keys(colMap)).toHaveLength(0);
  });
});

describe("extractColumnarRowFields — row value extraction", () => {
  it("extracts all fields when columns are present and non-empty", () => {
    const headers = ["Date", "Title", "Copywriter Brief", "LinkedIn Copy", "Published"];
    const colMap = buildWorksheetColumnMap(headers);
    const rowValues = ["2025-05-01", "My Big Announcement", "Use case details here", "Final post copy text.", "Yes"];

    const fields = extractColumnarRowFields(colMap, rowValues);

    expect(fields.plannedDate).toBe("2025-05-01");
    expect(fields.title).toBe("My Big Announcement");
    expect(fields.brief).toBe("Use case details here");
    expect(fields.linkedinCopy).toBe("Final post copy text.");
    expect(fields.publishedFlag).toBe("Yes");
  });

  it("trims whitespace from extracted values", () => {
    const headers = ["Date", "Title"];
    const colMap = buildWorksheetColumnMap(headers);
    const rowValues = ["  2025-05-01  ", "  My Title  "];

    const fields = extractColumnarRowFields(colMap, rowValues);
    expect(fields.plannedDate).toBe("2025-05-01");
    expect(fields.title).toBe("My Title");
  });

  it("does not set a field when its cell is empty", () => {
    const headers = ["Date", "Title", "Copywriter Brief"];
    const colMap = buildWorksheetColumnMap(headers);
    const rowValues = ["2025-05-01", "", ""];

    const fields = extractColumnarRowFields(colMap, rowValues);
    expect(fields.plannedDate).toBe("2025-05-01");
    expect(fields.title).toBeUndefined();
    expect(fields.brief).toBeUndefined();
  });

  it("handles rows shorter than the header array gracefully", () => {
    const headers = ["Date", "Title", "LinkedIn Copy"];
    const colMap = buildWorksheetColumnMap(headers);
    // Only one cell provided
    const rowValues = ["2025-05-01"];

    const fields = extractColumnarRowFields(colMap, rowValues);
    expect(fields.plannedDate).toBe("2025-05-01");
    expect(fields.title).toBeUndefined();
    expect(fields.linkedinCopy).toBeUndefined();
  });
});

// ============================================================
// 3. QUEUE CANDIDATE QUALIFICATION
// ============================================================

/** Minimal passing AI flags for a row the AI considers non-empty. */
function qualifiedAiFlags(overrides: Partial<AiSemanticFlags> = {}): AiSemanticFlags {
  return {
    is_empty_or_unusable: false,
    has_editorial_brief: false,
    has_title: false,
    has_final_copy: false,
    is_published: false,
    ...overrides,
  };
}

function emptyAiFlags(): AiSemanticFlags {
  return {
    is_empty_or_unusable: true,
    has_editorial_brief: false,
    has_title: false,
    has_final_copy: false,
    is_published: false,
  };
}

describe("isRowQueueCandidate — qualification logic", () => {
  it("TEASER ROW: qualifies when date + brief present (no copy yet)", () => {
    const det: WorksheetExtractedFields = { plannedDate: "2025-05-12", brief: "Teaser about new product launch" };
    const ai = qualifiedAiFlags({ has_editorial_brief: true });
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });

  it("SUBSTACK ROW: qualifies when date + title present, even if AI flags non-linkedin platform", () => {
    // AI might set is_non_linkedin_platform = true, but isRowQueueCandidate does NOT receive that flag.
    // The deterministic layer (det.plannedDate + det.title) is enough to qualify the row.
    const det: WorksheetExtractedFields = { plannedDate: "2025-05-20", title: "Substack article: AI trends" };
    const ai = qualifiedAiFlags({ has_title: true });
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });

  it("BRIEF-ONLY ROW: qualifies when date + brief present with no copy and no title", () => {
    const det: WorksheetExtractedFields = { plannedDate: "2025-06-01", brief: "Write about leadership" };
    const ai = qualifiedAiFlags({ has_editorial_brief: true });
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });

  it("PUBLISHED ROW: qualifies when AI signals is_published even without det fields", () => {
    const det: WorksheetExtractedFields = {};
    const ai = qualifiedAiFlags({ is_published: true });
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });

  it("PUBLISHED ROW (det path): qualifies when date + linkedinCopy present", () => {
    const det: WorksheetExtractedFields = {
      plannedDate: "2025-04-10",
      linkedinCopy: "Our team grew by 50% this quarter…",
      publishedFlag: "Yes",
    };
    const ai = qualifiedAiFlags({ has_final_copy: true, is_published: true });
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });

  it("DECORATIVE ROW: does NOT qualify when AI marks empty and det finds nothing", () => {
    const det: WorksheetExtractedFields = {};
    const ai = emptyAiFlags();
    expect(isRowQueueCandidate(ai, det)).toBe(false);
  });

  it("DECORATIVE ROW: does NOT qualify even when det has date but no content signals", () => {
    // date alone without title/brief/copy is insufficient for deterministic qualification
    const det: WorksheetExtractedFields = { plannedDate: "2025-05-01" };
    const ai = emptyAiFlags();
    expect(isRowQueueCandidate(ai, det)).toBe(false);
  });

  it("EMPTY ROW: does NOT qualify when det is empty and AI is_empty_or_unusable", () => {
    const det: WorksheetExtractedFields = {};
    const ai = emptyAiFlags();
    expect(isRowQueueCandidate(ai, det)).toBe(false);
  });

  it("AI-ONLY QUALIFICATION: row with no det fields but AI has brief signal qualifies", () => {
    // When det found nothing but AI did find signals, AI takes over.
    const det: WorksheetExtractedFields = {};
    const ai = qualifiedAiFlags({ has_editorial_brief: true });
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });

  it("DETERMINISTIC OVERRIDES AI: qualifies even when AI has no positive flags (but finds det fields)", () => {
    const det: WorksheetExtractedFields = {
      plannedDate: "2025-07-15",
      title: "Q3 Kickoff Post",
    };
    // AI found nothing useful but det has date + title
    const ai = qualifiedAiFlags({
      // All false — AI did not flag anything
    });
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });
});

// ============================================================
// 4. DUPLICATE TITLES WITH DIFFERENT DATES → DISTINCT SIGNATURES
// ============================================================

describe("buildContentSignature — distinct rows with same title but different dates", () => {
  const title = "Weekly AI & Robotics Roundup";
  const copyEnglish = "This week in AI: breakthroughs in robotics.";
  const sourceGroup = "Yann";

  it("two rows with different dates produce different signatures", () => {
    const sig1 = buildContentSignature({ sourceGroup, plannedDate: "2025-05-05", title, copyEnglish });
    const sig2 = buildContentSignature({ sourceGroup, plannedDate: "2025-05-12", title, copyEnglish });
    expect(sig1).not.toBe(sig2);
  });

  it("same row produces identical signature on repeated calls (stable)", () => {
    const sig1 = buildContentSignature({ sourceGroup, plannedDate: "2025-05-05", title, copyEnglish });
    const sig2 = buildContentSignature({ sourceGroup, plannedDate: "2025-05-05", title, copyEnglish });
    expect(sig1).toBe(sig2);
  });

  it("different source groups produce different signatures even with identical content", () => {
    const sig1 = buildContentSignature({ sourceGroup: "Yann", plannedDate: "2025-05-05", title, copyEnglish });
    const sig2 = buildContentSignature({ sourceGroup: "Yuri", plannedDate: "2025-05-05", title, copyEnglish });
    expect(sig1).not.toBe(sig2);
  });
});

// ============================================================
// 5. PUBLISHED / UNPUBLISHED MAPPING
// ============================================================

describe("normalizeBooleanish — published flag parsing", () => {
  const truthy = ["Yes", "yes", "YES", "true", "True", "published", "Published", "done", "Done", "complete", "Complete", "completed", "live"];
  for (const v of truthy) {
    it(`treats "${v}" as published (true)`, () => {
      expect(normalizeBooleanish(v)).toBe(true);
    });
  }

  const falsy = ["No", "no", "false", "False", "pending", "draft", "", "  ", null, undefined, 0 as unknown as string];
  for (const v of falsy) {
    it(`treats ${JSON.stringify(v)} as not published (false)`, () => {
      expect(normalizeBooleanish(v as string)).toBe(false);
    });
  }

  it("accepts boolean true directly", () => {
    expect(normalizeBooleanish(true)).toBe(true);
  });

  it("accepts boolean false directly", () => {
    expect(normalizeBooleanish(false)).toBe(false);
  });
});

describe("inferContentOperationalStatus — published/unpublished path mapping", () => {
  it("Published = Yes → PUBLISHED", () => {
    const status = inferContentOperationalStatus({
      sourceMetadata: { publishedFlag: "Yes" },
      planning: { copyEnglish: "Some copy" },
    });
    expect(status).toBe("PUBLISHED");
  });

  it("Published = No with copy → READY_FOR_DESIGN (not published)", () => {
    const status = inferContentOperationalStatus({
      sourceMetadata: { publishedFlag: "No" },
      planning: { copyEnglish: "Here is the actual LinkedIn copy." },
    });
    expect(status).toBe("READY_FOR_DESIGN");
  });

  it("Published = No with no copy → WAITING_FOR_COPY", () => {
    const status = inferContentOperationalStatus({
      sourceMetadata: { publishedFlag: "No" },
      planning: { copyEnglish: "" },
    });
    expect(status).toBe("WAITING_FOR_COPY");
  });

  it("publishedPostUrl present → PUBLISHED regardless of flag", () => {
    const status = inferContentOperationalStatus({
      sourceMetadata: { publishedPostUrl: "https://linkedin.com/post/123" },
      planning: { copyEnglish: "" },
    });
    expect(status).toBe("PUBLISHED");
  });

  it("no published signal, no copy → WAITING_FOR_COPY", () => {
    const status = inferContentOperationalStatus({
      planning: { copyEnglish: "" },
    });
    expect(status).toBe("WAITING_FOR_COPY");
  });

  it("no published signal, has copy, no deadline → READY_FOR_DESIGN", () => {
    const status = inferContentOperationalStatus({
      planning: { copyEnglish: "Ready copy here." },
    });
    expect(status).toBe("READY_FOR_DESIGN");
  });

  it("past deadline with copy → LATE", () => {
    const status = inferContentOperationalStatus({
      planning: { copyEnglish: "Copy.", contentDeadline: "2020-01-01" },
    });
    expect(status).toBe("LATE");
  });
});

// ============================================================
// 6. TITLE FALLBACK
// ============================================================

describe("buildFallbackTitle — title derivation priority", () => {
  it("prefers explicit title when present", () => {
    expect(buildFallbackTitle({ title: "My Title", copy: "Some copy", date: "2025-05-01", rowNumber: 5 })).toBe("My Title");
  });

  it("falls back to first line of copy when title is absent", () => {
    const copy = "First line of post.\nSecond line here.";
    expect(buildFallbackTitle({ copy, date: "2025-05-01", rowNumber: 5 })).toBe("First line of post.");
  });

  it("falls back to date label when title and copy are absent", () => {
    expect(buildFallbackTitle({ date: "2025-05-01", rowNumber: 5 })).toBe("Planned item - 2025-05-01");
  });

  it("falls back to row number when nothing else is available", () => {
    expect(buildFallbackTitle({ rowNumber: 7 })).toBe("Planned item - row 7");
  });

  it("truncates extremely long copy first lines to 140 chars", () => {
    const longFirstLine = "A".repeat(200);
    const result = buildFallbackTitle({ copy: longFirstLine, rowNumber: 1 });
    expect(result.length).toBeLessThanOrEqual(141); // 139 chars + ellipsis char
    expect(result.endsWith("…")).toBe(true);
  });
});
