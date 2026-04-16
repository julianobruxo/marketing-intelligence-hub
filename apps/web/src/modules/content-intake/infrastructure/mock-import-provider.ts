import { zazmicBrazilPlanningProfile, yannKronbergPlanningProfile } from "../domain/sheet-profiles";
import type { NormalizeSheetRowRequest } from "../domain/normalize-sheet-request";

/**
 * Returns the list of known sheet profiles for the UI selector.
 * This is the single source of truth — the same profiles used by normalizeSheetRow.
 */
export const AVAILABLE_SHEET_PROFILES = [
  {
    key: zazmicBrazilPlanningProfile.key,
    version: zazmicBrazilPlanningProfile.version,
    spreadsheetId: zazmicBrazilPlanningProfile.spreadsheetId,
    spreadsheetName: zazmicBrazilPlanningProfile.spreadsheetName,
    description: "Monthly LinkedIn planning sheet for Zazmic Brazil",
  },
  {
    key: yannKronbergPlanningProfile.key,
    version: yannKronbergPlanningProfile.version,
    spreadsheetId: yannKronbergPlanningProfile.spreadsheetId,
    spreadsheetName: yannKronbergPlanningProfile.spreadsheetName,
    description: "SMM Plan covering LinkedIn and Substack properties for Yann Kronberg.",
  },
] as const;

export type AvailableSheetProfile = (typeof AVAILABLE_SHEET_PROFILES)[number];

// ─── Mock rows ────────────────────────────────────────────────────────────────

/**
 * Headers WITH Portuguese version — only used for rows that actually have PT content.
 * Rows without PT content must NOT include this header because normalize-sheet-row
 * would then read "" from the cell and fail z.string().min(1).optional() validation.
 */
const HEADERS_WITH_PT = [
  "Date",
  "Platform",
  "Campaign",
  "Linkedin",
  "Portuguese version",
  "Content Deadline",
  "Published",
];

/** Headers WITHOUT Portuguese version — used for all rows that have no PT content. */
const HEADERS_NO_PT = [
  "Date",
  "Platform",
  "Campaign",
  "Linkedin",
  "Content Deadline",
  "Published",
];

export interface MockSheetRow {
  rowId: string;
  rowNumber: number;
  headerRowNumber: number;
  headers: string[];
  rowValues: string[];
  profile: "YANN" | "YURI" | "SHAWN" | "SOPHIAN_YACINE" | "ZAZMIC_PAGE";
  contentType: "STATIC_POST" | "CAROUSEL";
  locale: string;
  translationRequired: boolean;
  /** Override the rowId used for the idempotency key (used for the seeded duplicate). */
  overrideRowId?: string;
}

/**
 * Returns a fixed set of mock rows covering all outcome types:
 * - 4 new valid rows (IMPORTED outcome)
 * - 1 duplicate (matches seeded item row-66 → DUPLICATE outcome)
 * - 1 skipped (non-data "week 1" pattern → SKIPPED)
 * - 1 rejected (empty copyEnglish → REJECTED)
 */
