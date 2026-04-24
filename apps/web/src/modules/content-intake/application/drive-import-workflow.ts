"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  DriveConflictConfidence,
  DriveImportBatchStatus,
  DriveReimportStrategy,
  DriveSpreadsheetRowState,
  DriveSpreadsheetState,
  ContentProfile,
  Prisma,
  type SpreadsheetImportBatch,
  type SpreadsheetImportRow,
  type UpstreamSystem,
} from "@prisma/client";
import { requireSession } from "@/modules/auth/application/auth-service";
import { importContentItem } from "@/modules/content-intake/application/import-content-item";
import {
  readGoogleSpreadsheetImport,
  readGoogleSpreadsheetWorkbook,
  type GoogleSheetsParsedRow,
  type GoogleSheetsRawSpreadsheetImport,
  type GoogleSheetsRawWorksheetImport,
} from "@/modules/content-intake/infrastructure/google-sheets-provider";
import {
  getDriveImportSpreadsheetById,
  getDriveImportSpreadsheetCount,
  getDriveImportSourceGroups,
  listDriveImportSpreadsheets,
  scanDriveImportSpreadsheets,
  type DriveSpreadsheetRecord,
  type DriveSourceGroupFilter,
} from "@/modules/content-intake/infrastructure/drive-import-catalog";
import { generateMockTranslationDraft } from "@/modules/translation/application/generate-translation";
import { getPrisma } from "@/shared/lib/prisma";
import { logEvent } from "@/shared/logging/logger";
import {
  analyzeSheetWithAI,
  type AiSheetAnalysisResult,
  type AiSheetAnalysisRow,
} from "./ai-sheet-analyzer";
import {
  hasImageLink,
  hasRealCopy,
  inferContentRouting,
} from "../domain/infer-content-status";
import {
  contentIngestionPayloadSchema,
  type ContentIngestionPayload,
} from "../domain/ingestion-contract";
import {
  normalizeComparableText,
  scoreComparableText,
  isXAccountWorksheet,
  buildWorksheetColumnMap,
  extractColumnarRowFields,
  isRowQueueCandidate as _isRowQueueCandidate,
  buildFallbackTitle,
  buildContentSignature as _buildContentSignature,
  type WorksheetExtractedFields,
  type AiSemanticFlags,
} from "./__internal__/queue-helpers";

export type DriveImportScanRequest = {
  query?: string;
  sourceGroup?: DriveSourceGroupFilter;
  page?: number;
  pageSize?: number;
};

export type DriveImportScanResponse = Awaited<ReturnType<typeof scanDriveImportSpreadsheets>>;

export type DriveImportStageRequest = {
  driveFileIds: string[];
  reimportStrategy?: DriveReimportStrategy;
};

export type StagedSpreadsheetSnapshot = {
  id: string;
  driveFileId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  folderName: string;
  owner: string;
  sourceGroup: string;
  lastUpdatedAt: string | null;
  state: DriveSpreadsheetState;
  reimportStrategy: DriveReimportStrategy;
  importedAt: string;
  queuedAt: string | null;
  validWorksheetCount: number;
  totalRowsDetected: number;
  qualifiedRowsDetected: number;
  conflictRowsDetected: number;
  alreadyPublishedRowCount: number;
  importedRowCount: number;
  updatedRowCount: number;
  replacedRowCount: number;
  keptRowCount: number;
  skippedRowCount: number;
  rejectedRowCount: number;
  sourceContext: Record<string, unknown>;
  pipelineSignals: Record<string, unknown>;
};

export type StagedRowSnapshot = {
  id: string;
  batchId: string;
  worksheetId: string;
  worksheetName: string;
  rowId: string;
  rowNumber: number | null;
  rowVersion: string | null;
  rowStatus: DriveSpreadsheetRowState;
  conflictConfidence: DriveConflictConfidence;
  conflictAction: DriveReimportStrategy | null;
  existingContentItemId: string | null;
  contentItemId: string | null;
  title: string;
  idea: string | null;
  copy: string;
  translationDraft: string | null;
  plannedDate: string | null;
  publishedFlag: string | null;
  publishedPostUrl: string | null;
  sourceAssetLink: string | null;
  reason: string | null;
  matchSignals: Record<string, unknown>;
  rowPayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown> | null;
  conflictSuggestion: Record<string, unknown> | null;
};

export type ImportToStagingResult = {
  scanned: number;
  staged: number;
  conflicts: number;
  publishedRows: number;
  spreadsheets: StagedSpreadsheetSnapshot[];
};

export type QueueSendResult = {
  spreadsheetId: string;
  spreadsheetImportId: string;
  sentRows: number;
  createdRows: number;
  updatedRows: number;
  replacedRows: number;
  keptRows: number;
  publishedRows: number;
  skippedRows: number;
  rejectedRows: number;
  conflicts: number;
  receiptIds: string[];
  contentItemIds: string[];
  state: DriveSpreadsheetState;
};

function sanitizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .slice(0, 10000)
    .trim();
}

function sanitizeJsonLikeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeCellValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonLikeValue(entry));
  }

  if (value && typeof value === "object") {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        sanitizeCellValue(key),
        sanitizeJsonLikeValue(entry),
      ]),
    );
  }

  return value;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logEvent("error", "[IMPORT] JSON parse failed", {
      error: error instanceof Error ? error.message : String(error),
      preview: raw.slice(0, 200),
    });
    return fallback;
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(sanitizeJsonLikeValue(value));
  if (!serialized) {
    return {} as Prisma.InputJsonValue;
  }

  return safeJsonParse<Prisma.InputJsonValue>(serialized, {} as Prisma.InputJsonValue);
}

function hashStablePayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(sanitizeJsonLikeValue(value))).digest("hex");
}

function toSpreadsheetState(status: DriveImportBatchStatus): DriveSpreadsheetState {
  switch (status) {
    case DriveImportBatchStatus.SENT_TO_QUEUE:
      return DriveSpreadsheetState.SENT_TO_QUEUE;
    case DriveImportBatchStatus.PARTIALLY_SENT:
      return DriveSpreadsheetState.PARTIALLY_SENT;
    case DriveImportBatchStatus.NEEDS_REIMPORT_DECISION:
      return DriveSpreadsheetState.NEEDS_REIMPORT_DECISION;
    default:
      return DriveSpreadsheetState.STAGED;
  }
}

// normalizeComparableText, normalizeHeaderText, scoreComparableText imported from __internal__/queue-helpers

function inferContentProfileFromSourceGroup(sourceGroup: string): ContentProfile {
  switch (sourceGroup) {
    case "Yann":
      return ContentProfile.YANN;
    case "Yuri":
      return ContentProfile.YURI;
    case "Shawn":
      return ContentProfile.SHAWN;
    case "Sophian":
      return ContentProfile.SOPHIAN_YACINE;
    case "Brazil":
    case "North":
    case "Operations":
    default:
      return ContentProfile.ZAZMIC_PAGE;
  }
}

function buildContentSignature(row: GoogleSheetsParsedRow, sourceGroup: string) {
  return _buildContentSignature({
    sourceGroup,
    plannedDate: row.planningFields.plannedDate,
    title: row.titleDerivation.title,
    copyEnglish: row.planningFields.copyEnglish,
  });
}

function buildDeterministicRowId(input: {
  spreadsheetId: string;
  worksheetName: string;
  rowNumber: number;
}) {
  const normalizedWorksheetName = input.worksheetName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  return [input.spreadsheetId, normalizedWorksheetName || "worksheet", `row-${input.rowNumber}`].join(":");
}

