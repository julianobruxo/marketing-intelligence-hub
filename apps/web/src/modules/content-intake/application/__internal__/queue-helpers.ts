/**
 * Pure helper functions extracted from drive-import-workflow.ts for testability.
 *
 * These functions have NO side effects and NO external dependencies.
 * They are re-exported from drive-import-workflow.ts so no production call-sites change.
 *
 * DO NOT add framework imports (Next.js, Prisma, React) here.
 */

// ---------------------------------------------------------------------------
// Text normalisation helpers
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
// Published-flag normalisation
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
  | "platformLabel"
  | "linkedinCopy"
  | "brief"
  | "publishedPostUrl"
  | "contentDeadline";

export const WORKSHEET_FIELD_ALIASES: Record<WorksheetField, string[]> = {
  plannedDate:      ["date", "planned date"],
  title:            ["title", "post title", "headline", "campaign"],
  publishedFlag:    ["published", "status", "posted"],
  platformLabel:    ["platform", "channel", "account", "person"],
  linkedinCopy:     ["linkedin copy", "linkedin", "linkedin - up to 3000 characters", "copy", "copy (en)", "english copy"],
  brief:            ["copywriter brief", "topic", "idea", "theme", "briefing", "instructions", "notes", "notes for copywriter"],
  publishedPostUrl: ["link to the post", "link to the comments", "post link"],
  contentDeadline:  ["deadline", "content deadline"],
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
        continue; // first matching column wins
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
  has_editorial_brief: boolean;
  has_title: boolean;
  has_final_copy: boolean;
  is_published: boolean;
};

/**
 * Determines whether a row should be admitted as a queue candidate.
 *
 * Deterministic extraction takes precedence over the AI's platform flags so that
 * Substack, teaser, and brief-only rows in LinkedIn planning worksheets are not
 * incorrectly blocked by the AI's is_non_linkedin_platform / is_empty_or_unusable flags.
 * X Account worksheets are excluded upstream (worksheet-level).
 */
export function isRowQueueCandidate(
  aiFlags: AiSemanticFlags,
  det: WorksheetExtractedFields,
): boolean {
  // Deterministic qualification: date + at least one real content signal.
  const detQualified =
    Boolean(det.plannedDate) &&
    (Boolean(det.title) || Boolean(det.brief) || Boolean(det.linkedinCopy));

  if (detQualified) {
    return true;
  }

  // If AI says the row is genuinely empty/unusable and det found nothing, skip it.
  if (aiFlags.is_empty_or_unusable) {
    return false;
  }

  // AI qualification: row has at least one recognizable content signal.
  return (
    aiFlags.has_editorial_brief ||
    aiFlags.has_title ||
    aiFlags.has_final_copy ||
    aiFlags.is_published
  );
}

// ---------------------------------------------------------------------------
// Title derivation fallback
// ---------------------------------------------------------------------------

function truncateTitle(value: string, maxLength = 140): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildFallbackTitle(input: {
  title?: string;
  copy?: string;
  date?: string;
  rowNumber: number;
}): string {
  if (input.title && input.title.trim().length > 0) {
    return input.title.trim();
  }

  if (input.copy && input.copy.trim().length > 0) {
    const [firstLine] = input.copy.trim().split(/\r?\n/);
    return truncateTitle(firstLine.trim());
  }

  if (input.date && input.date.trim().length > 0) {
    return `Planned item - ${input.date.trim()}`;
  }

  return `Planned item - row ${input.rowNumber}`;
}

// ---------------------------------------------------------------------------
// Content signature (for duplicate detection)
// ---------------------------------------------------------------------------

export function buildContentSignature(input: {
  sourceGroup: string;
  plannedDate?: string;
  platformLabel?: string;
  title: string;
  copyEnglish: string;
}): string {
  return normalizeComparableText(
    [
      input.sourceGroup,
      input.plannedDate ?? "",
      input.platformLabel ?? "",
      input.title,
      input.copyEnglish,
    ].join(" | "),
  );
}
