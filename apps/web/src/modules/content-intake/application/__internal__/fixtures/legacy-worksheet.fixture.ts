/**
 * Fixture: Legacy worksheet row that relies on fallback behavior.
 *
 * Represents the old Yann format where a single multi-line cell (empty-header column)
 * encodes the channel, title, and brief together in one cell as:
 *
 *   "{channel}\n\n{TITLE}\n\n{brief text}"
 *
 * This was the original format before a dedicated Title column was added.
 * The pipeline must still handle this transitional format via Phase 1.5 fallback.
 *
 * Key characteristics:
 *   - Header row has an empty string "" for the multi-line cell column
 *   - That column holds "LinkedIn\n\nWhy Remote-First Wins\n\nFocus on async benefits"
 *   - The "Title" column is absent from the header
 *   - The pipeline must extract title = "Why Remote-First Wins" from the multi-line cell
 *   - The pipeline must extract brief = "Focus on async benefits" from that same cell
 *   - Date column is present and populated normally
 *   - Also includes a row where the multi-line cell is missing — falls back to date label
 *
 * Previously broke: When the Title column was absent, the title was either blank
 * or taken verbatim from the brief column, resulting in "topic labels" appearing
 * as titles and confusing the editorial review.
 */

import type { GoogleSheetsRawWorksheetImport } from "@/modules/content-intake/infrastructure/google-sheets-provider";

export const LEGACY_WORKSHEET_NAME = "March 2025 (Legacy)";
export const LEGACY_WORKSHEET_ID = "sheet-legacy-march-2025";

// The multi-line cell content that encodes channel + title + brief
export const LEGACY_MULTILINE_CELL_ROW2 = "LinkedIn\n\nWhy Remote-First Wins\n\nFocus on async-first benefits and real-world examples from distributed teams.";
export const LEGACY_MULTILINE_CELL_ROW3 = "LinkedIn\n\nLeadership in the Age of AI\n\nExplore how leaders can leverage AI without losing the human touch.";

export const legacyWorksheet: GoogleSheetsRawWorksheetImport = {
  worksheetId: LEGACY_WORKSHEET_ID,
  worksheetName: LEGACY_WORKSHEET_NAME,
  detectedHeaderRowNumber: 1,
  // Note: "" is the old un-named multi-line column. No "Title" header present.
  detectedHeaders: ["Date", "", "LinkedIn Copy", "Published", "Deadline"],
  rows: [
    // Row 1 — header (no Title column, empty string for the multi-line column)
    ["Date", "", "LinkedIn Copy", "Published", "Deadline"],

    // Row 2 — multi-line cell present: title + brief must be extracted from it
    [
      "2025-03-10",
      LEGACY_MULTILINE_CELL_ROW2,
      "",         // no LinkedIn copy yet
      "No",
      "2025-03-08",
    ],

    // Row 3 — another multi-line cell row, but this one has LinkedIn copy too
    [
      "2025-03-17",
      LEGACY_MULTILINE_CELL_ROW3,
      "Leadership is being redefined every day. Here's how the best leaders are using AI as an amplifier, not a replacement.",
      "No",
      "2025-03-14",
    ],

    // Row 4 — missing multi-line cell, only date: fallback to date label
    ["2025-03-24", "", "", "No", ""],

    // Row 5 — empty: must NOT qualify
    ["", "", "", "", ""],
  ],
};

/**
 * Expected title derivation for each data row.
 * These values prove the Phase 1.5 multi-line cell fallback is working.
 */
export const legacyFixtureExpectations = [
  {
    rowIndex: 1,
    shouldQualify: true,
    expectedTitle: "Why Remote-First Wins",
    expectedBrief: "Focus on async-first benefits and real-world examples from distributed teams.",
    label: "multi-line cell fallback — no LinkedIn copy",
  },
  {
    rowIndex: 2,
    shouldQualify: true,
    expectedTitle: "Leadership in the Age of AI",
    expectedBrief: "Explore how leaders can leverage AI without losing the human touch.",
    label: "multi-line cell fallback — with LinkedIn copy",
  },
  {
    rowIndex: 3,
    shouldQualify: false,
    expectedTitle: null, // only a date, no content — should fall through to date-based or row label
    label: "date-only row, no multi-line cell",
  },
  {
    rowIndex: 4,
    shouldQualify: false,
    expectedTitle: null,
    label: "empty row",
  },
] as const;