function optionalTrimmed(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildOperationalRawRow(input: {
  plannedDate?: string;
  campaignLabel?: string;
  copyEnglish: string;
  sourceAssetLink?: string;
  contentDeadline?: string;
  publishedFlag?: string | boolean;
}) {
  const rawRow: Record<string, string | boolean> = {
    "LinkedIn Copy": input.copyEnglish,
  };

  if (input.plannedDate?.trim()) {
    rawRow.Date = input.plannedDate.trim();
  }

  if (input.campaignLabel?.trim()) {
    rawRow.Title = input.campaignLabel.trim();
  }

  if (input.sourceAssetLink?.trim()) {
    rawRow["IMG LINK"] = input.sourceAssetLink.trim();
  }

  if (input.contentDeadline?.trim()) {
    rawRow["Content Deadline"] = input.contentDeadline.trim();
  }

  if (typeof input.publishedFlag === "string") {
    if (input.publishedFlag.trim()) {
      rawRow.Published = input.publishedFlag.trim();
    }
  } else if (typeof input.publishedFlag === "boolean") {
    rawRow.Published = input.publishedFlag;
  }

  return rawRow;
}

function isAiRowQualified(row: AiSheetAnalysisRow) {
  if (row.semantic.is_empty_or_unusable) {
    return false;
  }

  return (
    row.semantic.has_title ||
    row.semantic.has_final_copy ||
    row.semantic.is_published
  );
}

// X_ACCOUNT_WORKSHEET_PATTERN, isXAccountWorksheet, isRowQueueCandidate imported from __internal__/queue-helpers

// Adapter: AiSheetAnalysisRow -> AiSemanticFlags for the shared helper.
function isRowQueueCandidate(
  aiRow: AiSheetAnalysisRow,
  det: WorksheetExtractedFields,
): boolean {
  const flags: AiSemanticFlags = {
    is_empty_or_unusable: aiRow.semantic.is_empty_or_unusable,
    has_title: aiRow.semantic.has_title,
    has_final_copy: aiRow.semantic.has_final_copy,
    is_published: aiRow.semantic.is_published,
  };
  return _isRowQueueCandidate(flags, det);
}

function deriveAiRowConfidence(row: AiSheetAnalysisRow): "HIGH" | "MEDIUM" | "LOW" {
  if (row.semantic.needs_human_review) {
    return "LOW";
  }

  if (row.semantic.has_final_copy && row.semantic.has_title) {
    return "HIGH";
  }

  if (row.semantic.has_final_copy || row.semantic.has_title || row.semantic.is_published) {
    return "MEDIUM";
  }

  return "LOW";
}

function deriveRoutingFromParsedFields(input: {
  title?: string;
  copyEnglish: string;
  sourceAssetLink?: string;
  publishedFlag?: string | boolean;
}) {
  return inferContentRouting({
    planning: {
      title: input.title,
      copyEnglish: input.copyEnglish,
      sourceAssetLink: input.sourceAssetLink,
    },
    sourceMetadata: {
      publishedFlag: input.publishedFlag,
    },
  });
}

// buildFallbackTitle imported from __internal__/queue-helpers

function padHeaders(headers: string[], rowValues: string[]) {
  const nextHeaders = headers.map((header) => sanitizeCellValue(header));
  while (nextHeaders.length < rowValues.length) {
    nextHeaders.push(`Column ${nextHeaders.length + 1}`);
  }

  return nextHeaders.length > 0 ? nextHeaders : rowValues.map((_, index) => `Column ${index + 1}`);
}

function normalizeRowValues(headers: string[], rowValues: string[]) {
  const nextRowValues = rowValues.map((value) => sanitizeCellValue(value));
  while (nextRowValues.length < headers.length) {
    nextRowValues.push("");
  }

  return nextRowValues.slice(0, headers.length);
}

function buildRowMap(headers: string[], rowValues: string[]) {
  return headers.reduce<Record<string, string>>((accumulator, header, index) => {
    accumulator[sanitizeCellValue(header)] = sanitizeCellValue(rowValues[index]);
    return accumulator;
  }, {});
}

function sanitizeWorksheetImport(worksheet: GoogleSheetsRawWorksheetImport): GoogleSheetsRawWorksheetImport {
  return {
    ...worksheet,
    detectedHeaders: worksheet.detectedHeaders.map((header) => sanitizeCellValue(header)),
    rows: worksheet.rows.map((row) => row.map((cell) => sanitizeCellValue(cell))),
  };
}

function buildAiRowSearchText(row: AiSheetAnalysisResult["rows"][number]) {
  return normalizeComparableText(
    [
      row.data.date ?? "",
      row.data.title ?? "",
      row.data.deadline ?? "",
      row.data.published ?? "",
    ].join(" | "),
  );
}

function buildWorksheetRowSearchText(rowValues: string[]) {
  return normalizeComparableText(rowValues.join(" | "));
}

function scoreAiRowAgainstWorksheetRow(
  row: AiSheetAnalysisResult["rows"][number],
  rowValues: string[],
) {
  const rowText = buildWorksheetRowSearchText(rowValues);
  if (rowText.length === 0) {
    return 0;
  }

  let score = 0;

  const title = optionalTrimmed(row.data.title);
  if (title) {
    const normalizedTitle = normalizeComparableText(title);
    score += rowText.includes(normalizedTitle) ? 4 : scoreComparableText(title, rowText) * 4;
  }

  const plannedDate = optionalTrimmed(row.data.date);
  if (plannedDate) {
    const normalizedDate = normalizeComparableText(plannedDate);
    score += rowText.includes(normalizedDate) ? 2 : scoreComparableText(plannedDate, rowText) * 2;
  }

  const deadline = optionalTrimmed(row.data.deadline);
  if (deadline) {
    const normalizedDeadline = normalizeComparableText(deadline);
    score += rowText.includes(normalizedDeadline) ? 1.5 : scoreComparableText(deadline, rowText) * 1.5;
  }

  const published = optionalTrimmed(row.data.published);
  if (published) {
    const normalizedPublished = normalizeComparableText(published);
    score += rowText.includes(normalizedPublished) ? 1 : scoreComparableText(published, rowText);
  }

  return score;
}

function resolveAiRowNumber(input: {
  worksheet: GoogleSheetsRawWorksheetImport;
  headerContext: ReturnType<typeof resolveWorksheetHeaderContext>;
  row: AiSheetAnalysisResult["rows"][number];
  usedRowNumbers: Set<number>;
}) {
  const { worksheet, headerContext, row, usedRowNumbers } = input;
  const isWithinRange = row.rowIndex > headerContext.headerRowNumber && row.rowIndex <= worksheet.rows.length;
  const canUseReportedRow = isWithinRange && !usedRowNumbers.has(row.rowIndex);
  const reportedScore = canUseReportedRow
    ? scoreAiRowAgainstWorksheetRow(row, worksheet.rows[row.rowIndex - 1] ?? [])
    : 0;

  let bestCandidate:
    | {
        rowNumber: number;
        score: number;
      }
    | null = null;

  for (let rowNumber = headerContext.headerRowNumber + 1; rowNumber <= worksheet.rows.length; rowNumber += 1) {
    if (usedRowNumbers.has(rowNumber)) {
      continue;
    }

    const candidateRowValues = worksheet.rows[rowNumber - 1] ?? [];
    const score = scoreAiRowAgainstWorksheetRow(row, candidateRowValues);
    if (score <= 0) {
      continue;
    }

    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = {
        rowNumber,
        score,
      };
    }
  }

  const rowSearchText = buildAiRowSearchText(row);
  const minimumScore = rowSearchText.length > 0 ? 1.25 : 2.5;

  if (
    bestCandidate &&
    bestCandidate.score >= minimumScore &&
    (!canUseReportedRow || bestCandidate.rowNumber !== row.rowIndex) &&
    (!canUseReportedRow || bestCandidate.score >= reportedScore + 1)
  ) {
    return {
      rowNumber: bestCandidate.rowNumber,
      resolution: "reconciled" as const,
      score: bestCandidate.score,
    };
  }

  if (canUseReportedRow) {
    return {
      rowNumber: row.rowIndex,
      resolution: "reported" as const,
      score: reportedScore,
    };
  }

  return {
    rowNumber: null,
    resolution: "unresolved" as const,
    score: 0,
  };
}

