import {
  DriveConflictConfidence,
  DriveImportBatchStatus,
  DriveReimportStrategy,
  DriveSpreadsheetRowState,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpreadsheetImportBatch, SpreadsheetImportRow } from "@prisma/client";

vi.mock("server-only", () => ({}));

const authMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

const importItemMocks = vi.hoisted(() => ({
  importContentItem: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/modules/auth/application/auth-service", () => ({
  requireSession: authMocks.requireSession,
}));

vi.mock("@/shared/lib/prisma", () => ({
  getPrisma: prismaMocks.getPrisma,
}));

vi.mock("@/modules/content-intake/application/import-content-item", () => ({
  importContentItem: importItemMocks.importContentItem,
}));

vi.mock("next/cache", () => ({
  revalidatePath: cacheMocks.revalidatePath,
}));

function setProcessEnv(overrides: Record<string, string | undefined>) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function buildRow(overrides: Partial<SpreadsheetImportRow> = {}) {
  return {
    id: "row-1",
    batchId: "batch-1",
    worksheetId: "ws-1",
    worksheetName: "Sheet 1",
    rowId: "row-1",
    rowNumber: 1,
    rowVersion: "row-version-1",
    rowKind: "DATA",
    rowStatus: DriveSpreadsheetRowState.STAGED,
    conflictConfidence: DriveConflictConfidence.NO_MEANINGFUL_MATCH,
    conflictAction: null,
    existingContentItemId: null,
    contentItemId: null,
    title: "Design a strong headline",
    idea: "A brief idea",
    copy: "Final copy",
    translationDraft: null,
    plannedDate: null,
    publishedFlag: null,
    publishedPostUrl: null,
    sourceAssetLink: null,
    translationRequired: false,
    autoPostEnabled: false,
    preferredDesignProvider: null,
    matchSignals: {},
    rowPayload: {},
    normalizedPayload: {
      workflow: {
        translationRequired: false,
        autoPostEnabled: false,
        preferredDesignProvider: "MANUAL",
        reimportStrategy: DriveReimportStrategy.UPDATE,
      },
      content: {
        copy: "Final copy",
        locale: "en",
      },
      source: {
        spreadsheetId: "spreadsheet-1",
        spreadsheetName: "Spreadsheet 1",
        worksheetId: "ws-1",
        worksheetName: "Sheet 1",
        rowId: "row-1",
        rowNumber: 1,
        rowVersion: "row-version-1",
      },
      sourceMetadata: {},
    },
    conflictSuggestion: null,
    reason: null,
    createdAt: new Date("2026-04-21T10:00:00.000Z"),
    updatedAt: new Date("2026-04-21T10:00:00.000Z"),
    ...overrides,
  } as SpreadsheetImportRow;
}

function buildSpreadsheet(overrides: Partial<SpreadsheetImportBatch> = {}, rows: SpreadsheetImportRow[] = []) {
  return {
    id: "batch-1",
    importedById: null,
    driveFileId: "drive-file-1",
    spreadsheetId: "spreadsheet-1",
    spreadsheetName: "Spreadsheet 1",
    folderName: "Pipeline #1 / SMM Plan",
    owner: "Owner 1",
    sourceGroup: "Yann",
    lastUpdatedAt: new Date("2026-04-21T10:00:00.000Z"),
    reimportStrategy: DriveReimportStrategy.UPDATE,
    status: DriveImportBatchStatus.STAGED,
    scanFingerprint: "fingerprint-1",
    sourceContext: {},
    pipelineSignals: {},
    validWorksheetCount: 1,
    detectedRowCount: rows.length,
    qualifiedRowCount: rows.length,
    importedRowCount: 0,
    updatedRowCount: 0,
    replacedRowCount: 0,
    keptRowCount: 0,
    conflictCount: 0,
    alreadyPublishedRowCount: 0,
    stagedAt: new Date("2026-04-21T10:00:00.000Z"),
    queuedAt: null,
    createdAt: new Date("2026-04-21T10:00:00.000Z"),
    updatedAt: new Date("2026-04-21T10:00:00.000Z"),
    rows,
    ...overrides,
  } as SpreadsheetImportBatch & { rows: SpreadsheetImportRow[] };
}

