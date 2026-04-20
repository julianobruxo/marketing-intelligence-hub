/**
 * Fixture-level regression tests.
 *
 * These tests consume the spreadsheet fixtures and run them through the real
 * pipeline helper functions, asserting the expected qualification and extraction
 * outcomes annotated in each fixture.
 *
 * They are "integration-lite" — no DB, no HTTP, no AI — but they exercise the
 * full deterministic extraction → qualification chain for each worksheet variant.
 */

import { describe, it, expect } from "vitest";

import {
  buildWorksheetColumnMap,
  extractColumnarRowFields,
  isRowQueueCandidate,
  isXAccountWorksheet,
  normalizeBooleanish,
  type AiSemanticFlags,
  type WorksheetExtractedFields,
} from "../queue-helpers";

import {
  yannWorksheet,
  yannFixtureExpectations,
} from "./yann-worksheet.fixture";

import {
  mattWorksheet,
  mattFixtureExpectations,
} from "./matt-worksheet.fixture";

import {
  noisyColsWorksheet,
  noisyColsExpectedColMap,
  noisyColsFixtureExpectations,
} from "./noisy-cols-worksheet.fixture";

import {
  legacyWorksheet,
  LEGACY_MULTILINE_CELL_ROW2,
  LEGACY_MULTILINE_CELL_ROW3,
} from "./legacy-worksheet.fixture";

import {
  X_ACCOUNT_WORKSHEET_NAME_VARIANTS,
  NON_X_WORKSHEET_NAMES,
  xAccountWorksheet,
} from "./x-account-worksheet.fixture";

// ---------------------------------------------------------------------------
// Helpers shared across fixture tests
// ---------------------------------------------------------------------------

/** Minimal "row has content" AI flags — used when det fields alone should qualify the row. */
function qualifiedAi(overrides: Partial<AiSemanticFlags> = {}): AiSemanticFlags {
  return {
    is_empty_or_unusable: false,
    has_editorial_brief: false,
    has_title: false,
    has_final_copy: false,
    is_published: false,
    ...overrides,
  };
}

function emptyAi(): AiSemanticFlags {
  return {
    is_empty_or_unusable: true,
    has_editorial_brief: false,
    has_title: false,
    has_final_copy: false,
    is_published: false,
  };
}

/** Build det fields for a worksheet row using that worksheet's detected headers. */
function extractDet(worksheet: typeof yannWorksheet, rowIndex: number): WorksheetExtractedFields {
  const colMap = buildWorksheetColumnMap(worksheet.detectedHeaders);
  const rowValues = worksheet.rows[rowIndex] ?? [];
  return extractColumnarRowFields(colMap, rowValues);
}

// ---------------------------------------------------------------------------
// FIXTURE 1: Yann-style worksheet
// ---------------------------------------------------------------------------