export function getMockSheetRows(
  _sheetProfileKey: string,
  worksheetName: string,
): MockSheetRow[] {
  const wsSlug = worksheetName.toLowerCase().replace(/\s+/g, "-");

  return [
    // Row 1 — new, SHAWN, no PT content
    {
      rowId: `mock-${wsSlug}-row-101`,
      rowNumber: 13,
      headerRowNumber: 12,
      headers: HEADERS_NO_PT,
      rowValues: [
        "2026-04-21",
        "LinkedIn",
        "How browser security impacts enterprise risk",
        "Enterprises that rely on unmanaged browsers expose themselves to credential theft, supply-chain attacks, and shadow IT risks that traditional endpoint security doesn't cover.",
        "2026-04-20",
        "",
      ],
      profile: "SHAWN",
      contentType: "STATIC_POST",
      locale: "en",
      translationRequired: false,
    },
    // Row 2 — new, SHAWN, no PT content
    {
      rowId: `mock-${wsSlug}-row-102`,
      rowNumber: 14,
      headerRowNumber: 12,
      headers: HEADERS_NO_PT,
      rowValues: [
        "2026-04-28",
        "LinkedIn",
        "Remote team productivity in 2026",
        "Remote teams that standardize on managed browsers cut IT overhead by 40% while improving security posture — here is how the top enterprises are doing it.",
        "2026-04-27",
        "",
      ],
      profile: "SHAWN",
      contentType: "STATIC_POST",
      locale: "en",
      translationRequired: false,
    },
    // Row 3 — new, SOPHIAN_YACINE, WITH Portuguese content
    {
      rowId: `mock-${wsSlug}-row-103`,
      rowNumber: 15,
      headerRowNumber: 12,
      headers: HEADERS_WITH_PT,
      rowValues: [
        "2026-05-05",
        "LinkedIn",
        "Chrome Enterprise security features overview",
        "Chrome Enterprise gives IT teams centralized control over browser policies, extensions, and data loss prevention — without locking employees out of the tools they need.",
        "O Chrome Enterprise oferece controle centralizado sobre políticas de navegador.",
        "2026-05-04",
        "",
      ],
      profile: "SOPHIAN_YACINE",
      contentType: "STATIC_POST",
      locale: "en",
      translationRequired: true,
    },
    // Row 4 — DUPLICATE — overrides rowId to match the seeded item (spreadsheetId=zazmic-brazil-smm-plan)
    {
      rowId: `mock-${wsSlug}-row-104`,
      rowNumber: 16,
      headerRowNumber: 12,
      headers: HEADERS_NO_PT,
      rowValues: [
        "2026-04-19",
        "LinkedIn",
        "Browser risk awareness",
        "This item is seeded as design ready so the queue can clearly show a handoff waiting on operator approval.",
        "",
        "",
      ],
      profile: "SHAWN",
      contentType: "STATIC_POST",
      locale: "en",
      translationRequired: false,
      overrideRowId: "row-66",
    },
    // Row 5 — SKIPPED — "week 1" matches the profile's skipRowWhenAnyCellMatches list.
    // NB: copyEnglish is non-empty here to avoid ZodError during contentIngestionPayloadSchema.parse()
    // at normalizeSheetRow line 141 — qualifySheetRow returns SKIPPED_NON_DATA before the
    // required-field check fires, but the full schema parse still runs afterward.
    {
      rowId: `mock-${wsSlug}-row-105`,
      rowNumber: 17,
      headerRowNumber: 12,
      headers: HEADERS_NO_PT,
      rowValues: ["Week 1", "", "", "placeholder — non-data row", "", ""],
      profile: "SHAWN",
      contentType: "STATIC_POST",
      locale: "en",
      translationRequired: false,
    },
    // Row 6 — REJECTED — missing required plannedDate (both plannedDate and copyEnglish are in
    // minimumMappedFields). copyEnglish IS provided so the schema parse doesn't throw; plannedDate
    // is empty so qualifySheetRow returns REJECTED_INVALID with a readable reason.
    {
      rowId: `mock-${wsSlug}-row-106`,
      rowNumber: 18,
      headerRowNumber: 12,
      headers: HEADERS_NO_PT,
      rowValues: [
        "", // plannedDate intentionally empty → REJECTED_INVALID (missing required field)
        "LinkedIn",
        "Untitled post placeholder",
        "This post is missing a planned date and cannot be imported automatically.",
        "",
        "",
      ],
      profile: "SHAWN",
      contentType: "STATIC_POST",
      locale: "en",
      translationRequired: false,
    },
    // Row 7 — new, SHAWN, no PT content
    {
      rowId: `mock-${wsSlug}-row-107`,
      rowNumber: 19,
      headerRowNumber: 12,
      headers: HEADERS_NO_PT,
      rowValues: [
        "2026-05-19",
        "LinkedIn",
        "Enterprise browser management best practices",
        "Managing browsers at enterprise scale requires policy enforcement, extension control, and certificate management — here are the five practices that matter most in 2026.",
        "2026-05-18",
        "",
      ],
      profile: "SHAWN",
      contentType: "STATIC_POST",
      locale: "en",
      translationRequired: false,
    },
  ];
}

/**
 * Builds a NormalizeSheetRowRequest for a given mock row.
 */
export function buildNormalizeRequest(
  row: MockSheetRow,
  sheetProfileKey: string,
  worksheetName: string,
  mode: "PREVIEW" | "COMMIT",
): NormalizeSheetRowRequest {
  // For the seeded duplicate, use the exact spreadsheet/worksheet from seed data
  const isSeededDuplicate = Boolean(row.overrideRowId);
  const spreadsheetId = isSeededDuplicate
    ? "zazmic-brazil-smm-plan"
    : `mock-import-${sheetProfileKey}`;
  const worksheetId = isSeededDuplicate
    ? "apr-2026"
    : `mock-ws-${worksheetName.toLowerCase().replace(/\s+/g, "-")}`;

  return {
    version: 1,
    mode,
    orchestrator: "MANUAL",
    sheetProfileKey,
    source: {
      spreadsheetId,
      spreadsheetName: "Mock Import — UI Surface",
      worksheetId,
      worksheetName,
      rowId: row.overrideRowId ?? row.rowId,
      rowNumber: row.rowNumber,
      rowVersion: "mock-v1",
      headerRowNumber: row.headerRowNumber,
      headers: row.headers,
      rowValues: row.rowValues,
    },
    worksheetSelection: {
      availableWorksheets: [{ worksheetId, worksheetName }],
    },
    contentHints: {
      profile: row.profile,
      contentType: row.contentType,
      locale: row.locale,
      translationRequired: row.translationRequired,
    },
  };
}
