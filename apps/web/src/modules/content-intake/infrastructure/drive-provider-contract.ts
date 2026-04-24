import type { DriveSpreadsheetRecord } from "../domain/drive-import";

export type DriveProviderSource = "REAL" | "MOCK";

export type DriveProviderScanContext = {
  userId?: string;
};

export type DriveProviderScanResult = {
  records: DriveSpreadsheetRecord[];
  source: DriveProviderSource;
  userId: string;
  scannedAt: Date;
};

export interface DriveProvider {
  scanCatalog(input?: DriveProviderScanContext): Promise<DriveProviderScanResult>;
}