function inferHeaderRowNumberFromAiAnalysis(
  worksheet: GoogleSheetsRawWorksheetImport,
  analysis: AiSheetAnalysisResult,
) {
  const labels = Object.values(analysis.columns).filter((value): value is string => Boolean(value && value.trim().length > 0));
  if (labels.length === 0) {
    return worksheet.detectedHeaderRowNumber;
  }

  let bestRowNumber = worksheet.detectedHeaderRowNumber;
  let bestScore = worksheet.detectedHeaderRowNumber ? 1 : 0;

  for (let rowIndex = 0; rowIndex < Math.min(worksheet.rows.length, 25); rowIndex += 1) {
    const row = worksheet.rows[rowIndex] ?? [];
    const score = labels.reduce((total, label) => {
      const normalizedLabel = normalizeComparableText(label);
      const hasMatch = row.some((cell) => {
        const normalizedCell = normalizeComparableText(cell);
        return normalizedCell === normalizedLabel || normalizedCell.includes(normalizedLabel);
      });
      return total + (hasMatch ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestRowNumber = rowIndex + 1;
    }
  }

  return bestScore >= 2 ? bestRowNumber : worksheet.detectedHeaderRowNumber;
}

function resolveWorksheetHeaderContext(
  worksheet: GoogleSheetsRawWorksheetImport,
  analysis: AiSheetAnalysisResult,
) {
  const headerRowNumber = inferHeaderRowNumberFromAiAnalysis(worksheet, analysis) ?? 1;
  const rawHeaderRow = worksheet.rows[headerRowNumber - 1] ?? [];
  const baseHeaders =
    worksheet.detectedHeaders.length > 0 && worksheet.detectedHeaderRowNumber === headerRowNumber
      ? worksheet.detectedHeaders
      : rawHeaderRow;
  const widestRowLength = worksheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headers = padHeaders(baseHeaders.map((header) => header.trim()), new Array(widestRowLength).fill(""));

  const colMap = buildWorksheetColumnMap(headers);

  return {
    headerRowNumber,
    headers,
    colMap,
    mappedFields: {},
    unmappedHeaders: headers.filter((header) => header.trim().length > 0),
  };
}

// Deterministic patterns that override AI semantic qualification for obvious non-data rows.
// These are high-precision and safe to apply without context.
const DETERMINISTIC_SKIP_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^\s*week\s*\d+\s*(?:[-â€“â€”].*)?$/i, label: "week separator" },
  { pattern: /^\s*semana\s*\d+\s*(?:[-â€“â€”].*)?$/i, label: "semana (PT week separator)" },
  { pattern: /^\s*w\d{1,2}\s*(?:[-â€“â€”].*)?$/i, label: "week abbreviation separator" },
  { pattern: /^\s*hashtags?\s*(?:[:ï¼š#].*)?$/i, label: "hashtag block header" },
  { pattern: /^\s*qr\s*code\s*(?:link)?[:ï¼š]?\s*$/i, label: "QR code block" },
];

type PostAiFilterResult =
  | { allowed: true }
  | { allowed: false; reason: string; disposition: "SKIPPED_NON_DATA" };

function postAiFilterRow(
  aiRow: AiSheetAnalysisRow,
  rawRowValues: string[],
): PostAiFilterResult {
  const trimmedCells = rawRowValues.map((v) => v.trim());
  const nonEmptyCells = trimmedCells.filter((v) => v.length > 0);

  // Always reject truly empty rows regardless of what the AI said
  if (nonEmptyCells.length === 0) {
    return { allowed: false, reason: "Row is empty.", disposition: "SKIPPED_NON_DATA" };
  }

  // Deterministic skip patterns: checked against individual cells first,
  // then against the concatenated text of sparse rows (â‰¤2 non-empty cells)
  const joinedSparse = nonEmptyCells.length <= 2 ? nonEmptyCells.join(" ").trim() : "";
  for (const { pattern, label } of DETERMINISTIC_SKIP_PATTERNS) {
    const matchedCell = trimmedCells.find((cell) => cell.length > 0 && pattern.test(cell));
    if (matchedCell ?? (joinedSparse.length > 0 && pattern.test(joinedSparse))) {
      return {
        allowed: false,
        reason: `Row matched deterministic skip pattern: ${label}.`,
        disposition: "SKIPPED_NON_DATA",
      };
    }
  }

  // Minimum content gate â€” only applied when AI semantic extraction marked the row as qualified.
  // Goal: catch sparse/false-positive rows without losing real incomplete work items.
  if (isAiRowQualified(aiRow)) {
    const hasTitle = Boolean(aiRow.data.title?.trim());
    const hasPublishedSignal = Boolean(aiRow.data.published?.trim()) || aiRow.semantic.is_published;
    const hasDate = Boolean(aiRow.data.date?.trim());
    const hasDeadline = Boolean(aiRow.data.deadline?.trim());
    const hasSchedulingSignal = hasDate || hasDeadline || hasPublishedSignal;

    if (!hasTitle && !hasPublishedSignal && !hasSchedulingSignal && aiRow.semantic.needs_human_review) {
      return {
        allowed: false,
        reason: "AI flagged the row for human review without enough operational content signals.",
        disposition: "SKIPPED_NON_DATA",
      };
    }

    // If AI extracted absolutely nothing across the operational fields, something is wrong.
    if (!hasTitle && !hasPublishedSignal && !hasSchedulingSignal) {
      return {
        allowed: false,
        reason: "AI marked as qualified but no recognizable content fields were extracted.",
        disposition: "SKIPPED_NON_DATA",
      };
    }
  }

  return { allowed: true };
}

// WorksheetField, WORKSHEET_FIELD_ALIASES, WorksheetColumnMap, WorksheetExtractedFields,
// buildWorksheetColumnMap, extractColumnarRowFields imported from __internal__/queue-helpers

function buildAiParsedRow(input: {
  worksheet: GoogleSheetsRawWorksheetImport;
  headerContext: ReturnType<typeof resolveWorksheetHeaderContext>;
  rowIndex: number;
  row: AiSheetAnalysisResult["rows"][number];
  sourceGroup: string;
}) {
  const { worksheet, headerContext, rowIndex, row, sourceGroup } = input;
  const sourceRow = worksheet.rows[rowIndex - 1] ?? [];
  const headers = padHeaders(headerContext.headers, sourceRow);
  const rowValues = normalizeRowValues(headers, sourceRow);
  const rowMap = buildRowMap(headers, rowValues);
  const rowConfidence = deriveAiRowConfidence(row);

  // The spreadsheet is the operational source of truth. AI may help find the row,
  // but it must not promote brief-like planning fields into operational title/copy.
  const det = extractColumnarRowFields(headerContext.colMap, rowValues);

  const plannedDate = det.plannedDate;
  const campaignLabel = det.title?.trim() || undefined;
  const copyEnglish = det.linkedinCopy ?? "";
  const contentDeadline = det.contentDeadline;
  const publishedFlag = det.publishedFlag;
  const sourceAssetLink = det.sourceAssetLink;
  const fallbackDate = plannedDate ?? contentDeadline;
  const routingTitle = campaignLabel ?? (fallbackDate
    ? buildFallbackTitle({ date: fallbackDate, rowNumber: rowIndex })
    : undefined);
  const title = buildFallbackTitle({
    title: routingTitle,
    date: fallbackDate,
    rowNumber: rowIndex,
  });
  const routing = deriveRoutingFromParsedFields({
    title: routingTitle,
    copyEnglish,
    sourceAssetLink,
    publishedFlag,
  });
  const operationalStatus = routing.operationalStatus;
  const blockReason = routing.blockReason;
  const isPublishedRow = operationalStatus === "POSTED";
  const rowReasons: string[] = [];

  if (blockReason) {
    rowReasons.push(`Blocked: ${blockReason}.`);
  }

  const parsedRow: GoogleSheetsParsedRow = {
    worksheetId: worksheet.worksheetId,
    worksheetName: worksheet.worksheetName,
    rowId: `row-${rowIndex}`,
    rowNumber: rowIndex,
    rowVersion: hashStablePayload({
      worksheetId: worksheet.worksheetId,
      rowIndex,
      rowValues,
      headers,
      sourceGroup,
    }),
    rowKind: "DATA",
    headerRowNumber: headerContext.headerRowNumber,
    headers,
    rowValues,
    rowMap,
    mappedFields: headerContext.mappedFields,
    unmappedHeaders: headerContext.unmappedHeaders,
    rowQualification: {
      disposition: "QUALIFIED",
      confidence: rowConfidence,
      reasons: rowReasons,
      signals: {
        hasDate: Boolean(plannedDate || contentDeadline),
        hasTitle: Boolean(routingTitle),
        hasCopy: hasRealCopy(copyEnglish),
        hasPlatform: false,
        hasLink: hasImageLink(sourceAssetLink),
        hasPublicationMarker: isPublishedRow,
      },
      isPublishedRow,
    },
    titleDerivation: campaignLabel
      ? {
          strategy: "EXPLICIT_MAPPED_FIELD",
          title,
          sourceField: "campaignLabel",
        }
      : fallbackDate
        ? {
            strategy: "HEURISTIC_LAST_RESORT",
            title,
            sourceField: plannedDate ? "plannedDate" : "contentDeadline",
          }
        : {
            strategy: "HEURISTIC_LAST_RESORT",
            title,
          },
    planningFields: {
      plannedDate,
      campaignLabel,
      copyEnglish,
      sourceAssetLink,
      contentDeadline,
    },
    sourceMetadata: {
      publishedFlag,
    },
    contentProfile: inferContentProfileFromSourceGroup(sourceGroup),
    operationalStatus,
    blockReason,
    translationRequired: false,
    autoPostEnabled: false,
    preferredDesignProvider: "MANUAL",
    contentSignature: normalizeComparableText(
      [
        sourceGroup,
        plannedDate ?? "",
        title,
        copyEnglish,
      ].join(" | "),
    ),
  };

  return parsedRow;
}

async function resolveDriveSpreadsheetRecord(driveFileId: string, userId: string) {
  const cached = getDriveImportSpreadsheetById(driveFileId, userId);
  if (cached) {
    return cached;
  }

  const records = await listDriveImportSpreadsheets({}, { userId });
  return records.find((record) => record.driveFileId === driveFileId) ?? null;
}

async function findEquivalentContentItem(input: {
  prisma: ReturnType<typeof getPrisma>;
  row: GoogleSheetsParsedRow;
  sourceGroup: string;
  spreadsheetId: string;
}) {
  const { prisma, row, sourceGroup, spreadsheetId } = input;
  const profile = inferContentProfileFromSourceGroup(sourceGroup);

  const candidates = await prisma.contentItem.findMany({
    where: {
      profile,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      copy: true,
      latestImportAt: true,
      currentStatus: true,
      canonicalKey: true,
      sourceLinks: {
        select: {
          spreadsheetId: true,
          worksheetId: true,
        },
      },
    },
    orderBy: {
      latestImportAt: "desc",
    },
    take: 50,
  });

  let bestCandidate: {
    id: string;
    title: string;
    copy: string;
    score: number;
    reasons: string[];
  } | null = null;

  const rowSignature = buildContentSignature(row, sourceGroup);
  const normalizedRowTitle = normalizeComparableText(row.titleDerivation.title);
  const rowHasCopy = row.planningFields.copyEnglish.trim().length > 0;

  for (const candidate of candidates) {
    const titleScore = scoreComparableText(row.titleDerivation.title, candidate.title);
    const copyScore = scoreComparableText(row.planningFields.copyEnglish, candidate.copy);
    const signatureScore = scoreComparableText(
      rowSignature,
      normalizeComparableText(`${candidate.title} ${candidate.copy}`),
    );
    const normalizedCandidateTitle = normalizeComparableText(candidate.title);
    const titleContains =
      normalizedRowTitle.length > 0 &&
      normalizedCandidateTitle.length > 0 &&
      (normalizedRowTitle.includes(normalizedCandidateTitle) || normalizedCandidateTitle.includes(normalizedRowTitle));
    const sameSpreadsheet = candidate.sourceLinks.some((link) => link.spreadsheetId === spreadsheetId);
    const sameWorksheet = candidate.sourceLinks.some(
      (link) => link.spreadsheetId === spreadsheetId && link.worksheetId === row.worksheetId,
    );

    let score = Math.max(titleScore * 0.6 + copyScore * 0.3 + signatureScore * 0.1, signatureScore);

    if (sameSpreadsheet) {
      score += 0.15;
    }

    if (sameWorksheet) {
      score += 0.1;
    }

    if (titleContains) {
      score += 0.25;
    }

    if (titleContains && !rowHasCopy) {
      score += 0.2;
    }

    score = Math.min(score, 1);

    if (!bestCandidate || score > bestCandidate.score) {
      const reasons = [];
      if (titleScore >= 0.7) {
        reasons.push("Title is highly similar to an existing queue item.");
      }
      if (copyScore >= 0.7) {
        reasons.push("LinkedIn copy is highly similar to an existing queue item.");
      }
      if (signatureScore >= 0.7) {
        reasons.push("Combined row signature strongly matches an existing queue item.");
      }
      if (sameSpreadsheet) {
        reasons.push("Candidate already exists from the same spreadsheet import.");
      }
      if (sameWorksheet) {
        reasons.push("Candidate already exists from the same worksheet.");
      }
      if (titleContains) {
        reasons.push("One title contains the other, suggesting the same planned item was phrased differently.");
      }

      bestCandidate = {
        id: candidate.id,
        title: candidate.title,
        copy: candidate.copy,
        score,
        reasons,
      };
    }
  }

  if (!bestCandidate) {
    return {
      existingContentItemId: null,
      confidence: DriveConflictConfidence.NO_MEANINGFUL_MATCH,
      score: 0,
      reasons: [],
      matchType: "NONE" as const,
    };
  }

  if (bestCandidate.score >= 0.82) {
    return {
      existingContentItemId: bestCandidate.id,
      confidence: DriveConflictConfidence.HIGH_CONFIDENCE_DUPLICATE,
      score: bestCandidate.score,
      reasons: bestCandidate.reasons.length > 0 ? bestCandidate.reasons : ["Potential duplicate detected by title and copy similarity."],
      matchType: "CONTENT_EQUIVALENCE" as const,
    };
  }

  if (bestCandidate.score >= 0.5) {
    return {
      existingContentItemId: bestCandidate.id,
      confidence: DriveConflictConfidence.POSSIBLE_DUPLICATE,
      score: bestCandidate.score,
      reasons: bestCandidate.reasons.length > 0 ? bestCandidate.reasons : ["Potential duplicate detected by text similarity."],
      matchType: "CONTENT_EQUIVALENCE" as const,
    };
  }

  return {
    existingContentItemId: null,
    confidence: DriveConflictConfidence.NO_MEANINGFUL_MATCH,
    score: bestCandidate.score,
    reasons: [],
    matchType: "NONE" as const,
  };
}

function buildConflictSuggestion(input: {
  row: GoogleSheetsParsedRow;
  spreadsheetId: string;
  sourceGroup: string;
  existingContentItemId: string | null;
  confidence: DriveConflictConfidence;
  score: number;
  reasons: string[];
  matchType: "SOURCE_LINK" | "CONTENT_EQUIVALENCE" | "NONE";
}) {
  if (input.confidence === DriveConflictConfidence.NO_MEANINGFUL_MATCH || !input.existingContentItemId) {
    return null;
  }

  return {
    matchType: input.matchType,
    confidence: input.confidence,
    score: input.score,
    existingContentItemId: input.existingContentItemId,
    reasons: input.reasons,
    sourceRow: {
      spreadsheetId: input.spreadsheetId,
      worksheetId: input.row.worksheetId,
      rowId: input.row.rowId,
      rowNumber: input.row.rowNumber,
    },
    rowSignature: buildContentSignature(input.row, input.sourceGroup),
  };
}

function buildNormalizedPayload(input: {
  spreadsheetRecord: DriveSpreadsheetRecord;
  spreadsheetImport: GoogleSheetsRawSpreadsheetImport;
  row: GoogleSheetsParsedRow;
  existingContentItemId: string | null;
  conflictConfidence: DriveConflictConfidence;
  reimportStrategy: DriveReimportStrategy;
  translationCopy: string | null;
}) {
  const { spreadsheetRecord, spreadsheetImport, row, existingContentItemId, conflictConfidence, reimportStrategy, translationCopy } = input;
  return contentIngestionPayloadSchema.parse({
    version: 2,
    mode: "COMMIT",
    idempotencyKey: [
      spreadsheetRecord.driveFileId,
      row.worksheetId,
      row.rowId,
      row.rowVersion,
      reimportStrategy,
    ].join(":"),
    orchestrator: "MANUAL",
    triggeredAt: new Date().toISOString(),
    source: {
      system: "GOOGLE_SHEETS",
      spreadsheetId: spreadsheetRecord.driveFileId,
      spreadsheetName: spreadsheetImport.spreadsheetName,
      worksheetId: row.worksheetId,
      worksheetName: row.worksheetName,
      rowId: row.rowId,
      rowNumber: row.rowNumber,
      rowVersion: row.rowVersion,
      rawRow: buildOperationalRawRow({
        ...row.planningFields,
        publishedFlag: row.sourceMetadata.publishedFlag,
      }),
    },
    normalization: {
      sheetProfileKey: "drive-first-pipeline-1",
      sheetProfileVersion: 1,
      worksheetSelection: {
        strategy: "EXPLICIT_WORKSHEET_ID",
        availableWorksheets: spreadsheetImport.availableWorksheets,
      },
      headerMapping: {
        headerRowNumber: row.headerRowNumber,
        mappedFields: {},
        unmappedHeaders: row.unmappedHeaders,
      },
      rowQualification: row.rowQualification,
      titleDerivation: row.titleDerivation,
    },
    planning: row.planningFields,
    sourceMetadata: row.sourceMetadata,
    pushbackCandidates: {},
    workflow: {
      translationRequired: row.translationRequired,
      autoPostEnabled: row.autoPostEnabled,
      preferredDesignProvider: row.preferredDesignProvider,
      reimportStrategy,
      equivalenceTargetContentItemId: existingContentItemId ?? undefined,
      conflictConfidence,
      operationalStatus: row.operationalStatus,
      blockReason: row.blockReason,
    },
    content: {
      canonicalKey: [
        spreadsheetRecord.driveFileId,
        row.worksheetId,
        row.rowId,
      ].join(":"),
      profile: row.contentProfile,
      contentType: "STATIC_POST",
      title: row.titleDerivation.title,
      copy: row.planningFields.copyEnglish,
      locale: "en",
      translationRequired: row.translationRequired,
      translationCopy: translationCopy ?? undefined,
      translationRequestedAt: row.translationRequired ? new Date().toISOString() : undefined,
      translationGeneratedAt: translationCopy ? new Date().toISOString() : undefined,
    },
  });
}

function buildRowPersistenceData(input: {
  row: GoogleSheetsParsedRow;
  conflictConfidence: DriveConflictConfidence;
  conflictSuggestion: Record<string, unknown> | null;
  existingContentItemId: string | null;
  normalizedPayload: ContentIngestionPayload | null;
}) {
  const { row, conflictConfidence, conflictSuggestion, existingContentItemId, normalizedPayload } = input;
  const rowStatus =
    row.rowQualification.disposition === "QUALIFIED"
      ? row.rowQualification.isPublishedRow
        ? DriveSpreadsheetRowState.PUBLISHED_COMPLETE
        : conflictConfidence !== DriveConflictConfidence.NO_MEANINGFUL_MATCH
          ? DriveSpreadsheetRowState.CONFLICT
          : DriveSpreadsheetRowState.STAGED
      : row.rowQualification.disposition === "SKIPPED_NON_DATA"
        ? DriveSpreadsheetRowState.SKIPPED
        : DriveSpreadsheetRowState.REJECTED;

  return {
    rowStatus,
    rowKind: row.rowKind,
    conflictConfidence,
    conflictAction: null,
    existingContentItemId,
    contentItemId: null,
    title: row.titleDerivation.title,
    idea: null,
    copy: row.planningFields.copyEnglish,
    translationDraft: normalizedPayload?.content.translationCopy ?? null,
    plannedDate: row.planningFields.plannedDate ?? null,
    publishedFlag:
      row.sourceMetadata.publishedFlag === undefined || row.sourceMetadata.publishedFlag === null
        ? null
        : String(row.sourceMetadata.publishedFlag),
    publishedPostUrl: null,
    sourceAssetLink: row.planningFields.sourceAssetLink ?? null,
    translationRequired: row.translationRequired,
    autoPostEnabled: row.autoPostEnabled,
    preferredDesignProvider: row.preferredDesignProvider,
    matchSignals: row.rowQualification.signals,
    rowPayload: {
      rowId: row.rowId,
      rowNumber: row.rowNumber,
      rowVersion: row.rowVersion,
      worksheetId: row.worksheetId,
      worksheetName: row.worksheetName,
      rawRow: buildOperationalRawRow({
        ...row.planningFields,
        publishedFlag: row.sourceMetadata.publishedFlag,
      }),
      qualification: row.rowQualification,
      planningFields: row.planningFields,
      sourceMetadata: row.sourceMetadata,
      titleDerivation: row.titleDerivation,
      blockReason: row.blockReason,
      contentSignature: row.contentSignature,
    },
    normalizedPayload: normalizedPayload ? toJsonValue(normalizedPayload) : null,
    conflictSuggestion: conflictSuggestion ? toJsonValue(conflictSuggestion) : null,
    reason:
      row.rowQualification.reasons.join(" | ") ||
      (row.rowQualification.isPublishedRow
        ? "Imported as already published."
        : conflictConfidence !== DriveConflictConfidence.NO_MEANINGFUL_MATCH
          ? "Conflict suggested by deterministic or equivalence matching."
          : row.rowQualification.disposition === "QUALIFIED"
            ? "Qualified for workflow queue import."
      : "Row skipped during spreadsheet import."),
  };
}

async function buildStagedRowRecord(input: {
  prisma: ReturnType<typeof getPrisma>;
  record: DriveSpreadsheetRecord;
  spreadsheetImport: GoogleSheetsRawSpreadsheetImport;
  row: GoogleSheetsParsedRow;
  reimportStrategy: DriveReimportStrategy;
  originalRowId?: string;
}) {
  const { prisma, record, spreadsheetImport, row, reimportStrategy, originalRowId } = input;

  const lookupStartMs = Date.now();
  const sourceRowIds = Array.from(
    new Set([row.rowId, originalRowId].filter((value): value is string => Boolean(value))),
  );

  let exactSourceLink: { contentItemId: string } | null = null;
  for (const sourceRowId of sourceRowIds) {
    exactSourceLink = await prisma.contentSourceLink.findUnique({
      where: {
        upstreamSystem_spreadsheetId_worksheetId_rowId: {
          upstreamSystem: "GOOGLE_SHEETS" as UpstreamSystem,
          spreadsheetId: record.driveFileId,
          worksheetId: row.worksheetId,
          rowId: sourceRowId,
        },
      },
      select: {
        contentItemId: true,
      },
    });

    if (exactSourceLink) {
      break;
    }
  }

  const equivalenceSuggestion =
    exactSourceLink?.contentItemId === undefined
      ? await findEquivalentContentItem({
          prisma,
          row,
          sourceGroup: record.sourceContext.sourceGroup,
          spreadsheetId: record.driveFileId,
        })
      : {
          existingContentItemId: null,
          confidence: DriveConflictConfidence.NO_MEANINGFUL_MATCH,
          score: 0,
          reasons: [],
          matchType: "NONE" as const,
        };

  const existingContentItemId = exactSourceLink?.contentItemId ?? equivalenceSuggestion.existingContentItemId;
  const conflictConfidence = exactSourceLink?.contentItemId
    ? DriveConflictConfidence.HIGH_CONFIDENCE_DUPLICATE
    : equivalenceSuggestion.confidence;
  const conflictSuggestion =
    existingContentItemId && conflictConfidence !== DriveConflictConfidence.NO_MEANINGFUL_MATCH
      ? buildConflictSuggestion({
          row,
          spreadsheetId: record.driveFileId,
          sourceGroup: record.sourceContext.sourceGroup,
          existingContentItemId,
          confidence: conflictConfidence,
          score:
            exactSourceLink?.contentItemId !== undefined
              ? 1
              : equivalenceSuggestion.score,
          reasons:
            exactSourceLink?.contentItemId !== undefined
              ? [
                  "The exact spreadsheet row already exists as a linked workflow item.",
                ]
              : equivalenceSuggestion.reasons,
          matchType:
            exactSourceLink?.contentItemId !== undefined
              ? "SOURCE_LINK"
              : equivalenceSuggestion.matchType,
        })
      : null;

  const translationCopy = row.translationRequired
    ? generateMockTranslationDraft({
        sourceText: row.planningFields.copyEnglish,
        sourceLocale: "en",
        targetLocale: "pt-br",
      })
    : null;

  const normalizedPayload = row.rowQualification.disposition === "QUALIFIED"
    ? buildNormalizedPayload({
        spreadsheetRecord: record,
        spreadsheetImport,
        row,
        existingContentItemId,
        conflictConfidence,
        reimportStrategy,
        translationCopy,
      })
    : null;

  const persistenceData = buildRowPersistenceData({
    row,
    conflictConfidence,
    conflictSuggestion,
    existingContentItemId,
    normalizedPayload,
  });

  return {
    row: {
      worksheetId: row.worksheetId,
      worksheetName: row.worksheetName,
      rowId: row.rowId,
      rowNumber: row.rowNumber,
      rowVersion: row.rowVersion,
      rowKind: persistenceData.rowKind,
      rowStatus: persistenceData.rowStatus,
      conflictConfidence: persistenceData.conflictConfidence,
      conflictAction: persistenceData.conflictAction,
      existingContentItemId: persistenceData.existingContentItemId,
      contentItemId: persistenceData.contentItemId,
      title: persistenceData.title,
      idea: persistenceData.idea,
      copy: persistenceData.copy,
      translationDraft: persistenceData.translationDraft,
      plannedDate: persistenceData.plannedDate,
      publishedFlag: persistenceData.publishedFlag,
      publishedPostUrl: persistenceData.publishedPostUrl,
      sourceAssetLink: persistenceData.sourceAssetLink,
      translationRequired: persistenceData.translationRequired,
      autoPostEnabled: persistenceData.autoPostEnabled,
      preferredDesignProvider: persistenceData.preferredDesignProvider,
      matchSignals: toJsonValue(persistenceData.matchSignals),
      rowPayload: toJsonValue(persistenceData.rowPayload),
      normalizedPayload: persistenceData.normalizedPayload ?? Prisma.JsonNull,
      conflictSuggestion: persistenceData.conflictSuggestion ?? Prisma.JsonNull,
      reason: persistenceData.reason,
    } satisfies Omit<Prisma.SpreadsheetImportRowCreateManyInput, "batchId">,
    isQualified: row.rowQualification.disposition === "QUALIFIED",
    isPublished: row.rowQualification.isPublishedRow,
    isConflict: persistenceData.rowStatus === DriveSpreadsheetRowState.CONFLICT,
    isRejected: persistenceData.rowStatus === DriveSpreadsheetRowState.REJECTED,
    isSkipped: persistenceData.rowStatus === DriveSpreadsheetRowState.SKIPPED,
    lookupMs: Date.now() - lookupStartMs,
  };
}

/**
 * Builds a minimal SpreadsheetImportRow record for a row that was excluded
 * during staging (not-queue-candidate, post-AI-filter, out-of-range).
 *
 * These records are persisted with rowStatus=SKIPPED so that every row decision
 * is queryable after the import. Previously skipped rows only incremented the
 * batch-level skippedRowCount counter and were otherwise invisible.
 *
 * Satisfies the schema's required columns (title, copy, matchSignals, rowPayload)
 * with safe placeholder values. No AI data is persisted for empty/unusable rows.
 */
function buildSkippedRowTrace(input: {
  worksheet: GoogleSheetsRawWorksheetImport;
  rowIndex: number;
  rowId: string;
  rowValues: string[];
  det: WorksheetExtractedFields;
  skipStage: "not-queue-candidate" | "post-ai-filter" | "out-of-range";
  skipReason: string;
}): Omit<Prisma.SpreadsheetImportRowCreateManyInput, "batchId"> {
  const { worksheet, rowIndex, rowId, rowValues, det, skipStage, skipReason } = input;
  return {
    worksheetId: worksheet.worksheetId,
    worksheetName: worksheet.worksheetName,
    rowId,
    rowNumber: rowIndex,
    rowVersion: null,
    rowKind: "SKIPPED",
    rowStatus: DriveSpreadsheetRowState.SKIPPED,
    conflictConfidence: DriveConflictConfidence.NO_MEANINGFUL_MATCH,
    conflictAction: null,
    existingContentItemId: null,
    contentItemId: null,
    title: buildFallbackTitle({
      title: det.title,
      date: det.plannedDate ?? det.contentDeadline,
      rowNumber: rowIndex,
    }),
    idea: null,
    copy: det.linkedinCopy ?? "",
    translationDraft: null,
    plannedDate: det.plannedDate ?? null,
    publishedFlag: det.publishedFlag ?? null,
    publishedPostUrl: null,
    sourceAssetLink: det.sourceAssetLink ?? null,
    translationRequired: false,
    autoPostEnabled: false,
    preferredDesignProvider: null,
    matchSignals: {
      hasDate: Boolean(det.plannedDate),
      hasTitle: Boolean(det.title),
      hasCopy: Boolean(det.linkedinCopy),
      hasPlatform: false,
      hasLink: Boolean(det.sourceAssetLink),
      hasPublicationMarker: Boolean(det.publishedFlag),
    },
    rowPayload: {
      rowId,
      rowNumber: rowIndex,
      rowVersion: null,
      worksheetId: worksheet.worksheetId,
      worksheetName: worksheet.worksheetName,
      rawRow: buildOperationalRawRow({
        plannedDate: det.plannedDate,
        campaignLabel: det.title,
        copyEnglish: det.linkedinCopy ?? "",
        sourceAssetLink: det.sourceAssetLink,
        contentDeadline: det.contentDeadline,
        publishedFlag: det.publishedFlag,
      }),
      skipStage,
      detExtracted: det,
    },
    normalizedPayload: Prisma.JsonNull,
    conflictSuggestion: Prisma.JsonNull,
    reason: skipReason,
  };
}

function buildSpreadsheetSnapshot(spreadsheet: SpreadsheetImportBatch & { rows: SpreadsheetImportRow[] }) {
  return {
    id: spreadsheet.id,
    driveFileId: spreadsheet.driveFileId,
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetName: spreadsheet.spreadsheetName,
    folderName: spreadsheet.folderName,
    owner: spreadsheet.owner,
    sourceGroup: spreadsheet.sourceGroup,
    lastUpdatedAt: spreadsheet.lastUpdatedAt ? spreadsheet.lastUpdatedAt.toISOString() : null,
    state: toSpreadsheetState(spreadsheet.status as DriveImportBatchStatus),
    reimportStrategy: spreadsheet.reimportStrategy,
    importedAt: spreadsheet.stagedAt.toISOString(),
    queuedAt: spreadsheet.queuedAt ? spreadsheet.queuedAt.toISOString() : null,
    validWorksheetCount: spreadsheet.validWorksheetCount,
    totalRowsDetected: spreadsheet.detectedRowCount,
    qualifiedRowsDetected: spreadsheet.qualifiedRowCount,
    conflictRowsDetected: spreadsheet.conflictCount,
    alreadyPublishedRowCount: spreadsheet.alreadyPublishedRowCount,
    importedRowCount: spreadsheet.importedRowCount,
    updatedRowCount: spreadsheet.updatedRowCount,
    replacedRowCount: spreadsheet.replacedRowCount,
    keptRowCount: spreadsheet.keptRowCount,
    skippedRowCount: spreadsheet.detectedRowCount - spreadsheet.qualifiedRowCount - spreadsheet.conflictCount,
    rejectedRowCount:
      spreadsheet.detectedRowCount -
      spreadsheet.importedRowCount -
      spreadsheet.replacedRowCount -
      spreadsheet.keptRowCount,
    sourceContext: spreadsheet.sourceContext as Record<string, unknown>,
    pipelineSignals: spreadsheet.pipelineSignals as Record<string, unknown>,
  };
}

async function stageDriveSpreadsheetToStaging(input: {
  prisma: ReturnType<typeof getPrisma>;
  record: DriveSpreadsheetRecord;
  reimportStrategy: DriveReimportStrategy;
  importedById?: string | null;
}) {
  const { prisma, record, reimportStrategy, importedById } = input;

  // â”€â”€ TIMING: batch-level wall-clock start
  const batchStartMs = Date.now();

  const discoveryStartMs = Date.now();
  const spreadsheetImport = await readGoogleSpreadsheetWorkbook({
    spreadsheetId: record.driveFileId,
    spreadsheetName: record.spreadsheetName,
    sourceGroup: record.sourceContext.sourceGroup as DriveSpreadsheetRecord["sourceContext"]["sourceGroup"],
  });
  const discoveryMs = Date.now() - discoveryStartMs;

  const existingHistory = await prisma.spreadsheetImportBatch.findFirst({
    where: { spreadsheetId: record.spreadsheetId },
    orderBy: { stagedAt: "desc" },
  });

  logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] spreadsheet:start", {
    driveFileId: record.driveFileId,
    spreadsheetId: record.spreadsheetId,
    spreadsheetName: record.spreadsheetName,
    reimportStrategy,
    existingHistoryBatchId: existingHistory?.id ?? null,
    existingHistoryStatus: existingHistory?.status ?? null,
    existingHistoryQueuedAt: existingHistory?.queuedAt?.toISOString() ?? null,
  });

  const stagedRows: Array<Omit<Prisma.SpreadsheetImportRowCreateManyInput, "batchId">> = [];
  let detectedRowCount = 0;
  let qualifiedRowCount = 0;
  let conflictCount = 0;
  let alreadyPublishedRowCount = 0;
  let rejectedRowCount = 0;
  let skippedRowCount = 0;
  let validWorksheetCount = 0;
  let deterministicFallbackUsed = false;

  // â”€â”€ TIMING: per-phase accumulators
  let totalAiMs = 0;          // sum of AI analysis time across all worksheets
  let totalDetMs = 0;         // sum of deterministic extraction time across all rows
  let totalNormMs = 0;        // sum of normalization time (buildAiParsedRow + buildNormalizedPayload)
  let totalNormalizationLookupMs = 0; // sum of source-link / equivalence DB lookups per row
  const worksheetTimings: Array<{
    worksheetName: string;
    aiMs: number;
    headerMs: number;
    rowCount: number;
    detMs: number;
    normMs: number;
    lookupMs: number;
    totalMs: number;
  }> = [];

  logEvent("info", "Parsing spreadsheet rows for staging", {
    driveFileId: record.driveFileId,
    spreadsheetId: record.spreadsheetId,
    spreadsheetName: record.spreadsheetName,
    worksheetCount: spreadsheetImport.worksheets.length,
  });

  for (const rawWorksheet of spreadsheetImport.worksheets) {
    const worksheet = sanitizeWorksheetImport(rawWorksheet);

    // Deterministic worksheet-level exclusion: skip X.com / Twitter workflow tabs entirely.
    // This runs before AI analysis so the AI is never consulted for X Account content.
    if (isXAccountWorksheet(worksheet.worksheetName)) {
      logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] worksheet:x-account-excluded", {
        spreadsheetId: record.spreadsheetId,
        worksheetId: worksheet.worksheetId,
        worksheetName: worksheet.worksheetName,
      });
      continue;
    }

    // â”€â”€ TIMING: per-worksheet start
    const worksheetStartMs = Date.now();
    let wsAiMs = 0;
    let wsHeaderMs = 0;
    let wsDetMs = 0;
    let wsNormMs = 0;
    let wsLookupMs = 0;

    const aiStartMs = Date.now();
    const analysis = await analyzeSheetWithAI({
      spreadsheetName: record.spreadsheetName,
      sheetName: worksheet.worksheetName,
      rows: worksheet.rows,
      detectedHeaders: worksheet.detectedHeaders,
    });
    wsAiMs = Date.now() - aiStartMs;
    totalAiMs += wsAiMs;

    logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] worksheet:start", {
      spreadsheetId: record.spreadsheetId,
      worksheetId: worksheet.worksheetId,
      worksheetName: worksheet.worksheetName,
      parsedRows: analysis.rows.length,
      tableDetected: analysis.tableDetected,
      detectedHeaders: worksheet.detectedHeaders,
      timing: { aiMs: wsAiMs },
    });

    if (!analysis.tableDetected) {
      logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] worksheet:no-table", {
        spreadsheetId: record.spreadsheetId,
        worksheetId: worksheet.worksheetId,
        worksheetName: worksheet.worksheetName,
      });
      continue;
    }

    validWorksheetCount += 1;
    const headerStartMs = Date.now();
    const headerContext = resolveWorksheetHeaderContext(worksheet, analysis);
    wsHeaderMs = Date.now() - headerStartMs;
    const usedWorksheetRowNumbers = new Set<number>();

    for (const aiRow of analysis.rows) {
      detectedRowCount += 1;
      const rawRowAtReportedIndex = worksheet.rows[aiRow.rowIndex - 1] ?? [];

      // â”€â”€ TIMING: deterministic extraction
      const detStartMs = Date.now();
      const det = extractColumnarRowFields(headerContext.colMap, rawRowAtReportedIndex);
      const rowDetMs = Date.now() - detStartMs;
      wsDetMs += rowDetMs;

      // Stable row ID derived from worksheet + reported AI row index (before reconciliation).
      // Used for both skipped trace records and qualified rows.
      const deterministicRowId = buildDeterministicRowId({
        spreadsheetId: record.driveFileId,
        worksheetName: worksheet.worksheetName,
        rowNumber: aiRow.rowIndex,
      });

      // Deterministic-first queue candidate check.
      // Replaces the old aiQualified && aiLinkedInOnly gate:
      // - X Account worksheets are already excluded at the worksheet level above.
      // - Substack, teaser, and brief-only rows qualify via deterministic extraction
      //   even when the AI marks them as is_non_linkedin_platform / is_empty_or_unusable.
      if (!isRowQueueCandidate(aiRow, det)) {
        const skipReason = aiRow.semantic.is_empty_or_unusable
          ? "Row marked empty or unusable by AI and no deterministic content signals found."
          : "Row did not pass queue candidate check based on the operational spreadsheet fields.";
        logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] row:skip-not-queue-candidate", {
          spreadsheetId: record.spreadsheetId,
          worksheetId: worksheet.worksheetId,
          worksheetName: worksheet.worksheetName,
          rowIndex: aiRow.rowIndex,
          isEmptyOrUnusable: aiRow.semantic.is_empty_or_unusable,
          needsHumanReview: aiRow.semantic.needs_human_review,
          detQualified:
            (Boolean(det.plannedDate) || Boolean(det.contentDeadline)) &&
            (Boolean(det.title) || Boolean(det.linkedinCopy) || Boolean(det.sourceAssetLink)),
          reason: skipReason,
        });
        // â”€â”€ OBSERVABILITY: persist a SKIPPED trace record so this row is queryable
        stagedRows.push(buildSkippedRowTrace({
          worksheet,
          rowIndex: aiRow.rowIndex,
          rowId: deterministicRowId,
          rowValues: rawRowAtReportedIndex,
          det,
          skipStage: "not-queue-candidate",
          skipReason,
        }));
        skippedRowCount += 1;
        continue;
      }
      // Post-AI filter: deterministic skip patterns (week separators, QR code rows, etc.)
      // + minimum content gate for AI-qualified rows.
      const filterResult = postAiFilterRow(aiRow, rawRowAtReportedIndex);

      if (!filterResult.allowed) {
        logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] row:post-ai-filter", {
          spreadsheetId: record.spreadsheetId,
          worksheetId: worksheet.worksheetId,
          worksheetName: worksheet.worksheetName,
          rowIndex: aiRow.rowIndex,
          semantic: aiRow.semantic,
          filterReason: filterResult.reason,
        });
        // â”€â”€ OBSERVABILITY: persist a SKIPPED trace record
        stagedRows.push(buildSkippedRowTrace({
          worksheet,
          rowIndex: aiRow.rowIndex,
          rowId: deterministicRowId,
          rowValues: rawRowAtReportedIndex,
          det,
          skipStage: "post-ai-filter",
          skipReason: filterResult.reason,
        }));
        skippedRowCount += 1;
        continue;
      }

      const resolvedRow = resolveAiRowNumber({
        worksheet,
        headerContext,
        row: aiRow,
        usedRowNumbers: usedWorksheetRowNumbers,
      });

      if (resolvedRow.rowNumber === null) {
        const skipReason = `Row index ${aiRow.rowIndex} could not be reconciled to a worksheet row. Sheet has ${worksheet.rows.length} rows.`;
        logEvent("warn", "[TRACE_IMPORT_QUEUE][STAGE] row:out-of-range", {
          spreadsheetId: record.spreadsheetId,
          worksheetId: worksheet.worksheetId,
          worksheetName: worksheet.worksheetName,
          rowIndex: aiRow.rowIndex,
          semantic: aiRow.semantic,
          worksheetRowCount: worksheet.rows.length,
          reason: skipReason,
        });
        // â”€â”€ OBSERVABILITY: persist a SKIPPED trace record
        stagedRows.push(buildSkippedRowTrace({
          worksheet,
          rowIndex: aiRow.rowIndex,
          rowId: deterministicRowId,
          rowValues: rawRowAtReportedIndex,
          det,
          skipStage: "out-of-range",
          skipReason,
        }));
        skippedRowCount += 1;
        continue;
      }

      if (resolvedRow.resolution === "reconciled") {
        logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] row:resolved-index", {
          spreadsheetId: record.spreadsheetId,
          worksheetId: worksheet.worksheetId,
          worksheetName: worksheet.worksheetName,
          reportedRowIndex: aiRow.rowIndex,
          resolvedRowIndex: resolvedRow.rowNumber,
          score: resolvedRow.score,
          reason: "Operational field reconciliation selected a different worksheet row index.",
        });
      }

      usedWorksheetRowNumbers.add(resolvedRow.rowNumber);

      // â”€â”€ TIMING: normalization (buildAiParsedRow = Phase 1+2+3 field resolution)
      const normStartMs = Date.now();
      const row = buildAiParsedRow({
        worksheet,
        headerContext,
        rowIndex: resolvedRow.rowNumber,
        row: aiRow,
        sourceGroup: record.sourceContext.sourceGroup,
      });
      wsNormMs += Date.now() - normStartMs;

      const stagedRow = {
        ...row,
        rowId: buildDeterministicRowId({
          spreadsheetId: record.driveFileId,
          worksheetName: row.worksheetName,
          rowNumber: row.rowNumber,
        }),
      };

      // â”€â”€ TIMING: per-row source-link + equivalence lookup (DB reads inside loop)
      const stagedRowRecord = await buildStagedRowRecord({
        prisma,
        record,
        spreadsheetImport,
        row: stagedRow,
        reimportStrategy,
        originalRowId: row.rowId,
      });
      wsLookupMs += stagedRowRecord.lookupMs;

      stagedRows.push(stagedRowRecord.row);

      if (stagedRowRecord.isQualified) {
        qualifiedRowCount += 1;
      }

      if (stagedRowRecord.isPublished) {
        alreadyPublishedRowCount += 1;
      }

      if (stagedRowRecord.isConflict) {
        conflictCount += 1;
      }

      if (stagedRowRecord.isRejected) {
        rejectedRowCount += 1;
      }

      if (stagedRowRecord.isSkipped) {
        skippedRowCount += 1;
      }
    }

    // â”€â”€ TIMING: worksheet totals
    totalDetMs += wsDetMs;
    totalNormMs += wsNormMs;
    totalNormalizationLookupMs += wsLookupMs;
    const wsTotalMs = Date.now() - worksheetStartMs;
    worksheetTimings.push({
      worksheetName: worksheet.worksheetName,
      aiMs: wsAiMs,
      headerMs: wsHeaderMs,
      rowCount: analysis.rows.length,
      detMs: wsDetMs,
      normMs: wsNormMs,
      lookupMs: wsLookupMs,
      totalMs: wsTotalMs,
    });
    logEvent("info", "[TIMING][STAGE] worksheet:done", {
      spreadsheetId: record.spreadsheetId,
      worksheetName: worksheet.worksheetName,
      timing: {
        aiMs: wsAiMs,
        headerMs: wsHeaderMs,
        rowCount: analysis.rows.length,
        detMs: wsDetMs,
        normMs: wsNormMs,
        lookupMs: wsLookupMs,
        totalMs: wsTotalMs,
      },
    });
  }

  if (stagedRows.length === 0 && validWorksheetCount === 0 && detectedRowCount === 0) {
    const deterministicImport = await readGoogleSpreadsheetImport({
      spreadsheetId: record.driveFileId,
      spreadsheetName: record.spreadsheetName,
      sourceGroup: record.sourceContext.sourceGroup as DriveSpreadsheetRecord["sourceContext"]["sourceGroup"],
      reimportStrategy,
    });
    const fallbackWorksheets = deterministicImport.worksheets.filter(
      (worksheet) => !isXAccountWorksheet(worksheet.worksheetName),
    );

    if (fallbackWorksheets.length > 0) {
      deterministicFallbackUsed = true;
      validWorksheetCount = fallbackWorksheets.length;

      logEvent("warn", "[TRACE_IMPORT_QUEUE][STAGE] fallback:deterministic-import", {
        spreadsheetId: record.spreadsheetId,
        spreadsheetName: record.spreadsheetName,
        availableWorksheets: deterministicImport.availableWorksheets.length,
        validWorksheetCount,
        rowCount: fallbackWorksheets.reduce(
          (total, worksheet) => total + worksheet.rows.length,
          0,
        ),
      });

      for (const worksheet of fallbackWorksheets) {
        for (const parsedRow of worksheet.rows) {
          detectedRowCount += 1;
          const stagedRow = {
            ...parsedRow,
            rowId: buildDeterministicRowId({
              spreadsheetId: record.driveFileId,
              worksheetName: parsedRow.worksheetName,
              rowNumber: parsedRow.rowNumber,
            }),
          };

          const stagedRowRecord = await buildStagedRowRecord({
            prisma,
            record,
            spreadsheetImport,
            row: stagedRow,
            reimportStrategy,
            originalRowId: parsedRow.rowId,
          });

          totalNormalizationLookupMs += stagedRowRecord.lookupMs;
          stagedRows.push(stagedRowRecord.row);

          if (stagedRowRecord.isQualified) {
            qualifiedRowCount += 1;
          }

          if (stagedRowRecord.isPublished) {
            alreadyPublishedRowCount += 1;
          }

          if (stagedRowRecord.isConflict) {
            conflictCount += 1;
          }

          if (stagedRowRecord.isRejected) {
            rejectedRowCount += 1;
          }

          if (stagedRowRecord.isSkipped) {
            skippedRowCount += 1;
          }
        }
      }
    }
  }

  const dedupedRows = Array.from(
    stagedRows.reduce<Map<string, Omit<Prisma.SpreadsheetImportRowCreateManyInput, "batchId">>>((accumulator, row) => {
      if (!accumulator.has(row.rowId)) {
        accumulator.set(row.rowId, row);
      }

      return accumulator;
    }, new Map()).values(),
  );

  logEvent("info", "Finished row qualification for spreadsheet staging", {
    driveFileId: record.driveFileId,
    spreadsheetId: record.spreadsheetId,
    rowsParsed: detectedRowCount,
    rowsAccepted: qualifiedRowCount,
    rowsRejected: rejectedRowCount,
    rowsSkipped: skippedRowCount,
    conflictRows: conflictCount,
    deterministicFallbackUsed,
    duplicateRowsRemoved: stagedRows.length - dedupedRows.length,
  });

  const batchStatus =
    existingHistory && existingHistory.status !== DriveImportBatchStatus.SENT_TO_QUEUE
      ? DriveImportBatchStatus.NEEDS_REIMPORT_DECISION
      : conflictCount > 0
        ? DriveImportBatchStatus.NEEDS_REIMPORT_DECISION
        : DriveImportBatchStatus.STAGED;

  // â”€â”€ TIMING: persistence (batch create + row createMany)
  const persistenceStartMs = Date.now();
  const batch = await prisma.spreadsheetImportBatch.create({
    data: {
      importedById: importedById ?? null,
      driveFileId: record.driveFileId,
      spreadsheetId: record.spreadsheetId,
      spreadsheetName: record.spreadsheetName,
      folderName: record.folderName,
      owner: record.sourceContext.owner,
      sourceGroup: record.sourceContext.sourceGroup,
      lastUpdatedAt: new Date(record.lastUpdatedAt),
      reimportStrategy,
      status: batchStatus,
      scanFingerprint: hashStablePayload({
        driveFileId: record.driveFileId,
        spreadsheetId: record.spreadsheetId,
        reimportStrategy,
        rowCount: detectedRowCount,
        worksheetCount: validWorksheetCount,
        stagedAt: new Date().toISOString(),
      }),
      sourceContext: toJsonValue(record.sourceContext),
      pipelineSignals: toJsonValue({
        folderName: record.folderName,
        relativePath: record.relativePath,
        matchingSignals: record.matchingSignals,
        worksheetCount: spreadsheetImport.worksheets.length,
        validWorksheetCount,
        deterministicFallbackUsed,
        pipelineKeyword: record.matchingSignals.includes("SMM Plan"),
      }),
      validWorksheetCount,
      detectedRowCount,
      qualifiedRowCount,
      importedRowCount: 0,
      updatedRowCount: 0,
      replacedRowCount: 0,
      keptRowCount: 0,
      conflictCount,
      alreadyPublishedRowCount,
    },
  });

  if (dedupedRows.length > 0) {
    await prisma.spreadsheetImportRow.createMany({
      data: dedupedRows.map((row) => ({
        batchId: batch.id,
        ...row,
      })),
    });
  }
  const persistenceMs = Date.now() - persistenceStartMs;
  const batchTotalMs = Date.now() - batchStartMs;

  logEvent("info", "Inserted staged spreadsheet rows", {
    batchId: batch.id,
    spreadsheetId: record.spreadsheetId,
    rowsInserted: dedupedRows.length,
  });
  logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] spreadsheet:done", {
    batchId: batch.id,
    spreadsheetId: record.spreadsheetId,
    spreadsheetName: record.spreadsheetName,
    batchStatus,
    rowsParsed: detectedRowCount,
    rowsAccepted: qualifiedRowCount,
    rowsRejected: rejectedRowCount,
    rowsSkipped: skippedRowCount,
    conflictRows: conflictCount,
    alreadyPublishedRowCount,
    rowsInserted: dedupedRows.length,
    deterministicFallbackUsed,
    // â”€â”€ TIMING: full breakdown attached to the terminal event for this batch
    timing: {
      batchTotalMs,
      discoveryMs,
      aiMs: totalAiMs,
      detMs: totalDetMs,
      normMs: totalNormMs,
      lookupMs: totalNormalizationLookupMs,
      persistenceMs,
      unaccountedMs:
        batchTotalMs -
        discoveryMs -
        totalAiMs -
        totalDetMs -
        totalNormMs -
        totalNormalizationLookupMs -
        persistenceMs,
      byWorksheet: worksheetTimings,
    },
  });

  const spreadsheet = await prisma.spreadsheetImportBatch.findUnique({
    where: { id: batch.id },
    include: {
      rows: true,
    },
  });

  if (!spreadsheet) {
    throw new Error("Failed to persist staged spreadsheet batch.");
  }

  return spreadsheet;
}

