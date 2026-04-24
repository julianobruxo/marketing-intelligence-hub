/**
 * Fixture: Yann-style LinkedIn + Substack worksheet.
 *
 * Representative of Yann's actual content planning spreadsheet structure.
 * Key characteristics:
 *   - Header is on row 1 (no top-sheet admin noise)
 *   - Standard column set: Date | Title | Copywriter Brief | LinkedIn Copy | Published | Platform | Deadline
 *   - Includes a LinkedIn row with full copy (READY_FOR_DESIGN path)
 *   - Includes a Substack teaser row (brief-only, no LinkedIn copy) — must qualify
 *   - Includes a published row (PUBLISHED path)
 *   - Includes a brief-only row without copy (WAITING_FOR_COPY path)
 *   - Includes a decorative "Week 1" separator row — must NOT qualify
 *
 * Previously broke: Substack/teaser rows were blocked by AI's is_non_linkedin_platform flag
 * before deterministic qualification was given precedence.
 */

import type { GoogleSheetsRawWorksheetImport } from "@/modules/content-intake/infrastructure/google-sheets-provider";

export const YANN_WORKSHEET_NAME = "April 2025";
export const YANN_WORKSHEET_ID = "sheet-yann-april-2025";

// Row layout indices (0-based, matching header row below)
export const YANN_COL = {
  date: 0,
  title: 1,
  brief: 2,
  linkedinCopy: 3,
  published: 4,
  platform: 5,
  deadline: 6,
} as const;

/**
 * Raw worksheet as returned by the Google Sheets API (before any processing).
 * Row 0 = header row. Rows 1–6 = data rows. Row 5 = decorative separator.
 */
export const yannWorksheet: GoogleSheetsRawWorksheetImport = {
  worksheetId: YANN_WORKSHEET_ID,
  worksheetName: YANN_WORKSHEET_NAME,
  detectedHeaderRowNumber: 1,
  detectedHeaders: [
    "Date",
    "Title",
    "Copywriter Brief",
    "LinkedIn Copy",
    "Published",
    "Platform",
    "Deadline",
  ],
  rows: [
    // Row 1 — header
    ["Date", "Title", "Copywriter Brief", "LinkedIn Copy", "Published", "Platform", "Deadline"],

    // Row 2 — LinkedIn post with full copy: READY_FOR_DESIGN
    [
      "2025-04-07",
      "Why AI won't replace your team",
      "Focus on augmentation over replacement. Include 3 examples.",
      "The question isn't whether AI will change work — it already has.\n\nThe question is whether you're using it to amplify your team or replace it.",
      "No",
      "LinkedIn",
      "2025-04-05",
    ],

    // Row 3 — Substack teaser: date + brief, no LinkedIn copy — must qualify (WAITING_FOR_COPY)
    [
      "2025-04-14",
      "Newsletter: Q1 Retrospective",
      "Summarise Q1 results for Substack readers. Focus on community growth.",
      "",
      "No",
      "Substack",
      "2025-04-12",
    ],

    // Row 4 — brief-only, no copy, no title — must qualify (WAITING_FOR_COPY)
    [
      "2025-04-21",
      "",
      "Write about the leadership lessons from our last sprint review.",
      "",
      "No",
      "LinkedIn",
      "2025-04-19",
    ],

    // Row 5 — published row: must qualify with PUBLISHED status
    [
      "2025-03-31",
      "Q1 Wrap-Up",
      "Summary of the quarter.",
      "Q1 is done. Here's what we built, shipped, and learned.",
      "Yes",
      "LinkedIn",
      "2025-03-28",
    ],

    // Row 6 — decorative separator: must NOT qualify
    ["Week 1", "", "", "", "", "", ""],

    // Row 7 — empty row: must NOT qualify
    ["", "", "", "", "", "", ""],
  ],
};

/**
 * Expected qualification decisions for each data row (rows 2–7 in the sheet = indices 1–6 in rows[]).
 * Used by fixture-consuming tests to assert pipeline behaviour without re-deriving the logic.
 */
export const yannFixtureExpectations = [
  { rowIndex: 1, shouldQualify: true,  publishedPath: false, label: "LinkedIn post with full copy" },
  { rowIndex: 2, shouldQualify: true,  publishedPath: false, label: "Substack teaser brief-only" },
  { rowIndex: 3, shouldQualify: false, publishedPath: false, label: "brief-only no title no copy — not an operational row" },
  { rowIndex: 4, shouldQualify: true,  publishedPath: true,  label: "published row" },
  { rowIndex: 5, shouldQualify: false, publishedPath: false, label: "Week 1 separator" },
  { rowIndex: 6, shouldQualify: false, publishedPath: false, label: "empty row" },
] as const;
