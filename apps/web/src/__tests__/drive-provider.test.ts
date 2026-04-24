import { afterEach, describe, expect, it, vi } from "vitest";
import type { DriveSpreadsheetRecord, DriveSourceGroup } from "@/modules/content-intake/domain/drive-import";

vi.mock("server-only", () => ({}));

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

function buildRecord(input: {
  driveFileId: string;
  sourceGroup: DriveSourceGroup;
}): DriveSpreadsheetRecord {
  return {
    driveFileId: input.driveFileId,
    spreadsheetId: input.driveFileId,
    spreadsheetName: `${input.sourceGroup} SMM Plan`,
    folderName: "Pipeline #1 / SMM Plan",
    relativePath: `${input.sourceGroup} / ${input.driveFileId}`,
    description: `${input.sourceGroup} spreadsheet`,
    lastUpdatedAt: new Date("2026-04-21T10:00:00.000Z").toISOString(),
    sourceContext: {
      sourceGroup: input.sourceGroup,
      owner: `Owner ${input.driveFileId}`,
      region: "North America",
      audience: "Test audience",
      tags: [input.sourceGroup],
    },
    matchingSignals: [`signal:${input.driveFileId}`],
    sheetProfileKey: "drive-smm-plan",
    sheetProfileVersion: 1,
    worksheets: [{ worksheetId: `${input.driveFileId}-ws`, worksheetName: "Sheet 1" }],
  };
}

async function importMockProvider() {
  vi.resetModules();
  return import("@/modules/content-intake/infrastructure/mock-drive-provider");
}

async function importCatalog() {
  vi.resetModules();
  return import("@/modules/content-intake/infrastructure/drive-import-catalog");
}

describe("mock drive provider", () => {
  let restoreEnv: (() => void) | null = null;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = null;
    vi.resetModules();
  });

  it("returns mock records and explicit source metadata", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
      DRIVE_PROVIDER_MODE: "MOCK",
    });

    const { mockDriveProvider, MOCK_DRIVE_RECORDS } = await importMockProvider();
    const result = await mockDriveProvider.scanCatalog({ userId: "user-a" });

    expect(result.source).toBe("MOCK");
    expect(result.userId).toBe("user-a");
    expect(result.records).toHaveLength(MOCK_DRIVE_RECORDS.length);
    expect(result.records[0]?.driveFileId).toBe(MOCK_DRIVE_RECORDS[0]?.driveFileId);
  });
});

describe("drive import catalog cache", () => {
  let restoreEnv: (() => void) | null = null;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = null;
    vi.resetModules();
  });

  it("keeps scans isolated per user", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
      DRIVE_PROVIDER_MODE: "MOCK",
    });

    const provider = {
      scanCatalog: vi.fn(async (input?: { userId?: string }) => {
        const userId = input?.userId ?? "anonymous";

        if (userId === "user-a") {
          return {
            records: [buildRecord({ driveFileId: "shared-a", sourceGroup: "Yann" })],
            source: "MOCK" as const,
            userId,
            scannedAt: new Date(),
          };
        }

        return {
          records: [buildRecord({ driveFileId: "shared-b", sourceGroup: "Yuri" })],
          source: "MOCK" as const,
          userId,
          scannedAt: new Date(),
        };
      }),
    };

    vi.doMock("@/modules/content-intake/infrastructure/drive-provider-registry", () => ({
      getDriveProvider: () => provider,
    }));

    const catalog = await importCatalog();

    const userAResult = await catalog.scanDriveImportSpreadsheets({}, { userId: "user-a" });
    expect(userAResult.source).toBe("MOCK");
    expect(userAResult.userId).toBe("user-a");
    expect(userAResult.scannedAt).toBeInstanceOf(Date);
    expect(catalog.getDriveImportSpreadsheetCount("user-a")).toBe(1);
    expect(catalog.getDriveImportSpreadsheetById("shared-a", "user-a")?.spreadsheetName).toBe(
      "Yann SMM Plan",
    );
    expect(catalog.getDriveImportSpreadsheetById("shared-b", "user-a")).toBeNull();

    const userBResult = await catalog.scanDriveImportSpreadsheets({}, { userId: "user-b" });
    expect(userBResult.source).toBe("MOCK");
    expect(userBResult.userId).toBe("user-b");
    expect(catalog.getDriveImportSpreadsheetCount("user-b")).toBe(1);
    expect(catalog.getDriveImportSpreadsheetById("shared-b", "user-b")?.spreadsheetName).toBe(
      "Yuri SMM Plan",
    );
    expect(catalog.getDriveImportSpreadsheetById("shared-a", "user-b")).toBeNull();
  });
});
