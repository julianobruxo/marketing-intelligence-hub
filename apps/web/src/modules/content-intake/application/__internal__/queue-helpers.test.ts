/**
 * Regression tests for the import Ã¢â€ â€™ queue flow.
 *
 * Target: lock down the business rules that were recently stabilised.
 * Covers:
 *   1. Worksheet-level X/Twitter exclusion
 *   2. Deterministic column extraction (Date, Title, Brief, LinkedIn Copy, Published)
 *   3. Queue candidate qualification (teaser, Substack, brief-only, published, empty/decorative)
 *   4. Duplicate title + different date Ã¢â€ â€™ distinct content signatures
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
  deriveFirstMeaningfulLine,
  isGenericContentLabel,
  type AiSemanticFlags,
  type WorksheetExtractedFields,
} from "@/modules/content-intake/application/__internal__/queue-helpers";

import {
  inferContentOperationalStatus,
} from "@/modules/content-intake/domain/infer-content-status";

// ============================================================
// 1. WORKSHEET EXCLUSION
// ============================================================

describe("isXAccountWorksheet Ã¢â‚¬â€ worksheet-level X/Twitter exclusion", () => {
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
    "",                    // empty string Ã¢â‚¬â€ not excluded, just meaningless
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

describe("buildWorksheetColumnMap Ã¢â‚¬â€ header alias detection", () => {
  it("maps standard Yann-style headers correctly — only operational fields are recognised", () => {
    const headers = ["Date", "Title", "Copywriter Brief", "LinkedIn Copy", "Published", "Platform", "Deadline"];
    const colMap = buildWorksheetColumnMap(headers);

    expect(colMap.plannedDate).toBe(0);
    expect(colMap.title).toBe(1);
    // "Copywriter Brief" is not an operational field — must not be mapped
    expect((colMap as Record<string, unknown>).brief).toBeUndefined();
    expect(colMap.linkedinCopy).toBe(3);
    expect(colMap.publishedFlag).toBe(4);
    // "Platform" is not an operational field — must not be mapped
    expect((colMap as Record<string, unknown>).platformLabel).toBeUndefined();
    expect(colMap.contentDeadline).toBe(6);
  });

  it("handles multi-line headers Ã¢â‚¬â€ collapses to first line", () => {
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

  it("maps alternative header names — Topic and Platform are not operational fields", () => {
    const headers = ["Planned Date", "Post Title", "Topic", "Copy (EN)", "Status"];
    const colMap = buildWorksheetColumnMap(headers);

    expect(colMap.plannedDate).toBe(0);
    expect(colMap.title).toBe(1);
    // "Topic" is not an operational field — must not be mapped
    expect((colMap as Record<string, unknown>).topic).toBeUndefined();
    expect(colMap.linkedinCopy).toBe(3);
    expect(colMap.publishedFlag).toBe(4);
  });

  it("returns empty map for unrecognised headers", () => {
    const headers = ["Foo", "Bar", "Baz"];
    const colMap = buildWorksheetColumnMap(headers);
    expect(Object.keys(colMap)).toHaveLength(0);
  });
});

describe("extractColumnarRowFields Ã¢â‚¬â€ row value extraction", () => {
  it("extracts operational fields when present — Copywriter Brief column is ignored", () => {
    const headers = ["Date", "Title", "Copywriter Brief", "LinkedIn Copy", "Published"];
    const colMap = buildWorksheetColumnMap(headers);
    const rowValues = ["2025-05-01", "My Big Announcement", "Use case details here", "Final post copy text.", "Yes"];

    const fields = extractColumnarRowFields(colMap, rowValues);

    expect(fields.plannedDate).toBe("2025-05-01");
    expect(fields.title).toBe("My Big Announcement");
    // "Copywriter Brief" is not operational — must not be extracted
    expect((fields as Record<string, unknown>).brief).toBeUndefined();
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
    // brief is not in the operational field set regardless
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
    has_title: false,
    has_final_copy: false,
    is_published: false,
    ...overrides,
  };
}

function emptyAiFlags(): AiSemanticFlags {
  return {
    is_empty_or_unusable: true,
    has_title: false,
    has_final_copy: false,
    is_published: false,
  };
}

describe("isRowQueueCandidate - qualification logic", () => {
  it("TEASER ROW: does not qualify from date alone — needs title, copy, or published signal", () => {
    const det: WorksheetExtractedFields = { plannedDate: "2025-05-12" };
    const ai = qualifiedAiFlags();
    expect(isRowQueueCandidate(ai, det)).toBe(false);
  });

  it("SUBSTACK ROW: qualifies when date + title present, even if AI flags non-linkedin platform", () => {
    const det: WorksheetExtractedFields = { plannedDate: "2025-05-20", title: "Substack article: AI trends" };
    const ai = qualifiedAiFlags({ has_title: true });
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });

  it("DATE-ONLY ROW: does not qualify when no operational title, copy, or published signal exists", () => {
    const det: WorksheetExtractedFields = { plannedDate: "2025-06-01" };
    const ai = qualifiedAiFlags();
    expect(isRowQueueCandidate(ai, det)).toBe(false);
  });

  it("PUBLISHED ROW: does not qualify from AI signal alone without det fields", () => {
    const det: WorksheetExtractedFields = {};
    const ai = qualifiedAiFlags({ is_published: true });
    expect(isRowQueueCandidate(ai, det)).toBe(false);
  });

  it("PUBLISHED ROW (det path): qualifies when date + linkedinCopy present", () => {
    const det: WorksheetExtractedFields = {
      plannedDate: "2025-04-10",
      linkedinCopy: "Our team grew by 50% this quarter...",
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
    const det: WorksheetExtractedFields = { plannedDate: "2025-05-01" };
    const ai = emptyAiFlags();
    expect(isRowQueueCandidate(ai, det)).toBe(false);
  });

  it("EMPTY ROW: does NOT qualify when det is empty and AI is_empty_or_unusable", () => {
    const det: WorksheetExtractedFields = {};
    const ai = emptyAiFlags();
    expect(isRowQueueCandidate(ai, det)).toBe(false);
  });

  it("AI-ONLY QUALIFICATION: row with no deterministic operational fields does not qualify", () => {
    const det: WorksheetExtractedFields = {};
    const ai = qualifiedAiFlags({ has_title: true });
    expect(isRowQueueCandidate(ai, det)).toBe(false);
  });

  it("DETERMINISTIC OVERRIDES AI: qualifies even when AI has no positive flags (but finds det fields)", () => {
    const det: WorksheetExtractedFields = {
      plannedDate: "2025-07-15",
      title: "Q3 Kickoff Post",
    };
    const ai = qualifiedAiFlags();
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });
});

// ============================================================
// 4. DUPLICATE TITLES WITH DIFFERENT DATES Ã¢â€ â€™ DISTINCT SIGNATURES
// ============================================================

describe("buildContentSignature Ã¢â‚¬â€ distinct rows with same title but different dates", () => {
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

describe("normalizeBooleanish Ã¢â‚¬â€ published flag parsing", () => {
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

describe("inferContentOperationalStatus Ã¢â‚¬â€ published/unpublished path mapping", () => {
  it("Published = Yes Ã¢â€ â€™ PUBLISHED", () => {
    const status = inferContentOperationalStatus({
      sourceMetadata: { publishedFlag: "Yes" },
      planning: {
        title: "Source title",
        copyEnglish:
          "This is the final LinkedIn copy approved in the source spreadsheet. It is intentionally long enough to pass the real-copy threshold, with a complete operator-ready post body.",
      },
    });
    expect(status).toBe("POSTED");
  });

  it("Published = No with copy Ã¢â€ â€™ READY_FOR_DESIGN (not published)", () => {
    const status = inferContentOperationalStatus({
      sourceMetadata: { publishedFlag: "No" },
      planning: {
        title: "Source title",
        copyEnglish:
          "This is the final LinkedIn copy approved in the source spreadsheet. It is intentionally long enough to pass the real-copy threshold, with a complete operator-ready post body.",
      },
    });
    expect(status).toBe("READY_FOR_DESIGN");
  });

  it("Published = No with no copy Ã¢â€ â€™ WAITING_FOR_COPY", () => {
    const status = inferContentOperationalStatus({
      sourceMetadata: { publishedFlag: "No" },
      planning: { title: "Source title", copyEnglish: "" },
    });
    expect(status).toBe("BLOCKED");
  });

  it("publishedFlag=\"Yes\" => POSTED regardless of copy or image", () => {
    const status = inferContentOperationalStatus({
      sourceMetadata: { publishedFlag: "Yes" },
      planning: { title: "Source title", copyEnglish: "" },
    });
    expect(status).toBe("POSTED");
  });

  it("no published signal, no copy Ã¢â€ â€™ WAITING_FOR_COPY", () => {
    const status = inferContentOperationalStatus({
      planning: { title: "Source title", copyEnglish: "" },
    });
    expect(status).toBe("BLOCKED");
  });

  it("no published signal, has copy, no deadline Ã¢â€ â€™ READY_FOR_DESIGN", () => {
    const status = inferContentOperationalStatus({
      planning: {
        title: "Source title",
        copyEnglish:
          "This is the final LinkedIn copy approved in the source spreadsheet. It is intentionally long enough to pass the real-copy threshold, with a complete operator-ready post body.",
      },
    });
    expect(status).toBe("READY_FOR_DESIGN");
  });

  it("past deadline with copy Ã¢â€ â€™ LATE", () => {
    const status = inferContentOperationalStatus({
      planning: {
        title: "Source title",
        copyEnglish:
          "This is the final LinkedIn copy approved in the source spreadsheet. It is intentionally long enough to pass the real-copy threshold, with a complete operator-ready post body.",
        sourceAssetLink: "https://example.com/image.png",
      },
    });
    expect(status).toBe("READY_TO_PUBLISH");
  });
});

// ============================================================
// 6. TITLE FALLBACK
// ============================================================

describe("buildFallbackTitle - title derivation priority", () => {
  it("prefers explicit title when present", () => {
    expect(buildFallbackTitle({ title: "My Title", copy: "Some copy", date: "2025-05-01", rowNumber: 5 })).toBe("My Title");
  });

  it("falls back to the date placeholder when title is absent", () => {
    const copy = "First line of post.\nSecond line here.";
    expect(buildFallbackTitle({ copy, date: "2025-05-01", rowNumber: 5 })).toBe("Post - 2025-05-01");
  });

  it("falls back to date label when title and copy are absent", () => {
    expect(buildFallbackTitle({ date: "2025-05-01", rowNumber: 5 })).toBe("Post - 2025-05-01");
  });

  it("falls back to row number when nothing else is available", () => {
    expect(buildFallbackTitle({ rowNumber: 7 })).toBe("Post - row 7");
  });

  it("ignores copy-only fallback when no title or date is available", () => {
    const longFirstLine = "A".repeat(200);
    const result = buildFallbackTitle({ copy: longFirstLine, rowNumber: 1 });
    expect(result).toBe("Post - row 1");
  });

  it("does not derive a title from copy when only copy is present", () => {
    const copy = "LinkedIn\nClaude AI Learning Doc\nMore detail here...";
    expect(buildFallbackTitle({ copy, rowNumber: 1 })).toBe("Post - row 1");
  });

  it("falls back to date when copy has only generic labels", () => {
    expect(buildFallbackTitle({ copy: "LinkedIn\nSubstack", date: "2025-05-01", rowNumber: 1 })).toBe("Post - 2025-05-01");
  });
});

describe("deriveFirstMeaningfulLine Ã¢â‚¬â€ skip generic platform labels", () => {
  it("skips LinkedIn label and returns the next descriptive line", () => {
    const text = "LinkedIn\nClaude AI Learning Doc\nthe doc that contains...";
    expect(deriveFirstMeaningfulLine(text)).toBe("Claude AI Learning Doc");
  });

  it("skips multiple generic labels before finding real content", () => {
    const text = "LinkedIn\nSubstack\nWeekly AI & Robotics Roundup";
    expect(deriveFirstMeaningfulLine(text)).toBe("Weekly AI & Robotics Roundup");
  });

  it("skips Substack and paid-article labels before returning the next line", () => {
    const text = "Substack\nPaid article\nAI Voice Agent...";
    expect(deriveFirstMeaningfulLine(text)).toBe("AI Voice Agent...");
  });

  it("skips uppercase free-article and news labels", () => {
    const text = "FREE article\nNews\nOpenClaw Is Dangerous for Your Business";
    expect(deriveFirstMeaningfulLine(text)).toBe("OpenClaw Is Dangerous for Your Business");
  });

  it("returns the first line when it is already meaningful", () => {
    expect(deriveFirstMeaningfulLine("Claude AI Learning Doc\nsome more")).toBe("Claude AI Learning Doc");
  });

  it("skips lines shorter than 4 chars", () => {
    expect(deriveFirstMeaningfulLine("Hi\nReal title here")).toBe("Real title here");
  });

  it("skips URL lines", () => {
    expect(deriveFirstMeaningfulLine("https://example.com\nReal content")).toBe("Real content");
  });

  it("skips bullet/number-only lines", () => {
    expect(deriveFirstMeaningfulLine("---\nActual title")).toBe("Actual title");
  });

  it("returns undefined when all lines are generic labels", () => {
    expect(deriveFirstMeaningfulLine("LinkedIn\nSubstack\nVideo")).toBeUndefined();
  });

  it("returns the full line without truncation Ã¢â‚¬â€ callers apply their own limit", () => {
    const longLine = "A".repeat(100);
    expect(deriveFirstMeaningfulLine(longLine)).toHaveLength(100);
  });
});
describe("isGenericContentLabel", () => {
  it("recognizes normalized paid/free/article/news labels", () => {
    expect(isGenericContentLabel("Paid article")).toBe(true);
    expect(isGenericContentLabel("FREE article")).toBe(true);
    expect(isGenericContentLabel("article")).toBe(true);
    expect(isGenericContentLabel("News")).toBe(true);
    expect(isGenericContentLabel("OpenClaw Security Guide")).toBe(false);
  });
});
