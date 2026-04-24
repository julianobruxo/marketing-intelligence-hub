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
    has_title: false,
    has_final_copy: false,
    is_published: false,
    ...overrides,
  };
}

function emptyAi(): AiSemanticFlags {
  return {
    is_empty_or_unusable: true,
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

  it("maps the 5 operational columns from Yann headers — brief and platform are not mapped", () => {
    expect(colMap.plannedDate).toBe(0);
    expect(colMap.title).toBe(1);
    // index 2 = "Copywriter Brief" — not an operational field
    expect(colMap.linkedinCopy).toBe(3);
    expect(colMap.publishedFlag).toBe(4);
    // index 5 = "Platform" — not an operational field
    expect(colMap.contentDeadline).toBe(6);
  });

  for (const expectation of yannFixtureExpectations) {
    it(`row ${expectation.rowIndex} ("${expectation.label}"): shouldQualify=${expectation.shouldQualify}`, () => {
      const det = extractDet(yannWorksheet, expectation.rowIndex);

      // For separator/empty rows the AI would mark is_empty_or_unusable=true.
      // For real rows the AI would mark at least one positive flag.
      const ai = expectation.shouldQualify
        ? qualifiedAi({
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

  it("Substack teaser row: qualifies via operational Title column — brief column is ignored", () => {
    const det = extractDet(yannWorksheet, 2); // Substack row — has "Newsletter: Q1 Retrospective" in Title
    const ai = qualifiedAi({ has_title: true });
    expect(det.plannedDate).toBe("2025-04-14");
    expect(det.title).toBe("Newsletter: Q1 Retrospective");
    // brief column is not mapped — does not contribute to qualification
    expect((det as Record<string, unknown>).brief).toBeUndefined();
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

  it("'Topic' and 'Channel' are not operational fields — must not be mapped", () => {
    // Topic and Platform are non-operational; only operational columns are recognised
    expect((colMap as Record<string, unknown>).topic).toBeUndefined();
    expect((colMap as Record<string, unknown>).platformLabel).toBeUndefined();
  });

  it("maps 'Copy (EN)' → linkedinCopy", () => {
    expect(colMap.linkedinCopy).toBe(3);
  });

  it("maps 'Status' → publishedFlag", () => {
    expect(colMap.publishedFlag).toBe(4);
  });

  it("'Link to the post' is not an operational field — must not be mapped", () => {
    expect((colMap as Record<string, unknown>).publishedPostUrl).toBeUndefined();
  });

  for (const expectation of mattFixtureExpectations) {
    it(`row ${expectation.rowIndex} ("${expectation.label}"): shouldQualify=${expectation.shouldQualify}`, () => {
      const det = extractDet(mattWorksheet, expectation.rowIndex);
      const ai = expectation.shouldQualify
        ? qualifiedAi({
            has_final_copy: Boolean(det.linkedinCopy),
            is_published: expectation.publishedPath,
          })
        : emptyAi();
      expect(isRowQueueCandidate(ai, det)).toBe(expectation.shouldQualify);
    });
  }

  it("published-via-URL row: publishedPostUrl column is not operational — qualification via publishedFlag only", () => {
    // The "Link to the post" column is no longer extracted; the row at index 2 has
    // empty publishedFlag ("") and qualifies only via title + copy.
    const det = extractDet(mattWorksheet, 2);
    expect((det as Record<string, unknown>).publishedPostUrl).toBeUndefined();
    expect(det.title).toBe("April AI Digest");
    expect(det.linkedinCopy).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// FIXTURE 3: Worksheet with extra irrelevant columns
// ---------------------------------------------------------------------------

describe("Fixture: Noisy columns worksheet (extra unknown columns between known ones)", () => {
  const colMap = buildWorksheetColumnMap(noisyColsWorksheet.detectedHeaders);

  it("maps operational fields at their shifted positions, ignoring non-operational and unknown columns", () => {
    expect(colMap.plannedDate).toBe(noisyColsExpectedColMap.plannedDate);
    expect(colMap.title).toBe(noisyColsExpectedColMap.title);
    // brief and platformLabel are no longer operational fields
    expect(colMap.linkedinCopy).toBe(noisyColsExpectedColMap.linkedinCopy);
    expect(colMap.publishedFlag).toBe(noisyColsExpectedColMap.publishedFlag);
  });

  it("does not map non-operational or unknown columns", () => {
    // Only operational fields: plannedDate, title, linkedinCopy, publishedFlag, sourceAssetLink, contentDeadline
    const mappedKeys = Object.keys(colMap);
    expect(mappedKeys).not.toContain("brief");
    expect(mappedKeys).not.toContain("platformLabel");
  });

  it("row 1: extracts correct operational values from shifted column positions", () => {
    const det = extractDet(noisyColsWorksheet, 1);
    expect(det.plannedDate).toBe("2025-06-02");
    expect(det.title).toBe("The Future of Remote Work");
    // brief and platformLabel are no longer extracted
    expect(det.linkedinCopy).toContain("Remote isn't going away");
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
    const ai = qualifiedAi({ has_title: true });
    // Confirms the danger: row-level qualification would pass the X row
    expect(isRowQueueCandidate(ai, det)).toBe(true);
    // This is WHY isXAccountWorksheet must be called BEFORE any row qualification
  });
});
