/**
 * Fixture: X Account worksheet — must be fully excluded before any processing.
 *
 * Represents the X/Twitter account management worksheets that appear in some
 * LinkedIn planning spreadsheets as sibling tabs. These tabs contain Twitter
 * credentials, post drafts for X, and social profile metadata — none of which
 * belongs in the LinkedIn queue.
 *
 * Key characteristics:
 *   - Several worksheet name variants must ALL be excluded at the worksheet level
 *   - Exclusion must happen BEFORE AI analysis (the AI is never called for these)
 *   - The rows themselves look like real content and would fool a row-level filter
 *   - This fixture provides the name variants AND a representative row set to confirm
 *     that even if a row somehow slipped through, isXAccountWorksheet would have caught it
 *
 * Previously broke: X Account rows reached the AI analysis phase and were classified
 * as LinkedIn content because the copy looked like real posts. Adding worksheet-level
 * exclusion upstream fixed this, but the fix must be regression-tested.
 *
 * Worksheet name variants that must all be excluded:
 *   "X Account", "x account", "X.com", "x.com", "Twitter", "twitter",
 *   "Twitter/X", "twitter/x", "X", "x"
 */

import type { GoogleSheetsRawWorksheetImport } from "@/modules/content-intake/infrastructure/google-sheets-provider";

/** All X/Twitter worksheet name variants that must be excluded. */
export const X_ACCOUNT_WORKSHEET_NAME_VARIANTS = [
  "X Account",
  "x account",
  "X.com",
  "x.com",
  "Twitter",
  "twitter",
  "Twitter/X",
  "twitter/x",
  "Twitter / X",
  "X",
  " x ",       // leading/trailing spaces
  "X ACCOUNT",
] as const;

export type XAccountWorksheetName = (typeof X_ACCOUNT_WORKSHEET_NAME_VARIANTS)[number];

/**
 * A single representative X Account worksheet.
 * Rows intentionally look like real content to prove that worksheet-level
 * exclusion must happen before any row-level or AI qualification.
 */
export const xAccountWorksheet: GoogleSheetsRawWorksheetImport = {
  worksheetId: "sheet-x-account-001",
  worksheetName: "X Account",  // canonical excluded name
  detectedHeaderRowNumber: null, // no clean header detected — admin noise on row 1
  detectedHeaders: [],
  rows: [
    // Row 1 — admin noise / profile metadata block (typical X account sheets)
    ["X (Twitter) Account", "Username", "@zazmic", "Followers", "12,400"],

    // Row 2 — credentials row (typical X account sheet structure)
    ["Email", "twitter@zazmic.com", "Password", "[redacted]", ""],

    // Rows 3-4 — X-specific post drafts that look like real content
    // These rows would qualify as LinkedIn content if row-level logic were applied
    [
      "2025-04-07",
      "",
      "AI is changing hiring faster than most recruiters realize.",
      "Yes",
      "",
    ],
    [
      "2025-04-14",
      "Weekly AI Roundup",
      "5 stories you need to know this week.",
      "No",
      "",
    ],
  ],
};

/**
 * Worksheet name variants that are NOT X/Twitter and must NOT be excluded.
 * Included here to prevent over-eager pattern matching.
 */
export const NON_X_WORKSHEET_NAMES = [
  "LinkedIn",
  "April 2025",
  "Yann Content Plan",
  "Q2",
  "Shawn",
  "Brazil",
  "Operations",
  "Substack",
  "Company Page",
  "Zazmic Page",
] as const;