describe("Fixture: Yann-style LinkedIn + Substack worksheet", () => {
  const colMap = buildWorksheetColumnMap(yannWorksheet.detectedHeaders);

  it("maps all 7 canonical columns correctly from Yann headers", () => {
    expect(colMap.plannedDate).toBe(0);
    expect(colMap.title).toBe(1);
    expect(colMap.brief).toBe(2);
    expect(colMap.linkedinCopy).toBe(3);
    expect(colMap.publishedFlag).toBe(4);
    expect(colMap.platformLabel).toBe(5);
    expect(colMap.contentDeadline).toBe(6);
  });

  for (const expectation of yannFixtureExpectations) {
    it(`row ${expectation.rowIndex} ("${expectation.label}"): shouldQualify=${expectation.shouldQualify}`, () => {
      const det = extractDet(yannWorksheet, expectation.rowIndex);

      // For separator/empty rows the AI would mark is_empty_or_unusable=true.
      // For real rows the AI would mark at least one positive flag.
      const ai = expectation.shouldQualify
        ? qualifiedAi({
            has_editorial_brief: Boolean(det.brief),
            has_final_copy: Boolean(det.linkedinCopy),
            is_published: expectation.publishedPath,
          })
        : emptyAi();

      expect(isRowQueueCandidate(ai, det)).toBe(expectation.shouldQualify);
    });
  }

  it("published row: publishedFlag='Yes' normalises to true", () => {
    const det = extractDet(yannWorksheet, 4); // published row at rowIndex 4
    expect(normalizeBooleanish(det.publishedFlag)).toBe(true);
  });

  it("Substack teaser row: date + brief present → qualifies even if AI marks non-linkedin", () => {
    const det = extractDet(yannWorksheet, 2); // Substack row
    // Simulate AI flagging is_non_linkedin_platform = true (but isRowQueueCandidate ignores that)
    const ai = qualifiedAi({ has_editorial_brief: true });
    expect(det.plannedDate).toBe("2025-04-14");
    expect(det.brief).toBeTruthy();
    expect(isRowQueueCandidate(ai, det)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FIXTURE 2: Matt-style worksheet
// ---------------------------------------------------------------------------

describe("Fixture: Matt-style worksheet (alternative header aliases)", () => {
  const colMap = buildWorksheetColumnMap(mattWorksheet.detectedHeaders);

  it("maps 'Planned Date' → plannedDate", () => {
    expect(colMap.plannedDate).toBe(0);
  });

  it("maps 'Post Title' → title", () => {
    expect(colMap.title).toBe(1);
  });

  it("maps 'Topic' → brief", () => {
    expect(colMap.brief).toBe(2);
  });

  it("maps 'Copy (EN)' → linkedinCopy", () => {
    expect(colMap.linkedinCopy).toBe(3);
  });

  it("maps 'Status' → publishedFlag", () => {
    expect(colMap.publishedFlag).toBe(4);
  });

  it("maps 'Channel' → platformLabel", () => {
    expect(colMap.platformLabel).toBe(5);
  });

  it("maps 'Link to the post' → publishedPostUrl", () => {
    expect(colMap.publishedPostUrl).toBe(6);
  });

  for (const expectation of mattFixtureExpectations) {
    it(`row ${expectation.rowIndex} ("${expectation.label}"): shouldQualify=${expectation.shouldQualify}`, () => {
      const det = extractDet(mattWorksheet, expectation.rowIndex);
      const ai = expectation.shouldQualify
        ? qualifiedAi({
            has_editorial_brief: Boolean(det.brief),
            has_final_copy: Boolean(det.linkedinCopy),
            is_published: expectation.publishedPath,
          })
        : emptyAi();
      expect(isRowQueueCandidate(ai, det)).toBe(expectation.shouldQualify);
    });
  }

  it("published-via-URL row: publishedPostUrl present → published path", () => {
    const det = extractDet(mattWorksheet, 2); // "April AI Digest" with post URL
    // The post URL being present is what signals PUBLISHED
    expect(det.publishedPostUrl).toContain("linkedin.com");
  });
});

// ---------------------------------------------------------------------------
// FIXTURE 3: Worksheet with extra irrelevant columns
// ---------------------------------------------------------------------------

describe("Fixture: Noisy columns worksheet (extra unknown columns between known ones)", () => {
  const colMap = buildWorksheetColumnMap(noisyColsWorksheet.detectedHeaders);

  it("maps canonical fields at their shifted positions, ignoring unknown columns", () => {
    expect(colMap.plannedDate).toBe(noisyColsExpectedColMap.plannedDate);
    expect(colMap.title).toBe(noisyColsExpectedColMap.title);
    expect(colMap.brief).toBe(noisyColsExpectedColMap.brief);
    expect(colMap.linkedinCopy).toBe(noisyColsExpectedColMap.linkedinCopy);
    expect(colMap.publishedFlag).toBe(noisyColsExpectedColMap.publishedFlag);
    expect(colMap.platformLabel).toBe(noisyColsExpectedColMap.platformLabel);
  });

  it("does not map unknown columns 'Internal Notes' or 'Designer'", () => {
    // The colMap should only have the 6 known fields — no extra keys
    const mappedFieldCount = Object.keys(colMap).length;
    expect(mappedFieldCount).toBe(6);
  });

  it("row 1: extracts correct values from shifted column positions", () => {
    const det = extractDet(noisyColsWorksheet, 1);
    expect(det.plannedDate).toBe("2025-06-02");
    expect(det.title).toBe("The Future of Remote Work");
    expect(det.brief).toBe("Cover 3 trends: async, distributed teams, AI tooling.");
    expect(det.linkedinCopy).toContain("Remote isn't going away");
    expect(det.platformLabel).toBe("LinkedIn");
  });

  it("row 1: does NOT bleed 'Internal Notes' or 'Designer' values into any field", () => {
    const det = extractDet(noisyColsWorksheet, 1);
    // These values from the unknown columns must not appear in any extracted field
    const allValues = Object.values(det).join(" ");
    expect(allValues).not.toContain("Approved by PM");
    expect(allValues).not.toContain("Alice");
  });

  for (const expectation of noisyColsFixtureExpectations) {
    it(`row ${expectation.rowIndex} ("${expectation.label}"): qualifies correctly`, () => {
      const det = extractDet(noisyColsWorksheet, expectation.rowIndex);
      const ai = qualifiedAi({
        has_editorial_brief: Boolean(det.brief),
        has_final_copy: Boolean(det.linkedinCopy),
      });
      expect(isRowQueueCandidate(ai, det)).toBe(expectation.shouldQualify);
    });
  }
});

// ---------------------------------------------------------------------------
// FIXTURE 4: Legacy worksheet (multi-line cell fallback)
// ---------------------------------------------------------------------------

describe("Fixture: Legacy worksheet (multi-line cell title+brief fallback)", () => {
  it("multi-line cell has expected structure: channel\\n\\ntitle\\n\\nbrief", () => {
    const parts2 = LEGACY_MULTILINE_CELL_ROW2.split("\n\n");
    expect(parts2[0]).toBe("LinkedIn");
    expect(parts2[1]).toBe("Why Remote-First Wins");
    expect(parts2[2]).toContain("async-first");
  });

  it("multi-line cell row 3 has title 'Leadership in the Age of AI'", () => {
    const parts3 = LEGACY_MULTILINE_CELL_ROW3.split("\n\n");
    expect(parts3[1]).toBe("Leadership in the Age of AI");
  });

  it("legacy header has an empty-string column (the multi-line column)", () => {
    expect(legacyWorksheet.detectedHeaders).toContain("");
  });

  it("legacy header does NOT have a 'Title' column", () => {
    const lowerHeaders = legacyWorksheet.detectedHeaders.map((h) => h.toLowerCase());
    expect(lowerHeaders).not.toContain("title");
  });

  it("legacy column map does NOT map a title column (blank headers are skipped)", () => {
    const colMap = buildWorksheetColumnMap(legacyWorksheet.detectedHeaders);
    // No header in WORKSHEET_FIELD_ALIASES matches "" (empty), so title should be undefined
    expect(colMap.title).toBeUndefined();
  });

  it("row 4 (date-only): det extraction yields only plannedDate, no content signals", () => {
    const colMap = buildWorksheetColumnMap(legacyWorksheet.detectedHeaders);
    const rowValues = legacyWorksheet.rows[3] ?? []; // "2025-03-24"
    const det = extractColumnarRowFields(colMap, rowValues);
    // Only "Date" column maps; the multi-line column is "" (unmappable)
    expect(det.plannedDate).toBe("2025-03-24");
    expect(det.title).toBeUndefined();
    expect(det.brief).toBeUndefined();
    expect(det.linkedinCopy).toBeUndefined();
  });

  it("row 5 (empty): no fields extracted", () => {
    const colMap = buildWorksheetColumnMap(legacyWorksheet.detectedHeaders);
    const rowValues = legacyWorksheet.rows[4] ?? [];
    const det = extractColumnarRowFields(colMap, rowValues);
    expect(Object.keys(det)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FIXTURE 5: X Account worksheet exclusion
// ---------------------------------------------------------------------------

describe("Fixture: X Account worksheet — worksheet-level exclusion", () => {
  it("the canonical xAccountWorksheet fixture is itself excluded", () => {
    expect(isXAccountWorksheet(xAccountWorksheet.worksheetName)).toBe(true);
  });

  for (const name of X_ACCOUNT_WORKSHEET_NAME_VARIANTS) {
    it(`excludes variant: "${name}"`, () => {
      expect(isXAccountWorksheet(name)).toBe(true);
    });
  }

  for (const name of NON_X_WORKSHEET_NAMES) {
    it(`does NOT exclude: "${name}"`, () => {
      expect(isXAccountWorksheet(name)).toBe(false);
    });
  }

  it("X Account rows look like real content (proving worksheet-level exclusion is necessary)", () => {
    // Row index 3 (4th row) looks like a real LinkedIn post with a date and copy
    const row = xAccountWorksheet.rows[3] ?? [];
    expect(row[0]).toBe("2025-04-14");         // has a date
    expect(row[1]).toBe("Weekly AI Roundup");  // has a title-like value
    expect(row[2]).toBeTruthy();               // has copy-like text
    // This row would pass row-level qualification — proving exclusion must be at worksheet level
  });

  it("if X Account rows somehow passed through, isRowQueueCandidate would qualify them (false negative risk)", () => {
    // This test documents the danger: without worksheet-level exclusion, these rows WOULD qualify
    const xHeaders = ["Date", "Title", "Copywriter Brief", "Published", "Platform"];
    const colMap = buildWorksheetColumnMap(xHeaders);
    const xRow = ["2025-04-14", "Weekly AI Roundup", "5 stories you need to know this week.", "No", "X"];
    const det = extractColumnarRowFields(colMap, xRow);
    const ai = qualifiedAi({ has_editorial_brief: true, has_title: true });
    // Confirms the danger: row-level qualification would pass the X row
    expect(isRowQueueCandidate(ai, det)).toBe(true);
    // This is WHY isXAccountWorksheet must be called BEFORE any row qualification
  });
});
