/**
 * Pure helper functions extracted from drive-import-workflow.ts for testability.
 *
 * These functions have NO side effects and NO external dependencies.
 * They are re-exported from drive-import-workflow.ts so no production call-sites change.
 *
 * DO NOT add framework imports (Next.js, Prisma, React) here.
 */

// ---------------------------------------------------------------------------
// Text normalization helpers
// ---------------------------------------------------------------------------

export function normalizeComparableText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse multi-line header to its first line, then lowercase/trim. */
export function normalizeHeaderText(header: string): string {
  const firstLine = header.split(/\r?\n/)[0] ?? header;
  return firstLine.trim().toLowerCase();
}

function tokenizeComparableText(value: string): string[] {
  return normalizeComparableText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

export function scoreComparableText(left: string, right: string): number {
  const leftTokens = new Set(tokenizeComparableText(left));
  const rightTokens = new Set(tokenizeComparableText(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Published-flag normalization
// ---------------------------------------------------------------------------

export function normalizeBooleanish(value: string | boolean | undefined | null): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === "yes" ||
    normalized === "true" ||
    normalized === "published" ||
    normalized === "done" ||
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "live"
  );
}

// ---------------------------------------------------------------------------
// Worksheet-level X/Twitter exclusion
// ---------------------------------------------------------------------------

export const X_ACCOUNT_WORKSHEET_PATTERN =
  /\b(x\s+account|x\.com|twitter(?:\s*\/?\\s*x)?)\b|^\s*x\s*$/i;

export function isXAccountWorksheet(worksheetName: string): boolean {
  return X_ACCOUNT_WORKSHEET_PATTERN.test(worksheetName.trim());
}

// ---------------------------------------------------------------------------
// Deterministic column mapping & row extraction
// ---------------------------------------------------------------------------

export type WorksheetField =
  | "plannedDate"
  | "title"
  | "publishedFlag"
  | "linkedinCopy"
  | "sourceAssetLink"
  | "contentDeadline";

export const WORKSHEET_FIELD_ALIASES: Record<WorksheetField, string[]> = {
  plannedDate: ["date", "planned date", "data"],
  title: ["title", "titulo", "tÃƒÆ’Ã‚Â­tulo", "post title", "headline", "campaign"],
  publishedFlag: ["published", "published?", "publicado", "status", "posted"],
  linkedinCopy: [
    "linkedin copy",
    "linkedin",
    "linkedin - up to 3000 characters",
    "copy",
    "copy (en)",
    "english copy",
    "linkedin copy english",
    "linkedin copy french",
  ],
  sourceAssetLink: ["link img", "img link", "image link"],
  contentDeadline: ["deadline", "content deadline"],
};

export type WorksheetColumnMap = Partial<Record<WorksheetField, number>>;
export type WorksheetExtractedFields = Partial<Record<WorksheetField, string>>;

export function buildWorksheetColumnMap(headers: string[]): WorksheetColumnMap {
  const colMap: WorksheetColumnMap = {};

  for (let i = 0; i < headers.length; i++) {
    const headerNorm = normalizeHeaderText(headers[i]);
    if (!headerNorm) {
      continue;
    }

    for (const [field, aliases] of Object.entries(WORKSHEET_FIELD_ALIASES) as [WorksheetField, string[]][]) {
      if (colMap[field] !== undefined) {
        continue;
      }
      if (aliases.includes(headerNorm)) {
        colMap[field] = i;
      }
    }
  }

  return colMap;
}

export function extractColumnarRowFields(
  colMap: WorksheetColumnMap,
  rowValues: string[],
): WorksheetExtractedFields {
  const result: WorksheetExtractedFields = {};

  for (const [field, colIndex] of Object.entries(colMap) as [WorksheetField, number][]) {
    const cellValue = rowValues[colIndex]?.trim();
    if (cellValue) {
      result[field] = cellValue;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Queue candidate qualification
// ---------------------------------------------------------------------------

export type AiSemanticFlags = {
  is_empty_or_unusable: boolean;
  has_title: boolean;
  has_final_copy: boolean;
  is_published: boolean;
};

/**
 * Queue admission is intentionally spreadsheet-driven.
 *
 * Only explicit operational spreadsheet fields should decide whether a row is a
 * real queue candidate. AI semantic hints may still exist for observability, but
 * they do not admit a row on their own.
 */
export function isRowQueueCandidate(
  aiFlags: AiSemanticFlags,
  det: WorksheetExtractedFields,
): boolean {
  void aiFlags;

  // Only a genuinely positive published marker (Yes/true/done/live) counts as a signal.
  // A "No" value in the Published column is not a qualifying operational signal.
  const hasPublishedSignal = normalizeBooleanish(det.publishedFlag);
  const hasOperationalTitle = Boolean(det.title);
  const hasOperationalCopy = Boolean(det.linkedinCopy);
  const hasOperationalAsset = Boolean(det.sourceAssetLink);
  const hasSchedulingContext =
    Boolean(det.plannedDate) ||
    Boolean(det.contentDeadline) ||
    hasPublishedSignal;

  return (
    hasPublishedSignal ||
    hasOperationalTitle ||
    hasOperationalCopy ||
    (hasOperationalAsset && hasSchedulingContext)
  );
}

// ---------------------------------------------------------------------------
// Title derivation fallback
// ---------------------------------------------------------------------------

// Single-word labels that appear as the first line of a brief or copy column
// to identify the platform/content type rather than the actual content.
const GENERIC_CONTENT_LABELS = new Set([
  "linkedin",
  "substack",
  "video",
  "photo",
  "photos",
  "infographic",
  "banner",
  "newsletter",
  "post",
  "reel",
  "story",
  "carousel",
  "thread",
  "paidarticle",
  "freearticle",
  "article",
  "news",
]);

export function isGenericContentLabel(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.length > 0 && GENERIC_CONTENT_LABELS.has(normalized);
}

/**
 * Returns the first line from a multi-line text block that represents real content,
 * skipping platform labels ("LinkedIn", "Substack"), very short tokens, URLs, and
 * lines made up entirely of bullets or numbers.
 */
export function deriveFirstMeaningfulLine(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    if (line.length < 4) continue;
    if (line.startsWith("http")) continue;
    if (/^[\d\-*•/]+$/.test(line)) continue;
    if (isGenericContentLabel(line)) continue;
    return line;
  }

  return undefined;
}

function truncateTitle(value: string, maxLength = 140): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

export function buildFallbackTitle(input: {
  title?: string;
  copy?: string;
  date?: string;
  rowNumber: number;
}): string {
  void input.copy;

  if (input.title && input.title.trim().length > 0) {
    return truncateTitle(input.title.trim());
  }

  if (input.date && input.date.trim().length > 0) {
    return `Post - ${input.date.trim()}`;
  }

  return `Post - row ${input.rowNumber}`;
}

// ---------------------------------------------------------------------------
// Content signature (for duplicate detection)
// ---------------------------------------------------------------------------

export function buildContentSignature(input: {
  sourceGroup: string;
  plannedDate?: string;
  title: string;
  copyEnglish: string;
}): string {
  return normalizeComparableText(
    [
      input.sourceGroup,
      input.plannedDate ?? "",
      input.title,
      input.copyEnglish,
    ].join(" | "),
  );
}