export async function scanDriveImportCatalogAction(input: DriveImportScanRequest = {}) {
  const session = await requireSession();
  const prisma = getPrisma();
  const actor = await prisma.user.findUnique({
    where: { email: session.email },
  });
  const userId = actor?.id ?? session.email;
  logEvent("info", "[TRACE_IMPORT_QUEUE][SCAN] start", {
    query: input.query ?? "",
    sourceGroup: input.sourceGroup ?? "ALL",
    page: input.page ?? 1,
    pageSize: input.pageSize ?? null,
    userId,
  });
  const result = await scanDriveImportSpreadsheets(input, { userId });
  logEvent("info", "[TRACE_IMPORT_QUEUE][SCAN] result", {
    total: result.total,
    returnedSpreadsheetIds: result.results.map((entry) => entry.record.driveFileId),
    source: result.source,
    scannedAt: result.scannedAt.toISOString(),
  });
  return result;
}

export async function stageDriveImportSpreadsheetsAction(input: DriveImportStageRequest) {
  const session = await requireSession();
  const prisma = getPrisma();
  const actor = await prisma.user.findUnique({
    where: { email: session.email },
  });
  const cacheUserId = actor?.id ?? session.email;

  const driveFileIds = Array.from(new Set(input.driveFileIds));
  logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] request", {
    driveFileIds,
    reimportStrategy: input.reimportStrategy ?? DriveReimportStrategy.UPDATE,
    actorEmail: session.email,
    userId: cacheUserId,
  });
  const records = (
    await Promise.all(
      driveFileIds.map(async (driveFileId) => resolveDriveSpreadsheetRecord(driveFileId, cacheUserId)),
    )
  ).filter((record): record is DriveSpreadsheetRecord => Boolean(record));

  const spreadsheets: StagedSpreadsheetSnapshot[] = [];
  let staged = 0;
  let conflicts = 0;
  let publishedRows = 0;

  for (const record of records) {
    const spreadsheet = await stageDriveSpreadsheetToStaging({
      prisma,
      record,
      reimportStrategy: input.reimportStrategy ?? DriveReimportStrategy.UPDATE,
      importedById: actor?.id ?? null,
    });

    spreadsheets.push({
      id: spreadsheet.id,
      driveFileId: spreadsheet.driveFileId,
      spreadsheetId: spreadsheet.spreadsheetId,
      spreadsheetName: spreadsheet.spreadsheetName,
      folderName: spreadsheet.folderName,
      owner: spreadsheet.owner,
      sourceGroup: spreadsheet.sourceGroup,
      lastUpdatedAt: spreadsheet.lastUpdatedAt ? spreadsheet.lastUpdatedAt.toISOString() : null,
      state: spreadsheet.status === DriveImportBatchStatus.SENT_TO_QUEUE
        ? DriveSpreadsheetState.SENT_TO_QUEUE
        : spreadsheet.status === DriveImportBatchStatus.PARTIALLY_SENT
          ? DriveSpreadsheetState.PARTIALLY_SENT
          : spreadsheet.status === DriveImportBatchStatus.NEEDS_REIMPORT_DECISION
            ? DriveSpreadsheetState.NEEDS_REIMPORT_DECISION
            : DriveSpreadsheetState.STAGED,
      reimportStrategy: spreadsheet.reimportStrategy,
      importedAt: spreadsheet.stagedAt.toISOString(),
      queuedAt: spreadsheet.queuedAt ? spreadsheet.queuedAt.toISOString() : null,
      validWorksheetCount: spreadsheet.validWorksheetCount,
      totalRowsDetected: spreadsheet.detectedRowCount,
      qualifiedRowsDetected: spreadsheet.qualifiedRowCount,
      conflictRowsDetected: spreadsheet.conflictCount,
      alreadyPublishedRowCount: spreadsheet.alreadyPublishedRowCount,
      importedRowCount: spreadsheet.importedRowCount,
      updatedRowCount: spreadsheet.updatedRowCount,
      replacedRowCount: spreadsheet.replacedRowCount,
      keptRowCount: spreadsheet.keptRowCount,
      skippedRowCount: spreadsheet.detectedRowCount - spreadsheet.qualifiedRowCount - spreadsheet.conflictCount,
      rejectedRowCount:
        spreadsheet.detectedRowCount -
        spreadsheet.importedRowCount -
        spreadsheet.replacedRowCount -
        spreadsheet.keptRowCount,
      sourceContext: spreadsheet.sourceContext as Record<string, unknown>,
      pipelineSignals: spreadsheet.pipelineSignals as Record<string, unknown>,
    });

    staged += 1;
    conflicts += spreadsheet.conflictCount;
    publishedRows += spreadsheet.alreadyPublishedRowCount;
  }

  revalidatePath("/import");

  logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] summary", {
    requestedDriveFileIds: driveFileIds,
    resolvedDriveFileIds: records.map((record) => record.driveFileId),
    batchIdsCreated: spreadsheets.map((spreadsheet) => spreadsheet.id),
    staged,
    conflicts,
    publishedRows,
  });

  return {
    scanned: records.length,
    staged,
    conflicts,
    publishedRows,
    spreadsheets,
  } satisfies ImportToStagingResult;
}

