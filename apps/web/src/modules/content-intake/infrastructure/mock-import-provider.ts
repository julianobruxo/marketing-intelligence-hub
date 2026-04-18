/**
 * Shared row shape used by the spreadsheet parsing and normalization layers.
 *
 * The module name is retained for compatibility, but the fake row factory and
 * synthetic profile catalog were removed so runtime paths no longer populate the
 * app with invented spreadsheet content.
 */
export interface MockSheetRow {
  rowId: string;
  rowNumber: number;
  headerRowNumber: number;
  headers: string[];
  rowValues: string[];
  profile: "YANN" | "YURI" | "SHAWN" | "SOPHIAN_YACINE" | "ZAZMIC_PAGE";
  platformLabel: string;
  contentType: "STATIC_POST" | "CAROUSEL";
  locale: string;
  translationRequired: boolean;
  plannedDate: string;
  sourceAssetLink?: string;
  title: string;
  copyEnglish: string;
  copyPortuguese?: string;
  publishedFlag?: string;
  derivedTitleType: "EXPLICIT_MAPPED_FIELD" | "PROFILE_FALLBACK_FIELD" | "HEURISTIC_LAST_RESORT";
  derivedTitleSource: string;
}