function createPrismaHarness(initialSpreadsheet: SpreadsheetImportBatch & { rows: SpreadsheetImportRow[] }) {
  const committedSpreadsheet = structuredClone(initialSpreadsheet);

  const userFindUnique = vi.fn().mockResolvedValue({
    id: "user-1",
    email: "operator@zazmic.com",
  });

  const rootSpreadsheetBatchUpdate = vi.fn(async (args: { data?: Record<string, unknown> }) => {
    Object.assign(committedSpreadsheet, args.data ?? {});
    return committedSpreadsheet;
  });

  const rootPrisma = {
    user: {
      findUnique: userFindUnique,
    },
    spreadsheetImportBatch: {
      findUnique: vi.fn(async () => committedSpreadsheet),
      update: rootSpreadsheetBatchUpdate,
    },
    spreadsheetImportRow: {
      update: vi.fn(async () => undefined),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const workingSpreadsheet = structuredClone(committedSpreadsheet);

      const txPrisma = {
        user: {
          findUnique: userFindUnique,
        },
        spreadsheetImportBatch: {
          update: vi.fn(async (args: { data?: Record<string, unknown> }) => {
            Object.assign(workingSpreadsheet, args.data ?? {});
            return workingSpreadsheet;
          }),
        },
        spreadsheetImportRow: {
          update: vi.fn(async (args: { where: { batchId_rowId: { rowId: string } }; data?: Record<string, unknown> }) => {
            const row = workingSpreadsheet.rows.find(
              (entry: SpreadsheetImportRow) => entry.rowId === args.where.batchId_rowId.rowId,
            );
            if (row) {
              Object.assign(row, args.data ?? {});
            }
            return row;
          }),
        },
      } as never;

      const result = await callback(txPrisma);
      Object.assign(committedSpreadsheet, workingSpreadsheet);
      committedSpreadsheet.rows = workingSpreadsheet.rows;
      return result;
    }),
  };

  return {
    rootPrisma,
    committedSpreadsheet,
  };
}

async function importWorkflow() {
  vi.resetModules();
  return import("@/modules/content-intake/application/drive-import-workflow");
}