async function getResolvedRowDecision(
  prisma: unknown,
  row: Prisma.SpreadsheetImportRowGetPayload<{
    include: never;
  }>,
) {
  if (row.conflictAction) {
    return row.conflictAction;
  }

  if (row.conflictConfidence === DriveConflictConfidence.HIGH_CONFIDENCE_DUPLICATE) {
    return DriveReimportStrategy.UPDATE;
  }

  if (row.conflictConfidence === DriveConflictConfidence.POSSIBLE_DUPLICATE) {
    return DriveReimportStrategy.KEEP_AS_IS;
  }

  return DriveReimportStrategy.KEEP_AS_IS;
}

function buildQueueSendResultFromSpreadsheet(
  spreadsheet: SpreadsheetImportBatch & { rows: SpreadsheetImportRow[] },
): QueueSendResult {
  const counts = spreadsheet.rows.reduce(
    (accumulator, row) => {
      switch (row.rowStatus) {
        case DriveSpreadsheetRowState.QUEUED:
          accumulator.createdRows += 1;
          break;
        case DriveSpreadsheetRowState.UPDATED:
          accumulator.updatedRows += 1;
          break;
        case DriveSpreadsheetRowState.REPLACED:
          accumulator.replacedRows += 1;
          break;
        case DriveSpreadsheetRowState.KEPT_AS_IS:
          accumulator.keptRows += 1;
          break;
        case DriveSpreadsheetRowState.PUBLISHED_COMPLETE:
          accumulator.publishedRows += 1;
          break;
        case DriveSpreadsheetRowState.SKIPPED:
          accumulator.skippedRows += 1;
          break;
        case DriveSpreadsheetRowState.REJECTED:
          accumulator.rejectedRows += 1;
          break;
        default:
          break;
      }

      return accumulator;
    },
    {
      createdRows: 0,
      updatedRows: 0,
      replacedRows: 0,
      keptRows: 0,
      publishedRows: 0,
      skippedRows: 0,
      rejectedRows: 0,
    },
  );

  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetImportId: spreadsheet.id,
    sentRows:
      counts.createdRows +
      counts.updatedRows +
      counts.replacedRows +
      counts.keptRows +
      counts.publishedRows,
    ...counts,
    conflicts: spreadsheet.conflictCount,
    receiptIds: [],
    contentItemIds: [],
    state: toSpreadsheetState(spreadsheet.status as DriveImportBatchStatus),
  };
}

