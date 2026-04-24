import "server-only";

import { driveSmmPlanImportProfile } from "../domain/sheet-profiles";
import { DRIVE_IMPORT_FOLDER_NAME, type DriveSpreadsheetRecord } from "../domain/drive-import";
import { logEvent } from "@/shared/logging/logger";
import type { DriveProvider } from "./drive-provider-contract";

const MOCK_TIMESTAMP = new Date().toISOString();

const DRIVE_SOURCE_CONTEXTS = {
  Brazil: {
    region: "Brazil",
    audience: "Regional LinkedIn pipeline",
    tags: ["Brazil", "Regional", "LinkedIn", "Monthly"] as string[],
  },
  Yann: {
    region: "North America",
    audience: "Founder-led content",
    tags: ["Yann", "LinkedIn", "Substack", "Personal brand"] as string[],
  },
  Yuri: {
    region: "North America",
    audience: "Enterprise browser buyers",
    tags: ["Yuriy", "Yuri", "Security", "LinkedIn", "Enterprise"] as string[],
  },
};

export const MOCK_DRIVE_RECORDS: DriveSpreadsheetRecord[] = [
  {
    driveFileId: "mock-brazil-smm-plan",
    spreadsheetId: "mock-brazil-smm-plan",
    spreadsheetName: "Brazil SMM Plan - Apr 2026",
    folderName: DRIVE_IMPORT_FOLDER_NAME,
    relativePath: "Brazil / Brazil SMM Plan - Apr 2026",
    description: "Regional LinkedIn pipeline spreadsheet discovered in the configured Drive folder.",
    lastUpdatedAt: MOCK_TIMESTAMP,
    sourceContext: { ...DRIVE_SOURCE_CONTEXTS.Brazil, sourceGroup: "Brazil", owner: "System (Mock)" },
    matchingSignals: ["google-drive-mock", "source-group:Brazil"],
    sheetProfileKey: driveSmmPlanImportProfile.key,
    sheetProfileVersion: driveSmmPlanImportProfile.version,
    worksheets: [
      { worksheetId: "apr-2026", worksheetName: "Apr 2026" },
      { worksheetId: "may-2026", worksheetName: "May 2026" },
    ],
  },
  {
    driveFileId: "mock-yann-smm-plan",
    spreadsheetId: "mock-yann-smm-plan",
    spreadsheetName: "Yann Kronberg SMM Plan",
    folderName: DRIVE_IMPORT_FOLDER_NAME,
    relativePath: "Yann / Yann Kronberg SMM Plan",
    description: "Founder-led content spreadsheet discovered in the configured Drive folder.",
    lastUpdatedAt: MOCK_TIMESTAMP,
    sourceContext: { ...DRIVE_SOURCE_CONTEXTS.Yann, sourceGroup: "Yann", owner: "System (Mock)" },
    matchingSignals: ["google-drive-mock", "source-group:Yann"],
    sheetProfileKey: driveSmmPlanImportProfile.key,
    sheetProfileVersion: driveSmmPlanImportProfile.version,
    worksheets: [{ worksheetId: "active", worksheetName: "Active Plan" }],
  },
  {
    driveFileId: "mock-yuri-smm-plan",
    spreadsheetId: "mock-yuri-smm-plan",
    spreadsheetName: "Yuri SMM Plan",
    folderName: DRIVE_IMPORT_FOLDER_NAME,
    relativePath: "Yuri / Yuri SMM Plan",
    description: "Enterprise browser buyers spreadsheet discovered in the configured Drive folder.",
    lastUpdatedAt: MOCK_TIMESTAMP,
    sourceContext: { ...DRIVE_SOURCE_CONTEXTS.Yuri, sourceGroup: "Yuri", owner: "System (Mock)" },
    matchingSignals: ["google-drive-mock", "source-group:Yuri"],
    sheetProfileKey: driveSmmPlanImportProfile.key,
    sheetProfileVersion: driveSmmPlanImportProfile.version,
    worksheets: [{ worksheetId: "q2-2026", worksheetName: "Q2 2026" }],
  },
];

export const mockDriveProvider: DriveProvider = {
  async scanCatalog(input = {}) {
    const userId = input.userId ?? "anonymous";

    logEvent("info", "[DRIVE] Using MOCK provider", {
      userId,
      mode: "MOCK",
      recordCount: MOCK_DRIVE_RECORDS.length,
    });

    return {
      records: MOCK_DRIVE_RECORDS,
      source: "MOCK",
      userId,
      scannedAt: new Date(),
    };
  },
};
