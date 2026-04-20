/**
 * GET /api/import/[batchId]/rows
 *
 * Returns a structured row-level trace for a given import batch.
 * Answers: did this row enter? was it skipped? why? at what stage?
 *
 * Query params:
 *   ?status=SKIPPED|STAGED|QUEUED|PUBLISHED_COMPLETE|CONFLICT|...  (optional)
 *   ?worksheet=<worksheetName>                                       (optional)
 *
 * Authentication: requires a valid session (same as all protected routes).
 * This is a read-only diagnostic endpoint — no mutations.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/modules/auth/application/auth-service";
import { getPrisma } from "@/shared/lib/prisma";
import { DriveSpreadsheetRowState } from "@prisma/client";

const VALID_STATUSES = new Set<string>(Object.values(DriveSpreadsheetRowState));

export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string } },
) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { batchId } = params;
  const { searchParams } = request.nextUrl;

  const statusFilter = searchParams.get("status") ?? null;
  const worksheetFilter = searchParams.get("worksheet") ?? null;

  if (statusFilter && !VALID_STATUSES.has(statusFilter)) {
    return NextResponse.json(
      {
        error: `Invalid status filter. Valid values: ${[...VALID_STATUSES].join(", ")}`,
      },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  const batch = await prisma.spreadsheetImportBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      spreadsheetId: true,
      spreadsheetName: true,
      sourceGroup: true,
      status: true,
      detectedRowCount: true,
      qualifiedRowCount: true,
      conflictCount: true,
      alreadyPublishedRowCount: true,
      importedRowCount: true,
      stagedAt: true,
      queuedAt: true,
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  }

  const rows = await prisma.spreadsheetImportRow.findMany({
    where: {
      batchId,
      ...(statusFilter ? { rowStatus: statusFilter as DriveSpreadsheetRowState } : {}),
      ...(worksheetFilter ? { worksheetName: worksheetFilter } : {}),
    },
    select: {
      id: true,
      worksheetId: true,
      worksheetName: true,
      rowId: true,
      rowNumber: true,
      rowKind: true,
      rowStatus: true,
      title: true,
      idea: true,
      plannedDate: true,
      publishedFlag: true,
      conflictConfidence: true,
      existingContentItemId: true,
      contentItemId: true,
      matchSignals: true,
      reason: true,
      // rowPayload contains skipStage + detExtracted for SKIPPED rows
      rowPayload: true,
      createdAt: true,
    },
    orderBy: [
      { worksheetName: "asc" },
      { rowNumber: "asc" },
    ],
  });

  // Summarise by worksheet for quick scanning
  const byWorksheet: Record<
    string,
    { qualified: number; skipped: number; published: number; conflict: number; total: number }
  > = {};
  for (const row of rows) {
    const ws = row.worksheetName;
    if (!byWorksheet[ws]) {
      byWorksheet[ws] = { qualified: 0, skipped: 0, published: 0, conflict: 0, total: 0 };
    }
    byWorksheet[ws].total += 1;
    if (row.rowStatus === DriveSpreadsheetRowState.SKIPPED) byWorksheet[ws].skipped += 1;
    else if (row.rowStatus === DriveSpreadsheetRowState.PUBLISHED_COMPLETE) byWorksheet[ws].published += 1;
    else if (row.rowStatus === DriveSpreadsheetRowState.CONFLICT) byWorksheet[ws].conflict += 1;
    else byWorksheet[ws].qualified += 1;
  }

  return NextResponse.json({
    batch: {
      ...batch,
      stagedAt: batch.stagedAt.toISOString(),
      queuedAt: batch.queuedAt?.toISOString() ?? null,
    },
    summary: {
      totalTracedRows: rows.length,
      byStatus: rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.rowStatus] = (acc[row.rowStatus] ?? 0) + 1;
        return acc;
      }, {}),
      byWorksheet,
    },
    rows: rows.map((row) => ({
      id: row.id,
      worksheetName: row.worksheetName,
      rowNumber: row.rowNumber,
      rowStatus: row.rowStatus,
      rowKind: row.rowKind,
      title: row.title,
      plannedDate: row.plannedDate,
      publishedFlag: row.publishedFlag,
      idea: row.idea,
      matchSignals: row.matchSignals,
      conflictConfidence: row.conflictConfidence,
      existingContentItemId: row.existingContentItemId,
      contentItemId: row.contentItemId,
      // Human-readable reason — "why was this row skipped/qualified/etc?"
      reason: row.reason,
      // For SKIPPED rows: skipStage tells you WHICH gate blocked it
      skipStage: (row.rowPayload as Record<string, unknown> | null)?.skipStage ?? null,
      // For SKIPPED rows: what the deterministic extractor actually found
      detExtracted: (row.rowPayload as Record<string, unknown> | null)?.detExtracted ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
