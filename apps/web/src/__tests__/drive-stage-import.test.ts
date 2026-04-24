import {
  ContentProfile,
  DriveImportBatchStatus,
  DriveReimportStrategy,
  DriveSpreadsheetRowState,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

const catalogMocks = vi.hoisted(() => ({
  getDriveImportSpreadsheetById: vi.fn(),
  getDriveImportSpreadsheetCount: vi.fn(),
  getDriveImportSourceGroups: vi.fn(),
  listDriveImportSpreadsheets: vi.fn(),
  scanDriveImportSpreadsheets: vi.fn(),
}));

const sheetsMocks = vi.hoisted(() => ({
  readGoogleSpreadsheetWorkbook: vi.fn(),
  readGoogleSpreadsheetImport: vi.fn(),
}));

const aiMocks = vi.hoisted(() => ({
  analyzeSheetWithAI: vi.fn(),
}));

vi.mock("@/modules/auth/application/auth-service", () => ({
  requireSession: authMocks.requireSession,
}));

vi.mock("@/shared/lib/prisma", () => ({
  getPrisma: prismaMocks.getPrisma,
}));

vi.mock("next/cache", () => ({
  revalidatePath: cacheMocks.revalidatePath,
}));

vi.mock("@/modules/content-intake/infrastructure/drive-import-catalog", () => ({
  getDriveImportSpreadsheetById: catalogMocks.getDriveImportSpreadsheetById,
  getDriveImportSpreadsheetCount: catalogMocks.getDriveImportSpreadsheetCount,
  getDriveImportSourceGroups: catalogMocks.getDriveImportSourceGroups,
  listDriveImportSpreadsheets: catalogMocks.listDriveImportSpreadsheets,
  scanDriveImportSpreadsheets: catalogMocks.scanDriveImportSpreadsheets,
}));

vi.mock("@/modules/content-intake/infrastructure/google-sheets-provider", () => ({
  readGoogleSpreadsheetWorkbook: sheetsMocks.readGoogleSpreadsheetWorkbook,
  readGoogleSpreadsheetImport: sheetsMocks.readGoogleSpreadsheetImport,
}));

vi.mock("@/modules/content-intake/application/ai-sheet-analyzer", () => ({
  analyzeSheetWithAI: aiMocks.analyzeSheetWithAI,
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

function buildRecord() {
  return {
    driveFileId: "drive-file-1",
    spreadsheetId: "spreadsheet-1",
    spreadsheetName: "SMM Plan | Yann Kronberg",
    folderName: "Pipeline #1 / SMM Plan",
    relativePath: "Yann/SMM Plan",
    description: "",
    lastUpdatedAt: "2026-04-23T12:00:00.000Z",
    sourceContext: {
      sourceGroup: "Yann",
      owner: "Yann",
      region: "Global",
      audience: "B2B",
      tags: [],
    },
    matchingSignals: ["SMM Plan"],
    sheetProfileKey: "drive-smm-plan-import",
    sheetProfileVersion: 1,
    worksheets: [],
  };
}

function buildRawWorkbook() {
  return {
    spreadsheetId: "drive-file-1",
    spreadsheetName: "SMM Plan | Yann Kronberg",
    availableWorksheets: [{ worksheetId: "ws-1", worksheetName: "April 2026" }],
    worksheets: [
      {
        worksheetId: "ws-1",
        worksheetName: "April 2026",
        detectedHeaders: [
          "Date",
          "Title",
          "Copywriter Brief",
          "LinkedIn Copy",
          "Published",
          "Platform",
          "Deadline",
        ],
        detectedHeaderRowNumber: 1,
        rows: [
          [
            "Date",
            "Title",
            "Copywriter Brief",
            "LinkedIn Copy",
            "Published",
            "Platform",
            "Deadline",
          ],
          [
            "2026-04-23",
            "",
            "FREE article\n\nOpenClaw Is Dangerous for Your Business, But I Know How to Make It Safe",
            "",
            "No",
            "News",
            "2026-04-24",
          ],
        ],
      },
    ],
  };
}

function buildParsedRow(overrides: Record<string, unknown> = {}) {
  return {
    worksheetId: "ws-1",
    worksheetName: "April 2026",
    rowId: "row-2",
    rowNumber: 2,
    rowVersion: "row-version-1",
    rowKind: "DATA",
    headerRowNumber: 1,
    headers: [
      "Date",
      "Title",
      "Copywriter Brief",
      "LinkedIn Copy",
      "Published",
      "Platform",
      "Deadline",
    ],
    rowValues: [
      "2026-04-23",
      "",
      "FREE article\n\nOpenClaw Is Dangerous for Your Business, But I Know How to Make It Safe",
      "",
      "No",
      "News",
      "2026-04-24",
    ],
    rowMap: {
      Date: "2026-04-23",
      Title: "",
      "Copywriter Brief": "FREE article\n\nOpenClaw Is Dangerous for Your Business, But I Know How to Make It Safe",
      "LinkedIn Copy": "",
      Published: "No",
      Platform: "News",
      Deadline: "2026-04-24",
    },
    mappedFields: {
      plannedDate: "Date",
      campaignLabel: "Title",
      ideaOrBrief: "Copywriter Brief",
      copyEnglish: "LinkedIn Copy",
      publishedFlag: "Published",
      platformLabel: "Platform",
      contentDeadline: "Deadline",
    },
    unmappedHeaders: [],
    rowQualification: {
      disposition: "QUALIFIED",
      confidence: "LOW",
      reasons: ["Missing copy should stay visible in queue."],
      signals: {
        hasDate: true,
        hasTitle: true,
        hasCopy: false,
        hasPlatform: true,
        hasLink: false,
        hasPublicationMarker: false,
      },
      isPublishedRow: false,
    },
    titleDerivation: {
      strategy: "PROFILE_FALLBACK_FIELD",
      title: "OpenClaw Is Dangerous for Your Business, But I Know How to Make It Safe",
      sourceField: "ideaOrBrief",
      titleDerivedFromBrief: true,
    },
    planningFields: {
      plannedDate: "2026-04-23",
      platformLabel: "News",
      campaignLabel: undefined,
      ideaOrBrief: "FREE article\n\nOpenClaw Is Dangerous for Your Business, But I Know How to Make It Safe",
      copyEnglish: "",
      contentDeadline: "2026-04-24",
    },
    sourceMetadata: {
      publishedFlag: "No",
    },
    contentProfile: ContentProfile.YANN,
    operationalStatus: "BLOCKED",
    blockReason: "MISSING_COPY",
    translationRequired: false,
    autoPostEnabled: false,
    preferredDesignProvider: "MANUAL",
    contentSignature: "yann|2026-04-23|openclaw",
    ...overrides,
  };
}

function createStagePrismaHarness() {
  let batchCounter = 0;
  let currentBatch: Record<string, unknown> | null = null;
  const createdRows: Record<string, unknown>[] = [];

  const rootPrisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "operator@zazmic.com",
      }),
    },
    spreadsheetImportBatch: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        batchCounter += 1;
        currentBatch = {
          id: `batch-${batchCounter}`,
          importedById: args.data.importedById ?? null,
          driveFileId: args.data.driveFileId,
          spreadsheetId: args.data.spreadsheetId,
          spreadsheetName: args.data.spreadsheetName,
          folderName: args.data.folderName,
          owner: args.data.owner,
          sourceGroup: args.data.sourceGroup,
          lastUpdatedAt: args.data.lastUpdatedAt,
          reimportStrategy: args.data.reimportStrategy,
          status: args.data.status,
          scanFingerprint: args.data.scanFingerprint,
          sourceContext: args.data.sourceContext,
          pipelineSignals: args.data.pipelineSignals,
          validWorksheetCount: args.data.validWorksheetCount,
          detectedRowCount: args.data.detectedRowCount,
          qualifiedRowCount: args.data.qualifiedRowCount,
          importedRowCount: args.data.importedRowCount,
          updatedRowCount: args.data.updatedRowCount,
          replacedRowCount: args.data.replacedRowCount,
          keptRowCount: args.data.keptRowCount,
          conflictCount: args.data.conflictCount,
          alreadyPublishedRowCount: args.data.alreadyPublishedRowCount,
          stagedAt: new Date("2026-04-23T12:00:00.000Z"),
          queuedAt: null,
          createdAt: new Date("2026-04-23T12:00:00.000Z"),
          updatedAt: new Date("2026-04-23T12:00:00.000Z"),
        };
        return currentBatch;
      }),
      findUnique: vi.fn(async () => (currentBatch ? { ...currentBatch, rows: [...createdRows] } : null)),
    },
    spreadsheetImportRow: {
      createMany: vi.fn(async (args: { data: Record<string, unknown>[] }) => {
        createdRows.push(...args.data);
        return { count: args.data.length };
      }),
    },
    contentSourceLink: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    contentItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  return {
    rootPrisma,
    createdRows,
    get currentBatch() {
      return currentBatch;
    },
  };
}

