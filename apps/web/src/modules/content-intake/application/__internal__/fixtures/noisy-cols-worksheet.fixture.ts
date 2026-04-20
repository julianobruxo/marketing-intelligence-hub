/**
 * Fixture: Worksheet with an extra irrelevant column between relevant columns.
 *
 * Represents sheets that have been organically extended with columns the app
 * doesn't know about — inserted between two columns that the pipeline must
 * still correctly detect.
 *
 * Key characteristics:
 *   - An unknown "Internal Notes" column sits between "Title" and "Copywriter Brief"
 *   - An unknown "Designer" column sits between "LinkedIn Copy" and "Published"
 *   - Column indices for all canonical fields shift by 1 or 2
 *   - All known fields must still be extracted at their correct (shifted) positions
 *   - The unknown columns must be silently ignored (not crash, not mis-map)
 *
 * Previously broke: Hard-coded column index assumptions meant that inserting
 * any unexpected column caused every downstream field to read from the wrong cell.
 * This fixture validates that buildWorksheetColumnMap() resolves by header name,
 * not by index.
 */

import type { GoogleSheetsRawWorksheetImport } from "@/modules/content-intake/infrastructure/google-sheets-provider";

export const NOISY_COLS_WORKSHEET_NAME = "Q2 Content Plan";
export const NOISY_COLS_WORKSHEET_ID = "sheet-noisy-cols-q2";

// Actual column positions in this fixture (0-based)
export const NOISY_COL = {
  date: 0,
  title: 1,
  internalNotes: 2,   // UNKNOWN — must be ignored
  brief: 3,
  linkedinCopy: 4,
  designer: 5,        // UNKNOWN — must be ignored
  published: 6,
  platform: 7,
} as const;

export const noisyColsWorksheet: GoogleSheetsRawWorksheetImport = {
  worksheetId: NOISY_COLS_WORKSHEET_ID,
  worksheetName: NOISY_COLS_WORKSHEET_NAME,
  detectedHeaderRowNumber: 1,
  detectedHeaders: [
    "Date",
    "Title",
    "Internal Notes",   // unknown — not in WORKSHEET_FIELD_ALIASES
    "Copywriter Brief",
    "LinkedIn Copy",
    "Designer",         // unknown — not in WORKSHEET_FIELD_ALIASES
    "Published",
    "Platform",
  ],
  rows: [
    // Row 1 — header
    [
      "Date",
      "Title",
      "Internal Notes",
      "Copywriter Brief",
      "LinkedIn Copy",
      "Designer",
      "Published",
      "Platform",
    ],

    // Row 2 — full editorial row: all known fields at shifted positions
    [
      "2025-06-02",
      "The Future of Remote Work",
      "Approved by PM",              // Internal Notes — must be ignored
      "Cover 3 trends: async, distributed teams, AI tooling.",
      "Remote isn't going away.\n\nBut it is evolving. Here's what to watch for in 2025:",
      "Alice",                        // Designer — must be ignored
      "No",
      "LinkedIn",
    ],

    // Row 3 — brief-only, unknown columns populated but canonical fields correct
    [
      "2025-06-09",
      "Robotics in Manufacturing",
      "Check with legal",
      "Focus on the human-robot collaboration angle.",
      "",
      "Bob",
      "No",
      "LinkedIn",
    ],
  ],
};

// The colMap that buildWorksheetColumnMap() MUST produce for this fixture
export const noisyColsExpectedColMap = {
  plannedDate: 0,
  title: 1,
  // internalNotes: NOT PRESENT (unmapped)
  brief: 3,
  linkedinCopy: 4,
  // designer: NOT PRESENT (unmapped)
  publishedFlag: 6,
  platformLabel: 7,
} as const;

export const noisyColsFixtureExpectations = [
  {
    rowIndex: 1,
    shouldQualify: true,
    extractedFields: {
      plannedDate: "2025-06-02",
      title: "The Future of Remote Work",
      brief: "Cover 3 trends: async, distributed teams, AI tooling.",
      linkedinCopy: "Remote isn't going away.\n\nBut it is evolving. Here's what to watch for in 2025:",
      publishedFlag: undefined,  // "No" maps to no extraction since normalizeBooleanish("No") = false
      platformLabel: "LinkedIn",
    },
    label: "full editorial row with shifted columns",
  },
  {
    rowIndex: 2,
    shouldQualify: true,
    extractedFields: {
      plannedDate: "2025-06-09",
      title: "Robotics in Manufacturing",
      brief: "Focus on the human-robot collaboration angle.",
      linkedinCopy: undefined, // empty cell
    },
    label: "brief-only row with shifted columns",
  },
] as const;