export async function sendStagedSpreadsheetToWorkflowQueueAction(
  spreadsheetImportId: string,
) {
  const session = await requireSession();
  const prisma = getPrisma();
  const actor = await prisma.user.findUnique({
    where: { email: session.email },
  });

  const spreadsheet = await prisma.spreadsheetImportBatch.findUnique({
    where: { id: spreadsheetImportId },
    include: {
      rows: {
        orderBy: [{ rowNumber: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!spreadsheet) {
    logEvent("warn", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] missing-batch", {
      spreadsheetImportId,
    });
    return null;
  }

  if (spreadsheet.status === DriveImportBatchStatus.SENT_TO_QUEUE) {
    logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] already-completed", {
      spreadsheetImportId: spreadsheet.id,
      spreadsheetId: spreadsheet.spreadsheetId,
    });
    return buildQueueSendResultFromSpreadsheet(spreadsheet);
  }

  logEvent("info", "Sending staged spreadsheet to workflow queue", {
    spreadsheetImportId,
    spreadsheetId: spreadsheet.spreadsheetId,
    stagedRows: spreadsheet.rows.length,
  });
  logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] start", {
    spreadsheetImportId,
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetName: spreadsheet.spreadsheetName,
    batchStatus: spreadsheet.status,
    stagedRows: spreadsheet.rows.length,
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const receiptIds: string[] = [];
      const contentItemIds: string[] = [];
      let createdRows = 0;
      let updatedRows = 0;
      let replacedRows = 0;
      let keptRows = 0;
      let publishedRows = 0;
      let skippedRows = 0;
      let rejectedRows = 0;
      let conflicts = 0;

      for (const row of spreadsheet.rows) {
        if (row.rowStatus === DriveSpreadsheetRowState.SKIPPED) {
          skippedRows += 1;
          logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] row:skip", {
            spreadsheetImportId: spreadsheet.id,
            rowId: row.rowId,
            rowStatus: row.rowStatus,
          });
          continue;
        }

        if (row.rowStatus === DriveSpreadsheetRowState.REJECTED) {
          rejectedRows += 1;
          logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] row:reject", {
            spreadsheetImportId: spreadsheet.id,
            rowId: row.rowId,
            rowStatus: row.rowStatus,
          });
          continue;
        }

        const decision = await getResolvedRowDecision(tx, row);
        logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] row:start", {
          spreadsheetImportId: spreadsheet.id,
          rowId: row.rowId,
          rowStatus: row.rowStatus,
          existingContentItemId: row.existingContentItemId,
          conflictConfidence: row.conflictConfidence,
          resolvedDecision: decision,
          hasNormalizedPayload: Boolean(row.normalizedPayload),
        });

        if (
          decision === DriveReimportStrategy.KEEP_AS_IS &&
          row.existingContentItemId &&
          row.rowStatus !== DriveSpreadsheetRowState.PUBLISHED_COMPLETE
        ) {
          keptRows += 1;
          logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] row:kept-existing", {
            spreadsheetImportId: spreadsheet.id,
            rowId: row.rowId,
            existingContentItemId: row.existingContentItemId,
            reason: "decision_keep_as_is",
          });

          await tx.spreadsheetImportRow.update({
            where: {
              batchId_rowId: {
                batchId: spreadsheet.id,
                rowId: row.rowId,
              },
            },
            data: {
              rowStatus: DriveSpreadsheetRowState.KEPT_AS_IS,
              contentItemId: row.existingContentItemId,
              conflictAction: decision,
              reason: "Existing workflow item preserved during queue send.",
            },
          });

          continue;
        }

        const normalizedPayload = row.normalizedPayload as Record<string, unknown>;
        const workflow = (normalizedPayload.workflow as Record<string, unknown> | undefined) ?? {};
        const content = (normalizedPayload.content as Record<string, unknown> | undefined) ?? {};
        const source = (normalizedPayload.source as Record<string, unknown> | undefined) ?? {};
        const sourceMetadata = (normalizedPayload.sourceMetadata as Record<string, unknown> | undefined) ?? {};
        const translationRequired = Boolean(workflow.translationRequired ?? content.translationRequired);
        const translationCopy =
          typeof content.translationCopy === "string"
            ? content.translationCopy
            : translationRequired
              ? generateMockTranslationDraft({
                  sourceText: String(content.copy ?? ""),
                  sourceLocale: String(content.locale ?? "en"),
                  targetLocale: "pt-br",
                })
              : null;

        const finalPayload = {
          ...normalizedPayload,
          workflow: {
            ...workflow,
            translationRequired,
            reimportStrategy:
              row.rowStatus === DriveSpreadsheetRowState.PUBLISHED_COMPLETE
                ? DriveReimportStrategy.REPLACE
                : decision,
            equivalenceTargetContentItemId: row.existingContentItemId ?? undefined,
            conflictConfidence: row.conflictConfidence,
          },
          content: {
            ...content,
            translationRequired,
            translationCopy: translationCopy ?? undefined,
          },
          sourceMetadata,
          source,
        };

        if (
          decision !== DriveReimportStrategy.KEEP_AS_IS &&
          row.existingContentItemId &&
          row.conflictConfidence !== DriveConflictConfidence.NO_MEANINGFUL_MATCH
        ) {
          conflicts += 1;
        }

        const result = await importContentItem(finalPayload, { prisma: tx });
        const contentItemId =
          "contentItemId" in result && typeof result.contentItemId === "string"
            ? result.contentItemId
            : null;

        if (contentItemId) {
          contentItemIds.push(contentItemId);
        }

        if ("receiptId" in result && typeof result.receiptId === "string") {
          receiptIds.push(result.receiptId);
        }

        const nextRowState =
          row.rowStatus === DriveSpreadsheetRowState.PUBLISHED_COMPLETE
            ? DriveSpreadsheetRowState.PUBLISHED_COMPLETE
            : result.duplicate
              ? DriveSpreadsheetRowState.DUPLICATE
              : row.existingContentItemId && decision === DriveReimportStrategy.REPLACE
                ? DriveSpreadsheetRowState.REPLACED
                : row.existingContentItemId && decision === DriveReimportStrategy.UPDATE
                  ? DriveSpreadsheetRowState.UPDATED
                  : row.existingContentItemId
                    ? DriveSpreadsheetRowState.KEPT_AS_IS
                    : DriveSpreadsheetRowState.QUEUED;

        if (nextRowState === DriveSpreadsheetRowState.QUEUED) {
          createdRows += 1;
        } else if (nextRowState === DriveSpreadsheetRowState.UPDATED) {
          updatedRows += 1;
        } else if (nextRowState === DriveSpreadsheetRowState.REPLACED) {
          replacedRows += 1;
        } else if (nextRowState === DriveSpreadsheetRowState.KEPT_AS_IS) {
          keptRows += 1;
        } else if (nextRowState === DriveSpreadsheetRowState.PUBLISHED_COMPLETE) {
          publishedRows += 1;
        }

        await tx.spreadsheetImportRow.update({
          where: {
            batchId_rowId: {
              batchId: spreadsheet.id,
              rowId: row.rowId,
            },
          },
          data: {
            rowStatus: nextRowState,
            contentItemId,
            conflictAction: decision,
            existingContentItemId: row.existingContentItemId,
            reason:
              row.reason ??
              (nextRowState === DriveSpreadsheetRowState.QUEUED
                ? "Queued into the workflow items table."
                : nextRowState === DriveSpreadsheetRowState.UPDATED
                  ? "Updated an existing workflow item."
                  : nextRowState === DriveSpreadsheetRowState.REPLACED
                    ? "Replaced the existing workflow item content."
                    : nextRowState === DriveSpreadsheetRowState.PUBLISHED_COMPLETE
                      ? "Imported as already published."
                      : "Kept as-is during queue send."),
            normalizedPayload: toJsonValue(finalPayload),
          },
        });

        logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] row:done", {
          spreadsheetImportId: spreadsheet.id,
          rowId: row.rowId,
          nextRowState,
          contentItemId,
          duplicate: result.duplicate,
          receiptId: "receiptId" in result ? result.receiptId : null,
        });
      }

      const nextState =
        conflicts > 0
          ? DriveImportBatchStatus.NEEDS_REIMPORT_DECISION
          : updatedRows > 0 || replacedRows > 0
            ? DriveImportBatchStatus.PARTIALLY_SENT
            : DriveImportBatchStatus.SENT_TO_QUEUE;

      await tx.spreadsheetImportBatch.update({
        where: { id: spreadsheet.id },
        data: {
          status: nextState,
          queuedAt: new Date(),
          importedById: spreadsheet.importedById ?? actor?.id ?? null,
          updatedRowCount: updatedRows,
          replacedRowCount: replacedRows,
          keptRowCount: keptRows,
          importedRowCount: createdRows + updatedRows + replacedRows + keptRows + publishedRows,
          conflictCount: Math.max(spreadsheet.conflictCount, conflicts),
        },
      });

      return {
        spreadsheetId: spreadsheet.spreadsheetId,
        spreadsheetImportId: spreadsheet.id,
        sentRows: createdRows + updatedRows + replacedRows + keptRows + publishedRows,
        createdRows,
        updatedRows,
        replacedRows,
        keptRows,
        publishedRows,
        skippedRows,
        rejectedRows,
        conflicts,
        receiptIds,
        contentItemIds,
        state: nextState,
      } satisfies QueueSendResult;
    });

    revalidatePath("/queue");
    revalidatePath("/import");

    logEvent("info", "Finished sending staged spreadsheet to workflow queue", {
      spreadsheetImportId: spreadsheet.id,
      spreadsheetId: spreadsheet.spreadsheetId,
      rowsInserted: result.sentRows,
      itemsCreatedInQueue: result.createdRows,
      itemsUpdatedInQueue: result.updatedRows,
      skippedRows: result.skippedRows,
      rejectedRows: result.rejectedRows,
      conflicts: result.conflicts,
    });
    logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] summary", {
      spreadsheetImportId: spreadsheet.id,
      spreadsheetId: spreadsheet.spreadsheetId,
      nextState: result.state,
      createdRows: result.createdRows,
      updatedRows: result.updatedRows,
      replacedRows: result.replacedRows,
      keptRows: result.keptRows,
      publishedRows: result.publishedRows,
      skippedRows: result.skippedRows,
      rejectedRows: result.rejectedRows,
      conflicts: result.conflicts,
      contentItemIds: result.contentItemIds,
      receiptIds: result.receiptIds,
    });

    return result;
  } catch (error) {
    await prisma.spreadsheetImportBatch.update({
      where: { id: spreadsheet.id },
      data: {
        status: DriveImportBatchStatus.FAILED,
        importedById: spreadsheet.importedById ?? actor?.id ?? null,
      },
    });

    logEvent("error", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] failed", {
      spreadsheetImportId: spreadsheet.id,
      spreadsheetId: spreadsheet.spreadsheetId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

export async function sendSelectedStagedSpreadsheetsToWorkflowQueueAction(input: {
  batchIds: string[];
}) {
  await requireSession();

  const results: QueueSendResult[] = [];
  for (const batchId of Array.from(new Set(input.batchIds))) {
    const result = await sendStagedSpreadsheetToWorkflowQueueAction(batchId);
    if (result) {
      results.push(result);
    }
  }

  const summary = results.reduce(
    (accumulator, result) => {
      accumulator.sentRows += result.sentRows;
      accumulator.createdRows += result.createdRows;
      accumulator.updatedRows += result.updatedRows;
      accumulator.replacedRows += result.replacedRows;
      accumulator.keptRows += result.keptRows;
      accumulator.publishedRows += result.publishedRows;
      accumulator.skippedRows += result.skippedRows;
      accumulator.rejectedRows += result.rejectedRows;
      accumulator.conflicts += result.conflicts;
      return accumulator;
    },
    {
      sentRows: 0,
      createdRows: 0,
      updatedRows: 0,
      replacedRows: 0,
      keptRows: 0,
      publishedRows: 0,
      skippedRows: 0,
      rejectedRows: 0,
      conflicts: 0,
    },
  );

  revalidatePath("/import");
  revalidatePath("/queue");

  return {
    ...summary,
    batches: results,
  };
}

export async function listDriveImportBatchesAction() {
  await requireSession();
  const prisma = getPrisma();
  const batches = await prisma.spreadsheetImportBatch.findMany({
    orderBy: [{ stagedAt: "desc" }, { updatedAt: "desc" }],
    include: {
      rows: {
        orderBy: [{ rowNumber: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return batches.map((batch) => buildSpreadsheetSnapshot(batch));
}

export async function listDriveImportSpreadsheetsAction(input: DriveImportScanRequest = {}) {
  const session = await requireSession();
  const prisma = getPrisma();
  const actor = await prisma.user.findUnique({
    where: { email: session.email },
  });
  const userId = actor?.id ?? session.email;

  return await listDriveImportSpreadsheets(input, { userId });
}

export async function getDriveImportSummaryAction() {
  const session = await requireSession();
  const prisma = getPrisma();
  const actor = await prisma.user.findUnique({
    where: { email: session.email },
  });
  const userId = actor?.id ?? session.email;
  const records = await listDriveImportSpreadsheets({}, { userId });
  return {
    spreadsheetCount: getDriveImportSpreadsheetCount(userId),
    sourceGroups: getDriveImportSourceGroups(),
    source: records.source,
    scannedAt: records.scannedAt,
  };
}
