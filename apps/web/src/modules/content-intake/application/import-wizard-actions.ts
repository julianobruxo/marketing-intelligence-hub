"use server";

import { ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { importContentItem } from "../application/import-content-item";
import { normalizeSheetRow } from "../application/normalize-sheet-row";
import {
  buildNormalizeRequest,
  getMockSheetRows,
} from "../infrastructure/mock-import-provider";
import { getLiveSheetRows } from "../infrastructure/google-sheets-provider";

// ─── Shared types ─────────────────────────────────────────────────────────────

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
  /** Short reason for non-imported rows. Empty for IMPORTED rows. */
  reason: string;
}

export interface PreviewResult {
  sheetProfileKey: string;
  worksheetName: string;
  orchestrator: string;
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
  sheetProfileKey: string;
  worksheetName: string;
  orchestrator: string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeNormalize(request: ReturnType<typeof buildNormalizeRequest>) {
  try {
    return { result: normalizeSheetRow(request), error: null };
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues.map((i) => i.message).join("; ")
        : err instanceof Error
          ? err.message
          : "Normalization failed.";
    return { result: null, error: message };
  }
}

// ─── Preview action ───────────────────────────────────────────────────────────

export async function previewImportAction(
  sheetProfileKey: string,
  worksheetName: string,
): Promise<PreviewResult> {
  await requireSession();
  
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let mockRows: any[] = [];
  
  if (serviceAccountEmail && sheetProfileKey === "yann-smm-plan") {
    try {
      mockRows = await getLiveSheetRows("1jjYpO7XxCBY2Jfe7hnqanS2H2EJDbbzs-P_BmkefLM4", worksheetName, "YANN");
    } catch (err) {
      console.error("Failed to read live sheet, falling back to mock:", err);
      mockRows = getMockSheetRows(sheetProfileKey, worksheetName);
    }
  } else {
    mockRows = getMockSheetRows(sheetProfileKey, worksheetName);
  }

  const rows: PreviewRow[] = await Promise.all(
    mockRows.map(async (mockRow) => {
      const request = buildNormalizeRequest(
        mockRow,
        sheetProfileKey,
        worksheetName,
        "PREVIEW",
      );

      const { result: normalized, error: normalizeError } = safeNormalize(request);

      // If normalization itself fails (e.g. truly unrecoverable schema error), treat as REJECTED
      if (!normalized) {
        return {
          rowNumber: mockRow.rowNumber,
          rowId: mockRow.rowId,
          title: "(normalization error)",
          profile: mockRow.profile,
          contentType: mockRow.contentType,
          outcome: "REJECTED" as RowOutcome,
          reason: normalizeError ?? "Normalization failed.",
        };
      }

      const { normalizedPayload } = normalized;
      const disposition = normalizedPayload.normalization.rowQualification.disposition;
      const derivedTitle =
        normalizedPayload.normalization.titleDerivation?.title ||
        normalizedPayload.content.title ||
        "(no title)";

      // SKIPPED: non-data row, no DB operation needed
      if (disposition === "SKIPPED_NON_DATA") {
        return {
          rowNumber: mockRow.rowNumber,
          rowId: mockRow.rowId,
          title: derivedTitle,
          profile: mockRow.profile,
          contentType: mockRow.contentType,
          outcome: "SKIPPED",
          reason:
            normalizedPayload.normalization.rowQualification.reasons[0] ??
            "Non-data row detected.",
        };
      }

      // REJECTED: failed field qualification
      if (disposition === "REJECTED_INVALID") {
        return {
          rowNumber: mockRow.rowNumber,
          rowId: mockRow.rowId,
          title: derivedTitle,
          profile: mockRow.profile,
          contentType: mockRow.contentType,
          outcome: "REJECTED",
          reason:
            normalizedPayload.normalization.rowQualification.reasons[0] ??
            "Row failed validation.",
        };
      }

      // QUALIFIED: run through the import contract in PREVIEW mode
      const result = await importContentItem(normalizedPayload);

      let outcome: RowOutcome;
      let reason = "";

      if ("duplicate" in result && result.duplicate) {
        if ("wouldUpdate" in result && result.wouldUpdate) {
          outcome = "REPROCESSED";
          reason = "Matches an existing content item — will update.";
        } else {
          outcome = "DUPLICATE";
          reason = "Already processed for this idempotency key.";
        }
      } else if ("wouldUpdate" in result && result.wouldUpdate) {
        outcome = "REPROCESSED";
        reason = "Matches existing source row — will reprocess.";
      } else {
        outcome = "IMPORTED";
        reason = "";
      }

      return {
        rowNumber: mockRow.rowNumber,
        rowId: mockRow.rowId,
        title: derivedTitle,
        profile: mockRow.profile,
        contentType: mockRow.contentType,
        outcome,
        reason,
      };
    }),
  );

  const counts = {
    imported: rows.filter((r) => r.outcome === "IMPORTED").length,
    reprocessed: rows.filter((r) => r.outcome === "REPROCESSED").length,
    duplicate: rows.filter((r) => r.outcome === "DUPLICATE").length,
    skipped: rows.filter((r) => r.outcome === "SKIPPED").length,
    rejected: rows.filter((r) => r.outcome === "REJECTED").length,
    total: rows.length,
  };

  return {
    sheetProfileKey,
    worksheetName,
    orchestrator: "MANUAL",
    rows,
    counts,
  };
}

// ─── Commit action ────────────────────────────────────────────────────────────

export async function commitImportAction(
  sheetProfileKey: string,
  worksheetName: string,
): Promise<CommitResult> {
  await requireSession();
  
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let mockRows: any[] = [];
  
  if (serviceAccountEmail && sheetProfileKey === "yann-smm-plan") {
    try {
      mockRows = await getLiveSheetRows("1jjYpO7XxCBY2Jfe7hnqanS2H2EJDbbzs-P_BmkefLM4", worksheetName, "YANN");
    } catch (err) {
      console.error("Failed to read live sheet, falling back to mock:", err);
      mockRows = getMockSheetRows(sheetProfileKey, worksheetName);
    }
  } else {
    mockRows = getMockSheetRows(sheetProfileKey, worksheetName);
  }

  let imported = 0;
  let reprocessed = 0;
  let skipped = 0;
  let rejected = 0;
  const receiptIds: string[] = [];
  let firstImportedItemId: string | null = null;

  for (const mockRow of mockRows) {
    const request = buildNormalizeRequest(
      mockRow,
      sheetProfileKey,
      worksheetName,
      "COMMIT",
    );

    const { result: normalized, error: normalizeError } = safeNormalize(request);

    if (!normalized) {
      // Normalization schema error — treat as rejected, no DB write
      console.warn("Mock import: row normalization failed:", normalizeError);
      rejected++;
      continue;
    }

    const { normalizedPayload } = normalized;
    const disposition = normalizedPayload.normalization.rowQualification.disposition;

    if (disposition === "SKIPPED_NON_DATA") {
      skipped++;
      continue;
    }

    if (disposition === "REJECTED_INVALID") {
      rejected++;
      continue;
    }

    const result = await importContentItem(normalizedPayload);

    if ("receiptId" in result) {
      receiptIds.push(result.receiptId);
    }

    const isDuplicate = "duplicate" in result && result.duplicate;
    const isReprocess =
      "wouldUpdate" in result && result.wouldUpdate && !isDuplicate;

    if (isDuplicate) {
      // Duplicate commit — already processed, receipt already recorded
      continue;
    } else if (isReprocess) {
      reprocessed++;
    } else {
      imported++;
    }

    const rec = result as Record<string, unknown>;
    if (!firstImportedItemId && typeof rec.contentItemId === "string") {
      firstImportedItemId = rec.contentItemId;
    }
  }

  revalidatePath("/queue");

  return {
    sheetProfileKey,
    worksheetName,
    orchestrator: "MANUAL",
    counts: {
      imported,
      reprocessed,
      skipped,
      rejected,
      total: mockRows.length,
    },
    receiptIds,
    firstImportedItemId,
    completedAt: new Date().toISOString(),
  };
}