describe("drive batch import", () => {
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
      DRIVE_PROVIDER_MODE: "MOCK",
    });

    authMocks.requireSession.mockResolvedValue({
      email: "operator@zazmic.com",
      roles: [],
    });
    prismaMocks.getPrisma.mockReset();
    importItemMocks.importContentItem.mockReset();
    cacheMocks.revalidatePath.mockReset();
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = null;
    vi.resetModules();
  });

  it("processes a complete batch atomically", async () => {
    const spreadsheet = buildSpreadsheet({}, [buildRow()]);
    const harness = createPrismaHarness(spreadsheet);
    prismaMocks.getPrisma.mockReturnValue(harness.rootPrisma as never);

    importItemMocks.importContentItem.mockResolvedValue({
      duplicate: false,
      receiptId: "receipt-1",
      contentItemId: "content-1",
    });

    const { sendStagedSpreadsheetToWorkflowQueueAction } = await importWorkflow();
    const result = await sendStagedSpreadsheetToWorkflowQueueAction("batch-1");

    expect(result).toMatchObject({
      spreadsheetImportId: "batch-1",
      spreadsheetId: "spreadsheet-1",
      sentRows: 1,
      createdRows: 1,
      updatedRows: 0,
      replacedRows: 0,
      keptRows: 0,
      publishedRows: 0,
      skippedRows: 0,
      rejectedRows: 0,
      conflicts: 0,
      state: DriveImportBatchStatus.SENT_TO_QUEUE,
    });
    expect(importItemMocks.importContentItem).toHaveBeenCalledTimes(1);
    expect(harness.committedSpreadsheet.status).toBe(DriveImportBatchStatus.SENT_TO_QUEUE);
    expect(harness.committedSpreadsheet.rows[0]?.rowStatus).toBe(DriveSpreadsheetRowState.QUEUED);
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/queue");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/import");
  });

  it("rolls back the batch if a row fails mid-transaction", async () => {
    const spreadsheet = buildSpreadsheet({}, [buildRow({ rowId: "row-1" }), buildRow({ rowId: "row-2", rowNumber: 2 })]);
    spreadsheet.rows[1] = {
      ...spreadsheet.rows[1],
      id: "row-2",
      batchId: "batch-1",
      rowId: "row-2",
      rowNumber: 2,
      title: "A second item",
      normalizedPayload: {
        workflow: {
          translationRequired: false,
          autoPostEnabled: false,
          preferredDesignProvider: "MANUAL",
          reimportStrategy: DriveReimportStrategy.UPDATE,
        },
        content: {
          copy: "Second final copy",
          locale: "en",
        },
        source: {
          spreadsheetId: "spreadsheet-1",
          spreadsheetName: "Spreadsheet 1",
          worksheetId: "ws-1",
          worksheetName: "Sheet 1",
          rowId: "row-2",
          rowNumber: 2,
          rowVersion: "row-version-2",
        },
        sourceMetadata: {},
      },
    };

    const harness = createPrismaHarness(spreadsheet);
    prismaMocks.getPrisma.mockReturnValue(harness.rootPrisma as never);

    importItemMocks.importContentItem
      .mockResolvedValueOnce({
        duplicate: false,
        receiptId: "receipt-1",
        contentItemId: "content-1",
      })
      .mockRejectedValueOnce(new Error("boom"));

    const { sendStagedSpreadsheetToWorkflowQueueAction } = await importWorkflow();

    await expect(sendStagedSpreadsheetToWorkflowQueueAction("batch-1")).rejects.toThrow("boom");
    expect(importItemMocks.importContentItem).toHaveBeenCalledTimes(2);
    expect(harness.committedSpreadsheet.status).toBe(DriveImportBatchStatus.FAILED);
    expect(harness.committedSpreadsheet.rows[0]?.rowStatus).toBe(DriveSpreadsheetRowState.STAGED);
    expect(harness.committedSpreadsheet.rows[1]?.rowStatus).toBe(DriveSpreadsheetRowState.STAGED);
  });

  it("returns zero processed rows for an empty batch", async () => {
    const spreadsheet = buildSpreadsheet({}, []);
    const harness = createPrismaHarness(spreadsheet);
    prismaMocks.getPrisma.mockReturnValue(harness.rootPrisma as never);

    importItemMocks.importContentItem.mockResolvedValue({
      duplicate: false,
      receiptId: "receipt-1",
      contentItemId: "content-1",
    });

    const { sendStagedSpreadsheetToWorkflowQueueAction } = await importWorkflow();
    const result = await sendStagedSpreadsheetToWorkflowQueueAction("batch-1");
    expect(result).not.toBeNull();
    const queueResult = result!;

    expect(queueResult.sentRows).toBe(0);
    expect(queueResult.state).toBe(DriveImportBatchStatus.SENT_TO_QUEUE);
    expect(importItemMocks.importContentItem).not.toHaveBeenCalled();
    expect(harness.committedSpreadsheet.status).toBe(DriveImportBatchStatus.SENT_TO_QUEUE);
  });

  it("does not reprocess a batch that is already completed", async () => {
    const spreadsheet = buildSpreadsheet(
      {
        status: DriveImportBatchStatus.SENT_TO_QUEUE,
        importedRowCount: 1,
        conflictCount: 0,
      },
      [buildRow({ rowStatus: DriveSpreadsheetRowState.QUEUED })],
    );
    const harness = createPrismaHarness(spreadsheet);
    prismaMocks.getPrisma.mockReturnValue(harness.rootPrisma as never);

    const { sendStagedSpreadsheetToWorkflowQueueAction } = await importWorkflow();
    const result = await sendStagedSpreadsheetToWorkflowQueueAction("batch-1");
    expect(result).not.toBeNull();
    const queueResult = result!;

    expect(queueResult.state).toBe(DriveImportBatchStatus.SENT_TO_QUEUE);
    expect(queueResult.sentRows).toBe(1);
    expect(importItemMocks.importContentItem).not.toHaveBeenCalled();
    expect(harness.rootPrisma.spreadsheetImportBatch.update).not.toHaveBeenCalled();
  });
});