async function importWorkflow() {
  vi.resetModules();
  return import("@/modules/content-intake/application/drive-import-workflow");
}

describe("drive staging import", () => {
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
      DRIVE_PROVIDER_MODE: "LIVE",
    });

    authMocks.requireSession.mockResolvedValue({
      email: "operator@zazmic.com",
      roles: [],
    });

    prismaMocks.getPrisma.mockReset();
    cacheMocks.revalidatePath.mockReset();
    catalogMocks.getDriveImportSpreadsheetById.mockReset();
    catalogMocks.getDriveImportSpreadsheetCount.mockReset();
    catalogMocks.getDriveImportSourceGroups.mockReset();
    catalogMocks.listDriveImportSpreadsheets.mockReset();
    catalogMocks.scanDriveImportSpreadsheets.mockReset();
    sheetsMocks.readGoogleSpreadsheetWorkbook.mockReset();
    sheetsMocks.readGoogleSpreadsheetImport.mockReset();
    aiMocks.analyzeSheetWithAI.mockReset();
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = null;
    vi.resetModules();
  });

  it("falls back to deterministic row normalization when AI detects no valid worksheet", async () => {
    const harness = createStagePrismaHarness();
    prismaMocks.getPrisma.mockReturnValue(harness.rootPrisma as never);
    catalogMocks.getDriveImportSpreadsheetById.mockReturnValue(buildRecord());
    sheetsMocks.readGoogleSpreadsheetWorkbook.mockResolvedValue(buildRawWorkbook());
    aiMocks.analyzeSheetWithAI.mockResolvedValue({
      tableDetected: false,
      columns: {},
      rows: [],
    });
    sheetsMocks.readGoogleSpreadsheetImport.mockResolvedValue({
      spreadsheetId: "drive-file-1",
      spreadsheetName: "SMM Plan | Yann Kronberg",
      availableWorksheets: [{ worksheetId: "ws-1", worksheetName: "April 2026" }],
      worksheets: [
        {
          worksheetId: "ws-1",
          worksheetName: "April 2026",
          rows: [buildParsedRow()],
        },
      ],
      validWorksheetCount: 1,
    });

    const { stageDriveImportSpreadsheetsAction } = await importWorkflow();
    const result = await stageDriveImportSpreadsheetsAction({
      driveFileIds: ["drive-file-1"],
      reimportStrategy: DriveReimportStrategy.UPDATE,
    });

    expect(result.spreadsheets).toHaveLength(1);
    expect(result.spreadsheets[0]).toMatchObject({
      validWorksheetCount: 1,
      totalRowsDetected: 1,
      qualifiedRowsDetected: 1,
    });
    expect(harness.createdRows).toHaveLength(1);
    expect(harness.createdRows[0]?.title).toBe(
      "OpenClaw Is Dangerous for Your Business, But I Know How to Make It Safe",
    );
    expect((harness.currentBatch?.pipelineSignals as Record<string, unknown>)?.deterministicFallbackUsed).toBe(true);
  });

  it("falls back to a safe date placeholder when Title is empty and the AI extracts only a generic label", async () => {
    const harness = createStagePrismaHarness();
    prismaMocks.getPrisma.mockReturnValue(harness.rootPrisma as never);
    catalogMocks.getDriveImportSpreadsheetById.mockReturnValue(buildRecord());
    sheetsMocks.readGoogleSpreadsheetWorkbook.mockResolvedValue(buildRawWorkbook());
    sheetsMocks.readGoogleSpreadsheetImport.mockResolvedValue({
      spreadsheetId: "drive-file-1",
      spreadsheetName: "SMM Plan | Yann Kronberg",
      availableWorksheets: [],
      worksheets: [],
      validWorksheetCount: 0,
    });
    aiMocks.analyzeSheetWithAI.mockResolvedValue({
      tableDetected: true,
      columns: {
        date: "Date",
        title: "Title",
        copy: "LinkedIn Copy",
        published: "Published",
        channel: "Platform",
        deadline: "Deadline",
      },
      rows: [
        {
          rowIndex: 2,
          data: {
            date: "2026-04-23",
            title: "FREE article",
            copy: "",
            deadline: "2026-04-24",
            published: "No",
            channel: "News",
          },
          semantic: {
            has_title: true,
            has_final_copy: false,
            is_published: false,
            has_design_evidence: false,
            is_overdue: false,
            is_empty_or_unusable: false,
            is_non_linkedin_platform: true,
            copy_language_is_fallback: false,
            needs_human_review: false,
            reasoning: ["Mock AI detected a brief-driven row."],
          },
        },
      ],
    });

    const { stageDriveImportSpreadsheetsAction } = await importWorkflow();
    const result = await stageDriveImportSpreadsheetsAction({
      driveFileIds: ["drive-file-1"],
      reimportStrategy: DriveReimportStrategy.UPDATE,
    });

    // The spreadsheet Title cell is empty and LinkedIn Copy is empty.
    // isRowQueueCandidate returns false (no qualifying det fields) → row is SKIPPED.
    // The title must NOT be derived from the AI's generic label "FREE article".
    // The date placeholder is used instead.
    expect(result.spreadsheets).toHaveLength(1);
    expect(harness.createdRows).toHaveLength(1);
    expect(harness.createdRows[0]?.title).toBe("Post - 2026-04-23");
    expect(harness.createdRows[0]?.title).not.toBe("FREE article");
    expect(harness.createdRows[0]?.rowStatus).toBe(DriveSpreadsheetRowState.SKIPPED);
    expect(harness.currentBatch?.status).toBe(DriveImportBatchStatus.STAGED);
    expect((harness.currentBatch?.pipelineSignals as Record<string, unknown>)?.deterministicFallbackUsed).toBe(
      false,
    );
  });

  it("does not persist Copywriter Brief as final copy when LinkedIn Copy is empty", async () => {
    const harness = createStagePrismaHarness();
    prismaMocks.getPrisma.mockReturnValue(harness.rootPrisma as never);
    catalogMocks.getDriveImportSpreadsheetById.mockReturnValue(buildRecord());
    sheetsMocks.readGoogleSpreadsheetWorkbook.mockResolvedValue(buildRawWorkbook());
    sheetsMocks.readGoogleSpreadsheetImport.mockResolvedValue({
      spreadsheetId: "drive-file-1",
      spreadsheetName: "SMM Plan | Yann Kronberg",
      availableWorksheets: [],
      worksheets: [],
      validWorksheetCount: 0,
    });
    aiMocks.analyzeSheetWithAI.mockResolvedValue({
      tableDetected: true,
      columns: {
        date: "Date",
        title: "Title",
        copy: "LinkedIn Copy",
        published: "Published",
        channel: "Platform",
        deadline: "Deadline",
      },
      rows: [
        {
          rowIndex: 2,
          data: {
            date: "2026-04-23",
            title: "",
            copy:
              "FREE article\n\nOpenClaw Is Dangerous for Your Business, But I Know How to Make It Safe",
            deadline: "2026-04-24",
            published: "No",
            channel: "News",
          },
          semantic: {
            has_title: false,
            has_final_copy: true,
            is_published: false,
            has_design_evidence: false,
            is_overdue: false,
            is_empty_or_unusable: false,
            is_non_linkedin_platform: true,
            copy_language_is_fallback: false,
            needs_human_review: false,
            reasoning: ["Mock AI inferred copy from the longest brief cell."],
          },
        },
      ],
    });

    const { stageDriveImportSpreadsheetsAction } = await importWorkflow();
    await stageDriveImportSpreadsheetsAction({
      driveFileIds: ["drive-file-1"],
      reimportStrategy: DriveReimportStrategy.UPDATE,
    });

    // Only the LinkedIn Copy column is used as copy. The Copywriter Brief column is
    // excluded. Since that cell is empty the row is SKIPPED (no qualifying det fields).
    // normalizedPayload is null for SKIPPED rows — verify via the skipped-trace fields.
    expect(harness.createdRows).toHaveLength(1);
    expect(harness.createdRows[0]?.copy).toBe("");
    expect(harness.createdRows[0]?.idea).toBeNull();
    expect(harness.createdRows[0]?.rowStatus).toBe(DriveSpreadsheetRowState.SKIPPED);
  });
});
