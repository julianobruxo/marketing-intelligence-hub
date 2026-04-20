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
import { inferContentOperationalStatus } from "../domain/infer-content-status";
import {
  contentIngestionPayloadSchema,
  type ContentIngestionPayload,
} from "../domain/ingestion-contract";
import {
  normalizeComparableText,
  normalizeHeaderText,
  scoreComparableText,
  normalizeBooleanish,
  X_ACCOUNT_WORKSHEET_PATTERN,
  isXAccountWorksheet,
  buildWorksheetColumnMap,
  extractColumnarRowFields,
  isRowQueueCandidate as _isRowQueueCandidate,
  buildFallbackTitle,
  buildContentSignature as _buildContentSignature,
  type WorksheetField,
  type WorksheetColumnMap,
  type WorksheetExtractedFields,
  WORKSHEET_FIELD_ALIASES,
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

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hashStablePayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
    platformLabel: row.planningFields.platformLabel,
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

// normalizeBooleanish imported from __internal__/queue-helpers

function buildAiReasoning(row: AiSheetAnalysisRow) {
  return row.semantic.reasoning.length > 0
    ? row.semantic.reasoning
    : ["AI semantic extractor did not provide explicit reasoning."];
}

function isAiRowQualified(row: AiSheetAnalysisRow) {
  if (row.semantic.is_empty_or_unusable) {
    return false;
  }

  return (
    row.semantic.has_editorial_brief ||
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
    has_editorial_brief: aiRow.semantic.has_editorial_brief,
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

  if (
    row.semantic.has_final_copy &&
    (row.semantic.has_title || row.semantic.has_editorial_brief)
  ) {
    return "HIGH";
  }

  if (
    row.semantic.has_final_copy ||
    row.semantic.has_title ||
    row.semantic.has_editorial_brief
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function extractSourceAssetLink(rowMap: Record<string, string>) {
  for (const value of Object.values(rowMap)) {
    if (!value || typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    if (!/^https?:\/\//i.test(trimmed)) {
      continue;
    }

    if (
      /(png|jpg|jpeg|gif|webp|canva|figma|image|img|asset|drive\.google\.com)/i.test(
        trimmed,
      )
    ) {
      return trimmed;
    }
  }

  return undefined;
}

function deriveOperationalStatusFromAiRow(input: {
  copyEnglish: string;
  contentDeadline?: string;
  publishedFlag?: string | boolean;
}) {
  return inferContentOperationalStatus({
    planning: {
      copyEnglish: input.copyEnglish,
      contentDeadline: input.contentDeadline,
    },
    sourceMetadata: {
      publishedFlag: input.publishedFlag,
    },
  });
}

// buildFallbackTitle imported from __internal__/queue-helpers

function padHeaders(headers: string[], rowValues: string[]) {
  const nextHeaders = [...headers];
  while (nextHeaders.length < rowValues.length) {
    nextHeaders.push(`Column ${nextHeaders.length + 1}`);
  }

  return nextHeaders.length > 0 ? nextHeaders : rowValues.map((_, index) => `Column ${index + 1}`);
}

function normalizeRowValues(headers: string[], rowValues: string[]) {
  const nextRowValues = [...rowValues];
  while (nextRowValues.length < headers.length) {
    nextRowValues.push("");
  }

  return nextRowValues.slice(0, headers.length);
}

function buildRowMap(headers: string[], rowValues: string[]) {
  return headers.reduce<Record<string, string>>((accumulator, header, index) => {
    accumulator[header] = rowValues[index] ?? "";
    return accumulator;
  }, {});
}

function buildAiRowSearchText(row: AiSheetAnalysisResult["rows"][number]) {
  return normalizeComparableText(
    [
      row.data.date ?? "",
      row.data.ideaOrBrief ?? "",
      row.data.title ?? "",
      row.data.copy ?? "",
      row.data.deadline ?? "",
      row.data.published ?? "",
      row.data.channel ?? "",
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

  const copy = optionalTrimmed(row.data.copy);
  if (copy) {
    const normalizedCopy = normalizeComparableText(copy);
    score += rowText.includes(normalizedCopy) ? 3 : scoreComparableText(copy, rowText) * 3;
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

  const channel = optionalTrimmed(row.data.channel);
  if (channel) {
    const normalizedChannel = normalizeComparableText(channel);
    score += rowText.includes(normalizedChannel) ? 1 : scoreComparableText(channel, rowText);
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
  { pattern: /^\s*week\s*\d+\s*(?:[-–—].*)?$/i, label: "week separator" },
  { pattern: /^\s*semana\s*\d+\s*(?:[-–—].*)?$/i, label: "semana (PT week separator)" },
  { pattern: /^\s*w\d{1,2}\s*(?:[-–—].*)?$/i, label: "week abbreviation separator" },
  { pattern: /^\s*hashtags?\s*(?:[:：#].*)?$/i, label: "hashtag block header" },
  { pattern: /^\s*qr\s*code\s*(?:link)?[:：]?\s*$/i, label: "QR code block" },
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
  // then against the concatenated text of sparse rows (≤2 non-empty cells)
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

  // Minimum content gate — only applied when AI semantic extraction marked the row as qualified.
  // Goal: catch sparse/false-positive rows without losing real incomplete work items.
  if (isAiRowQualified(aiRow)) {
    const hasTitle = Boolean(aiRow.data.title?.trim());
    const hasBrief = Boolean(aiRow.data.ideaOrBrief?.trim());
    const hasCopy = Boolean(aiRow.data.copy?.trim());
    const hasPublishedSignal = Boolean(aiRow.data.published?.trim()) || aiRow.semantic.is_published;
    const hasDate = Boolean(aiRow.data.date?.trim());
    const hasDeadline = Boolean(aiRow.data.deadline?.trim());
    const hasChannel = Boolean(aiRow.data.channel?.trim());
    const hasSchedulingSignal = hasDate || hasDeadline || hasChannel;

    if (!hasTitle && !hasBrief && !hasCopy && !hasPublishedSignal && aiRow.semantic.needs_human_review) {
      return {
        allowed: false,
        reason: "AI flagged the row for human review without enough operational content signals.",
        disposition: "SKIPPED_NON_DATA",
      };
    }

    // If AI extracted absolutely nothing across all six fields, something is wrong.
    if (!hasTitle && !hasBrief && !hasCopy && !hasPublishedSignal && !hasSchedulingSignal) {
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
  const semanticReasoning = buildAiReasoning(row);
  const rowConfidence = deriveAiRowConfidence(row);

  const sourceAssetLink = extractSourceAssetLink(rowMap);

  // Phase 1 — deterministic extraction: use the worksheet column map (built once per
  // worksheet) to read canonical field values directly from raw row cells.
  // The sheet is the source of truth; AI is only consulted to fill gaps.
  const det = extractColumnarRowFields(headerContext.colMap, rowValues);

  // Phase 1.5 — embedded multi-line cell fallback for old/transitional sheet formats.
  // Old Yann format: a column with an empty header (or the "Copywriter Brief" column in
  // transitional sheets) holds "{channel}\n\n{TITLE}\n\n{brief}".
  // We check rowMap[""] first (truly old format), then det.brief (transitional format where
  // the "Copywriter Brief" header is present but the Title column is still empty for some rows).
  if (det.title === undefined) {
    const multiLineSource = rowMap[""]?.trim() ?? det.brief?.trim();
    if (multiLineSource) {
      const paragraphs = multiLineSource.split("\n\n").map((p) => p.trim()).filter(Boolean);
      // paragraphs[0] = channel label ("LinkedIn"), paragraphs[1] = title, paragraphs[2+] = brief
      if (paragraphs.length >= 2 && paragraphs[1].length > 0 && paragraphs[1].length <= 120) {
        det.title = paragraphs[1];
        if (det.brief === undefined && paragraphs.length >= 3) {
          det.brief = paragraphs.slice(2).join("\n\n").trim() || undefined;
        }
      }
    }
  }

  // Phase 2 — AI fills gaps only where the deterministic layer found nothing.
  const plannedDate = det.plannedDate ?? optionalTrimmed(row.data.date);
  const rawIdeaOrBrief = det.brief ?? optionalTrimmed(row.data.ideaOrBrief);
  const rawCampaignLabel = det.title ?? optionalTrimmed(row.data.title);
  const copyEnglish = row.semantic.has_final_copy
    ? (det.linkedinCopy ?? optionalTrimmed(row.data.copy) ?? "")
    : (det.linkedinCopy ?? "");
  const contentDeadline = det.contentDeadline ?? optionalTrimmed(row.data.deadline);
  const platformLabel = det.platformLabel ?? optionalTrimmed(row.data.channel);
  const publishedFlag = det.publishedFlag ?? optionalTrimmed(row.data.published);

  // Phase 3 — title precedence: only apply the generic-topic-label heuristic when the
  // title was AI-derived. A value read from a named title column is canonical and must not
  // be reclassified as a topic label regardless of length.
  const isDeterministicTitle = det.title !== undefined;
  const isGenericTopicLabel =
    !isDeterministicTitle &&
    !!copyEnglish &&
    !!rawCampaignLabel &&
    rawCampaignLabel.length <= 40 &&
    !/[.!?]$/.test(rawCampaignLabel);
  const campaignLabel = isGenericTopicLabel ? undefined : rawCampaignLabel;
  const ideaOrBrief = rawIdeaOrBrief ?? (isGenericTopicLabel ? rawCampaignLabel : undefined);

  const title = buildFallbackTitle({
    title: campaignLabel,
    copy: copyEnglish,
    date: plannedDate,
    rowNumber: rowIndex,
  });
  const isPublishedRow = row.semantic.is_published || normalizeBooleanish(publishedFlag);
  const operationalStatus = deriveOperationalStatusFromAiRow({
    copyEnglish,
    contentDeadline,
    publishedFlag: isPublishedRow ? publishedFlag ?? true : publishedFlag,
  });

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
      reasons: semanticReasoning,
      signals: {
        hasDate: Boolean(plannedDate),
        hasTitle: row.semantic.has_title || Boolean(campaignLabel),
        hasCopy: row.semantic.has_final_copy || copyEnglish.trim().length > 0,
        hasPlatform: Boolean(platformLabel),
        hasLink:
          row.semantic.has_design_evidence ||
          Object.values(rowMap).some((value) => value.includes("http://") || value.includes("https://")),
        hasPublicationMarker: row.semantic.is_published || Boolean(publishedFlag),
      },
      isPublishedRow,
    },
    titleDerivation: campaignLabel
      ? {
          strategy: "EXPLICIT_MAPPED_FIELD",
          title,
          sourceField: "campaignLabel",
        }
      : copyEnglish
        ? {
            strategy: "PROFILE_FALLBACK_FIELD",
            title,
            sourceField: "copyEnglish",
          }
        : {
            strategy: "HEURISTIC_LAST_RESORT",
            title,
          },
    planningFields: {
      plannedDate,
      platformLabel,
      campaignLabel,
      ideaOrBrief,
      copyEnglish,
      sourceAssetLink,
      contentDeadline,
      copyLanguageIsFallback: row.semantic.copy_language_is_fallback,
    },
    sourceMetadata: {
      publishedFlag,
      extra: {
        aiSemantic: row.semantic,
        aiReasoning: semanticReasoning,
        aiDerivedConfidence: rowConfidence,
      },
    },
    contentProfile: inferContentProfileFromSourceGroup(sourceGroup),
    operationalStatus,
    translationRequired: false,
    autoPostEnabled: false,
    preferredDesignProvider: "MANUAL",
    contentSignature: normalizeComparableText(
      [
        sourceGroup,
        plannedDate ?? "",
        platformLabel ?? "",
        title,
        copyEnglish,
      ].join(" | "),
    ),
  };

  return parsedRow;
}

async function resolveDriveSpreadsheetRecord(driveFileId: string) {
  const cached = getDriveImportSpreadsheetById(driveFileId);
  if (cached) {
    return cached;
  }

  const records = await listDriveImportSpreadsheets();
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
      rawRow: row.rowMap,
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
    idea: row.planningFields.ideaOrBrief ?? row.planningFields.campaignLabel ?? null,
    copy: row.planningFields.copyEnglish,
    translationDraft: normalizedPayload?.content.translationCopy ?? null,
    plannedDate: row.planningFields.plannedDate ?? null,
    publishedFlag:
      row.sourceMetadata.publishedFlag === undefined || row.sourceMetadata.publishedFlag === null
        ? null
        : String(row.sourceMetadata.publishedFlag),
    publishedPostUrl: row.sourceMetadata.publishedPostUrl ?? null,
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
      headers: row.headers,
      rowValues: row.rowValues,
      rowMap: row.rowMap,
      qualification: row.rowQualification,
      planningFields: row.planningFields,
      sourceMetadata: row.sourceMetadata,
      titleDerivation: row.titleDerivation,
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
  const spreadsheetImport = await readGoogleSpreadsheetWorkbook({
    spreadsheetId: record.driveFileId,
    spreadsheetName: record.spreadsheetName,
    sourceGroup: record.sourceContext.sourceGroup as DriveSpreadsheetRecord["sourceContext"]["sourceGroup"],
  });

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

  logEvent("info", "Parsing spreadsheet rows for staging", {
    driveFileId: record.driveFileId,
    spreadsheetId: record.spreadsheetId,
    spreadsheetName: record.spreadsheetName,
    worksheetCount: spreadsheetImport.worksheets.length,
  });

  for (const worksheet of spreadsheetImport.worksheets) {
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

    const analysis = await analyzeSheetWithAI({
      spreadsheetName: record.spreadsheetName,
      sheetName: worksheet.worksheetName,
      rows: worksheet.rows,
      detectedHeaders: worksheet.detectedHeaders,
    });

    logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] worksheet:start", {
      spreadsheetId: record.spreadsheetId,
      worksheetId: worksheet.worksheetId,
      worksheetName: worksheet.worksheetName,
      parsedRows: analysis.rows.length,
      tableDetected: analysis.tableDetected,
      detectedHeaders: worksheet.detectedHeaders,
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
    const headerContext = resolveWorksheetHeaderContext(worksheet, analysis);
    const usedWorksheetRowNumbers = new Set<number>();

    for (const aiRow of analysis.rows) {
      detectedRowCount += 1;
      const aiReasoning = buildAiReasoning(aiRow);
      const rawRowAtReportedIndex = worksheet.rows[aiRow.rowIndex - 1] ?? [];
      const det = extractColumnarRowFields(headerContext.colMap, rawRowAtReportedIndex);

      // Deterministic-first queue candidate check.
      // Replaces the old aiQualified && aiLinkedInOnly gate:
      // - X Account worksheets are already excluded at the worksheet level above.
      // - Substack, teaser, and brief-only rows qualify via deterministic extraction
      //   even when the AI marks them as is_non_linkedin_platform / is_empty_or_unusable.
      if (!isRowQueueCandidate(aiRow, det)) {
        skippedRowCount += 1;
        logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] row:skip-not-queue-candidate", {
          spreadsheetId: record.spreadsheetId,
          worksheetId: worksheet.worksheetId,
          worksheetName: worksheet.worksheetName,
          rowIndex: aiRow.rowIndex,
          isEmptyOrUnusable: aiRow.semantic.is_empty_or_unusable,
          needsHumanReview: aiRow.semantic.needs_human_review,
          detQualified: Boolean(det.plannedDate) && (Boolean(det.title) || Boolean(det.brief) || Boolean(det.linkedinCopy)),
          reason: aiReasoning.join(" | "),
        });
        continue;
      }
      // Post-AI filter: deterministic skip patterns (week separators, QR code rows, etc.)
      // + minimum content gate for AI-qualified rows.
      const filterResult = postAiFilterRow(aiRow, rawRowAtReportedIndex);

      if (!filterResult.allowed) {
        skippedRowCount += 1;
        logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] row:post-ai-filter", {
          spreadsheetId: record.spreadsheetId,
          worksheetId: worksheet.worksheetId,
          worksheetName: worksheet.worksheetName,
          rowIndex: aiRow.rowIndex,
          semantic: aiRow.semantic,
          filterReason: filterResult.reason,
        });
        continue;
      }

      const resolvedRow = resolveAiRowNumber({
        worksheet,
        headerContext,
        row: aiRow,
        usedRowNumbers: usedWorksheetRowNumbers,
      });

      if (resolvedRow.rowNumber === null) {
        skippedRowCount += 1;
        logEvent("warn", "[TRACE_IMPORT_QUEUE][STAGE] row:out-of-range", {
          spreadsheetId: record.spreadsheetId,
          worksheetId: worksheet.worksheetId,
          worksheetName: worksheet.worksheetName,
          rowIndex: aiRow.rowIndex,
          semantic: aiRow.semantic,
          worksheetRowCount: worksheet.rows.length,
          reason: aiReasoning.join(" | "),
        });
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
          reason: aiReasoning.join(" | "),
        });
      }

      usedWorksheetRowNumbers.add(resolvedRow.rowNumber);

      const row = buildAiParsedRow({
        worksheet,
        headerContext,
        rowIndex: resolvedRow.rowNumber,
        row: aiRow,
        sourceGroup: record.sourceContext.sourceGroup,
      });

      const stagedRow = {
        ...row,
        rowId: buildDeterministicRowId({
          spreadsheetId: record.driveFileId,
          worksheetName: row.worksheetName,
          rowNumber: row.rowNumber,
        }),
      };

      const exactSourceLink =
        (await prisma.contentSourceLink.findUnique({
          where: {
            upstreamSystem_spreadsheetId_worksheetId_rowId: {
              upstreamSystem: "GOOGLE_SHEETS" as UpstreamSystem,
              spreadsheetId: record.driveFileId,
              worksheetId: stagedRow.worksheetId,
              rowId: stagedRow.rowId,
            },
          },
          select: {
            contentItemId: true,
          },
        })) ??
        (await prisma.contentSourceLink.findUnique({
          where: {
            upstreamSystem_spreadsheetId_worksheetId_rowId: {
              upstreamSystem: "GOOGLE_SHEETS" as UpstreamSystem,
              spreadsheetId: record.driveFileId,
              worksheetId: row.worksheetId,
              rowId: row.rowId,
            },
          },
          select: {
            contentItemId: true,
          },
        }));

      const equivalenceSuggestion =
        exactSourceLink?.contentItemId === undefined
          ? await findEquivalentContentItem({
              prisma,
              row: stagedRow,
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
              row: stagedRow,
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

      const translationCopy = stagedRow.translationRequired
        ? generateMockTranslationDraft({
            sourceText: stagedRow.planningFields.copyEnglish,
            sourceLocale: "en",
            targetLocale: "pt-br",
          })
        : null;

      const normalizedPayload = stagedRow.rowQualification.disposition === "QUALIFIED"
        ? buildNormalizedPayload({
            spreadsheetRecord: record,
            spreadsheetImport,
            row: stagedRow,
            existingContentItemId,
            conflictConfidence,
            reimportStrategy,
            translationCopy,
          })
        : null;

      const persistenceData = buildRowPersistenceData({
        row: stagedRow,
        conflictConfidence,
        conflictSuggestion,
        existingContentItemId,
        normalizedPayload,
      });

      stagedRows.push({
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
      });

      if (stagedRow.rowQualification.disposition === "QUALIFIED") {
        qualifiedRowCount += 1;
      }

      if (stagedRow.rowQualification.isPublishedRow) {
        alreadyPublishedRowCount += 1;
      }

      if (persistenceData.rowStatus === DriveSpreadsheetRowState.CONFLICT) {
        conflictCount += 1;
      }

      if (persistenceData.rowStatus === DriveSpreadsheetRowState.REJECTED) {
        rejectedRowCount += 1;
      }

      if (persistenceData.rowStatus === DriveSpreadsheetRowState.SKIPPED) {
        skippedRowCount += 1;
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
    duplicateRowsRemoved: stagedRows.length - dedupedRows.length,
  });

  const batchStatus =
    existingHistory && existingHistory.status !== DriveImportBatchStatus.SENT_TO_QUEUE
      ? DriveImportBatchStatus.NEEDS_REIMPORT_DECISION
      : conflictCount > 0
        ? DriveImportBatchStatus.NEEDS_REIMPORT_DECISION
        : DriveImportBatchStatus.STAGED;

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
  await requireSession();
  logEvent("info", "[TRACE_IMPORT_QUEUE][SCAN] start", {
    query: input.query ?? "",
    sourceGroup: input.sourceGroup ?? "ALL",
    page: input.page ?? 1,
    pageSize: input.pageSize ?? null,
  });
  const result = await scanDriveImportSpreadsheets(input);
  logEvent("info", "[TRACE_IMPORT_QUEUE][SCAN] result", {
    total: result.total,
    returnedSpreadsheetIds: result.results.map((entry) => entry.record.driveFileId),
  });
  return result;
}

export async function stageDriveImportSpreadsheetsAction(input: DriveImportStageRequest) {
  const session = await requireSession();
  const prisma = getPrisma();
  const actor = await prisma.user.findUnique({
    where: { email: session.email },
  });

  const driveFileIds = Array.from(new Set(input.driveFileIds));
  logEvent("info", "[TRACE_IMPORT_QUEUE][STAGE] request", {
    driveFileIds,
    reimportStrategy: input.reimportStrategy ?? DriveReimportStrategy.UPDATE,
    actorEmail: session.email,
  });
  const records = (
    await Promise.all(
      driveFileIds.map(async (driveFileId) => resolveDriveSpreadsheetRecord(driveFileId)),
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
  prisma: ReturnType<typeof getPrisma>,
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

    const decision = await getResolvedRowDecision(prisma, row);
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

      await prisma.spreadsheetImportRow.update({
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

    const result = await importContentItem(finalPayload);
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

    await prisma.spreadsheetImportRow.update({
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

  await prisma.spreadsheetImportBatch.update({
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

  revalidatePath("/queue");
  revalidatePath("/import");

  logEvent("info", "Finished sending staged spreadsheet to workflow queue", {
    spreadsheetImportId: spreadsheet.id,
    spreadsheetId: spreadsheet.spreadsheetId,
    rowsInserted: createdRows + updatedRows + replacedRows + keptRows + publishedRows,
    itemsCreatedInQueue: createdRows,
    itemsUpdatedInQueue: updatedRows,
    skippedRows,
    rejectedRows,
    conflicts,
  });
  logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_SEND] summary", {
    spreadsheetImportId: spreadsheet.id,
    spreadsheetId: spreadsheet.spreadsheetId,
    nextState,
    createdRows,
    updatedRows,
    replacedRows,
    keptRows,
    publishedRows,
    skippedRows,
    rejectedRows,
    conflicts,
    contentItemIds,
    receiptIds,
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
  await requireSession();
  return await listDriveImportSpreadsheets(input);
}

export async function getDriveImportSummaryAction() {
  await requireSession();
  return {
    spreadsheetCount: getDriveImportSpreadsheetCount(),
    sourceGroups: getDriveImportSourceGroups(),
  };
}
