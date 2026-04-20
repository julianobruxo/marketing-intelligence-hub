/**
 * Fixture: Matt-style worksheet.
 *
 * Representative of a different operator's content plan format.
 * Key characteristics:
 *   - Header on row 1
 *   - Columns use alternative alias names: "Planned Date", "Post Title", "Topic", "Copy (EN)", "Status", "Channel"
 *   - "Status" maps to publishedFlag (alias: "status")
 *   - "Topic" maps to brief (alias: "topic")
 *   - "Copy (EN)" maps to linkedinCopy (alias: "copy (en)")
 *   - Includes a row with a post-URL as publication evidence (PUBLISHED path without "Yes" flag)
 *   - Includes a row where copy is present but deadline is past (LATE path)
 *   - Includes a row with hashtag block header — must NOT qualify
 *
 * Previously broke: "Status" column was not mapped as publishedFlag, causing
 * published rows to appear as WAITING_FOR_COPY. "Topic" was not mapped as brief,
 * causing brief-only rows to fail deterministic qualification.
 */

import type { GoogleSheetsRawWorksheetImport } from "@/modules/content-intake/infrastructure/google-sheets-provider";

export const MATT_WORKSHEET_NAME = "May 2025";
export const MATT_WORKSHEET_ID = "sheet-matt-may-2025";

export const MATT_COL = {
  plannedDate: 0,
  postTitle: 1,
  topic: 2,
  copyEn: 3,
  status: 4,
  channel: 5,
  postLink: 6,
} as const;

export const mattWorksheet: GoogleSheetsRawWorksheetImport = {
  worksheetId: MATT_WORKSHEET_ID,
  worksheetName: MATT_WORKSHEET_NAME,
  detectedHeaderRowNumber: 1,
  detectedHeaders: [
    "Planned Date",
    "Post Title",
    "Topic",
    "Copy (EN)",
    "Status",
    "Channel",
    "Link to the post",
  ],
  rows: [
    // Row 1 — header row
    [
      "Planned Date",
      "Post Title",
      "Topic",
      "Copy (EN)",
      "Status",
      "Channel",
      "Link to the post",
    ],

    // Row 2 — standard LinkedIn post with full copy, unpublished: READY_FOR_DESIGN
    [
      "2025-05-05",
      "5 Lessons from Scaling to 100 Employees",
      "Leadership & growth milestones",
      "Scaling a company from 10 to 100 people teaches you things no MBA can.\n\nHere are 5 I wish someone had told me:",
      "No",
      "LinkedIn",
      "",
    ],

    // Row 3 — published via post URL (no "Yes" flag, but link present): PUBLISHED
    [
      "2025-04-28",
      "April AI Digest",
      "AI industry recap",
      "April was a big month for AI. Here's what you may have missed.",
      "",
      "LinkedIn",
      "https://linkedin.com/posts/matt-ai-digest-april-2025",
    ],

    // Row 4 — past deadline, has copy: LATE
    [
      "2025-01-15",
      "New Year Strategy",
      "Q1 planning and goal setting",
      "January is the best month to reset your strategy.\n\nHere's the framework we use.",
      "No",
      "LinkedIn",
      "2025-01-10",
    ],

    // Row 5 — topic-only (brief without copy, no title): WAITING_FOR_COPY — must qualify
    [
      "2025-05-12",
      "",
      "Hiring and onboarding remote engineers",
      "",
      "No",
      "LinkedIn",
      "",
    ],

    // Row 6 — hashtag block decorative row: must NOT qualify
    ["Hashtags", "#leadership #AI #growth", "", "", "", "", ""],

    // Row 7 — week separator (PT variant): must NOT qualify
    ["Semana 2", "", "", "", "", "", ""],
  ],
};

/**
 * Queue-candidate qualification expectations for isRowQueueCandidate().
 * Note: hashtag rows pass isRowQueueCandidate because "Hashtags" sits in the
 * date column and "#leadership..." sits in the title column. They are blocked
 * by the postAiFilterRow() gate upstream — a different function.
 * The Semana separator has no valid content signal in any column, so it fails
 * deterministic qualification outright.
 */
export const mattFixtureExpectations = [
  { rowIndex: 1, shouldQualify: true,  publishedPath: false, label: "LinkedIn post full copy" },
  { rowIndex: 2, shouldQualify: true,  publishedPath: true,  label: "published via post URL" },
  { rowIndex: 3, shouldQualify: true,  publishedPath: false, label: "past-deadline post (LATE)" },
  { rowIndex: 4, shouldQualify: true,  publishedPath: false, label: "topic-only brief row" },
  // Hashtag row: isRowQueueCandidate=TRUE ("Hashtags" in date col + title-like text).
  // Final exclusion is handled by postAiFilterRow() via DETERMINISTIC_SKIP_PATTERNS.
  { rowIndex: 5, shouldQualify: true,  publishedPath: false, label: "hashtag block header (blocked by postAiFilterRow, not isRowQueueCandidate)" },
  { rowIndex: 6, shouldQualify: false, publishedPath: false, label: "Semana 2 separator" },
] as const;
