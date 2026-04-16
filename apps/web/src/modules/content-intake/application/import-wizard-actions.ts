"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/modules/auth/application/auth-service";
import { importContentItem } from "../application/import-content-item";
import { normalizeSheetRow } from "../application/normalize-sheet-row";
import { getDriveImportSpreadsheetById, type DriveSourceContext } from "../infrastructure/drive-import-catalog";
import { buildNormalizeRequest, getMockSheetRows } from "../infrastructure/mock-import-provider";

export type RowOutcome =
  | "IMPORTED"
  | "REPROCESSED"
  | "DUPLICATE"
  | "SKIPPED"
  | "REJECTED";

export interface PreviewRow {
  rowNumber: number;
  rowId: string;
  title: string;
  profile: string;
  contentType: "STATIC_POST" | "CAROUSEL";
  outcome: RowOutcome;
  reason: string;
}

export interface DriveImportSource {
  driveFileId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetName: string;
  folderName: string;
  sourceLabel: "Google Drive";
  sourceContext: DriveSourceContext;
}

export interface PreviewResult {
  source: DriveImportSource;
  rows: PreviewRow[];
  counts: {
    imported: number;
    reprocessed: number;
    duplicate: number;
    skipped: number;
    rejected: number;
    total: number;
  };
}

export interface CommitResult {
  source: DriveImportSource;
  counts: {
    imported: number;
    reprocessed: number;
    skipped: number;
    rejected: number;
    total: number;
  };
  receiptIds: string[];
  firstImportedItemId: string | null;
  completedAt: string;
}

function safeNormalize(request: ReturnType<typeof buildNormalizeRequest>) {
  try {
    return { result: normalizeSheetRow(request), error: null };
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : error instanceof Error
          ? error.message
          : "Normalization failed.";
    return { result: null, error: message };
  }
}

function getDriveSelection(spreadsheetId: string) {
  const spreadsheet = getDriveImportSpreadsheetById(spreadsheetId);

  if (!spreadsheet) {
    throw new Error(`Unsupported Drive spreadsheet selection: ${spreadsheetId}`);
  }

  return spreadsheet;
}

function buildSource(spreadsheetId: string, worksheetName: string): DriveImportSource {
  const spreadsheet = getDriveSelection(spreadsheetId);

  return {
    driveFileId: spreadsheet.driveFileId,
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetName: spreadsheet.spreadsheetName,
    worksheetName,
    folderName: spreadsheet.folderName,
    sourceLabel: "Google Drive",
    sourceContext: spreadsheet.sourceContext,
  };
}

async function previewOrCommitSpreadsheet(
  spreadsheetId: string,
  worksheetName: string,
  mode: "PREVIEW" | "COMMIT",
) {
  const spreadsheet = getDriveSelection(spreadsheetId);
  const rows = getMockSheetRows(spreadsheet.sheetProfileKey, worksheetName);
  const normalizedRows = await Promise.all(
    rows.map(async (mockRow) => {
      const request = buildNormalizeRequest(
        mockRow,
        spreadsheet.sheetProfileKey,
        worksheetName,
        mode,
      );

      const { result: normalized, error: normalizeError } = safeNormalize(request);

      if (!normalized) {
        return {
          rowNumber: mockRow.rowNumber,
          rowId: mockRow.rowId,
          title: "(normalization error)",
          profile: mockRow.profile,
          contentType: mockRow.contentType,
          outcome: "REJECTED" as const,
          reason: normalizeError ?? "Normalization failed.",
        };
      }

      const { normalizedPayload } = normalized;
      const disposition = normalizedPayload.normalization.rowQualification.disposition;
      const derivedTitle =
        normalizedPayload.normalization.titleDerivation?.title ||
        normalizedPayload.content.title ||
        "(no title)";

      if (disposition === "SKIPPED_NON_DATA") {
        return {
          rowNumber: mockRow.rowNumber,
          rowId: mockRow.rowId,
          title: derivedTitle,
          profile: mockRow.profile,
          contentType: mockRow.contentType,
          outcome: "SKIPPED" as const,
          reason:
            normalizedPayload.normalization.rowQualification.reasons[0] ??
            "Non-data row detected.",
        };
      }

      if (disposition === "REJECTED_INVALID") {
        return {
          rowNumber: mockRow.rowNumber,
          rowId: mockRow.rowId,
          title: derivedTitle,
          profile: mockRow.profile,
          contentType: mockRow.contentType,
          outcome: "REJECTED" as const,
          reason:
            normalizedPayload.normalization.rowQualification.reasons[0] ??
            "Row failed validation.",
        };
      }

      const result = await importContentItem(normalizedPayload);

      let outcome: RowOutcome;
      let reason = "";

      if ("duplicate" in result && result.duplicate) {
        if ("wouldUpdate" in result && result.wouldUpdate) {
          outcome = "REPROCESSED";
          reason = "Matches an existing content item - will update.";
        } else {
          outcome = "DUPLICATE";
          reason = "Already processed for this idempotency key.";
        }
      } else if ("wouldUpdate" in result && result.wouldUpdate) {
        outcome = "REPROCESSED";
        reason = "Matches existing source row - will reprocess.";
      } else {
        outcome = "IMPORTED";
      }

      return {
        rowNumber: mockRow.rowNumber,
        rowId: mockRow.rowId,
        title: derivedTitle,
        profile: mockRow.profile,
        contentType: mockRow.contentType,
        outcome,
        reason,
        receiptId: "receiptId" in result ? result.receiptId : null,
        contentItemId:
          "contentItemId" in result && typeof result.contentItemId === "string"
            ? result.contentItemId
            : null,
      };
    }),
  );

  const counts = {
    imported: normalizedRows.filter((row) => row.outcome === "IMPORTED").length,
    reprocessed: normalizedRows.filter((row) => row.outcome === "REPROCESSED").length,
    duplicate: normalizedRows.filter((row) => row.outcome === "DUPLICATE").length,
    skipped: normalizedRows.filter((row) => row.outcome === "SKIPPED").length,
    rejected: normalizedRows.filter((row) => row.outcome === "REJECTED").length,
    total: normalizedRows.length,
  };

  return {
    source: buildSource(spreadsheetId, worksheetName),
    rows: normalizedRows,
    counts,
    receiptIds: mode === "COMMIT"
      ? normalizedRows
          .map((row) => row.receiptId)
          .filter((receiptId): receiptId is string => Boolean(receiptId))
      : [],
    firstImportedItemId:
      mode === "COMMIT"
        ? normalizedRows.find((row) => typeof row.contentItemId === "string")?.contentItemId ?? null
        : null,
  };
}

export async function previewImportAction(
  spreadsheetId: string,
  worksheetName: string,
): Promise<PreviewResult> {
  await requireSession();
  return previewOrCommitSpreadsheet(spreadsheetId, worksheetName, "PREVIEW");
}

export async function commitImportAction(
  spreadsheetId: string,
  worksheetName: string,
): Promise<CommitResult> {
  await requireSession();
  const result = await previewOrCommitSpreadsheet(spreadsheetId, worksheetName, "COMMIT");
  revalidatePath("/queue");

  return {
    source: result.source,
    counts: result.counts,
    receiptIds: result.receiptIds,
    firstImportedItemId: result.firstImportedItemId,
    completedAt: new Date().toISOString(),
  };
}
