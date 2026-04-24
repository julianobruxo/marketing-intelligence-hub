import "server-only";

import { DRIVE_PROVIDER_MODE } from "@/shared/config/env";
import { logEvent } from "@/shared/logging/logger";
import {
  DRIVE_IMPORT_FOLDER_NAME,
  DRIVE_IMPORT_KEYWORD,
  DRIVE_IMPORT_PAGE_SIZE,
  buildDriveSpreadsheetSummary,
  filterDriveSpreadsheetRecords,
  groupDriveSpreadsheetRecords,
  paginateDriveSpreadsheetRecords,
  type DriveSpreadsheetDirectoryPage,
  type DriveSpreadsheetRecord,
  type DriveSourceContext,
  type DriveSourceGroup,
  type DriveSourceGroupFilter,
  type DriveWorksheet,
} from "../domain/drive-import";
import {
  getDriveProvider,
} from "./drive-provider-registry";
import type {
  DriveProviderScanContext,
  DriveProviderScanResult,
  DriveProviderSource,
} from "./drive-provider-contract";

export { DRIVE_IMPORT_FOLDER_NAME, DRIVE_IMPORT_KEYWORD, DRIVE_IMPORT_PAGE_SIZE };
export const DRIVE_IMPORT_FOLDER_ID = "1nCrB2SnDsw_84ph7eXJGXICuQz510zgS";

export type {
  DriveSourceContext,
  DriveSourceGroup,
  DriveSourceGroupFilter,
  DriveSpreadsheetRecord,
  DriveSpreadsheetDirectoryPage,
};

export type DriveWorksheetOption = DriveWorksheet;

export type DriveImportCatalogRecords = DriveSpreadsheetRecord[] & {
  source: DriveProviderSource;
  userId: string;
  scannedAt: Date;
};

export type DriveImportCatalogPage = DriveSpreadsheetDirectoryPage & {
  source: DriveProviderSource;
  userId: string;
  scannedAt: Date;
};

type DriveImportCacheEntry = DriveProviderScanResult;

const DRIVE_IMPORT_CACHE_TTL_MS = 5 * 60 * 1000;
const driveImportCatalogCache = new Map<string, DriveImportCacheEntry>();
const latestDriveImportCatalogKeyByUserId = new Map<string, string>();

function buildDriveImportCacheKey(userId: string, scannedAt: Date) {
  return `${userId}:${scannedAt.getTime()}`;
}

function isCacheEntryFresh(entry: DriveImportCacheEntry) {
  return Date.now() - entry.scannedAt.getTime() <= DRIVE_IMPORT_CACHE_TTL_MS;
}

function pruneExpiredDriveImportCatalogCache() {
  for (const [cacheKey, entry] of driveImportCatalogCache.entries()) {
    if (isCacheEntryFresh(entry)) {
      continue;
    }

    driveImportCatalogCache.delete(cacheKey);

    const latestKey = latestDriveImportCatalogKeyByUserId.get(entry.userId);
    if (latestKey === cacheKey) {
      latestDriveImportCatalogKeyByUserId.delete(entry.userId);
    }
  }
}

function rememberDriveImportCatalogResult(result: DriveImportCacheEntry) {
  const cacheKey = buildDriveImportCacheKey(result.userId, result.scannedAt);
  driveImportCatalogCache.set(cacheKey, result);
  latestDriveImportCatalogKeyByUserId.set(result.userId, cacheKey);
  pruneExpiredDriveImportCatalogCache();
}

function getLatestCachedDriveImportCatalogResult(userId: string) {
  const cacheKey = latestDriveImportCatalogKeyByUserId.get(userId);
  if (!cacheKey) {
    return null;
  }

  const entry = driveImportCatalogCache.get(cacheKey);
  if (!entry) {
    latestDriveImportCatalogKeyByUserId.delete(userId);
    return null;
  }

  if (!isCacheEntryFresh(entry)) {
    driveImportCatalogCache.delete(cacheKey);
    latestDriveImportCatalogKeyByUserId.delete(userId);
    return null;
  }

  return entry;
}

function attachCatalogMetadata<T extends DriveSpreadsheetRecord[]>(
  records: T,
  metadata: DriveProviderScanResult,
) {
  return Object.assign(records, {
    source: metadata.source,
    userId: metadata.userId,
    scannedAt: metadata.scannedAt,
  }) as unknown as DriveImportCatalogRecords;
}

async function loadDriveImportCatalog(input: DriveProviderScanContext = {}) {
  const userId = input.userId ?? "anonymous";
  const provider = getDriveProvider();

  logEvent("info", "[DRIVE] Catalog scan requested", {
    userId,
    mode: DRIVE_PROVIDER_MODE,
  });

  const result = await provider.scanCatalog({ userId });
  rememberDriveImportCatalogResult(result);

  logEvent("info", "[DRIVE] Catalog scan cached", {
    userId: result.userId,
    source: result.source,
    recordCount: result.records.length,
    scannedAt: result.scannedAt.toISOString(),
  });

  return result;
}

export async function listDriveImportSpreadsheets(
  options?: {
    query?: string;
    sourceGroup?: DriveSourceGroupFilter;
  },
  input: DriveProviderScanContext = {},
) {
  const result = await loadDriveImportCatalog(input);
  const filtered = filterDriveSpreadsheetRecords(result.records, options);
  return attachCatalogMetadata(filtered, result);
}

export async function scanDriveImportSpreadsheets(
  options?: {
    query?: string;
    sourceGroup?: DriveSourceGroupFilter;
    page?: number;
    pageSize?: number;
  },
  input: DriveProviderScanContext = {},
): Promise<DriveImportCatalogPage> {
  const result = await loadDriveImportCatalog(input);
  const filtered = filterDriveSpreadsheetRecords(result.records, options);
  const paginated = paginateDriveSpreadsheetRecords(filtered, options?.page, options?.pageSize);

  return {
    ...paginated,
    folderName: DRIVE_IMPORT_FOLDER_NAME,
    pipelineKeyword: DRIVE_IMPORT_KEYWORD,
    groups: groupDriveSpreadsheetRecords(filtered),
    source: result.source,
    userId: result.userId,
    scannedAt: result.scannedAt,
  };
}

export function groupDriveImportSpreadsheets(records: DriveSpreadsheetRecord[]) {
  return groupDriveSpreadsheetRecords(records);
}

export function getDriveImportSpreadsheetById(driveFileId: string, userId: string) {
  const cached = getLatestCachedDriveImportCatalogResult(userId);
  if (!cached) {
    return null;
  }

  return cached.records.find((record) => record.driveFileId === driveFileId) ?? null;
}

export function getDriveImportWorksheets(driveFileId: string, userId: string) {
  return getDriveImportSpreadsheetById(driveFileId, userId)?.worksheets ?? [];
}

export function getDriveImportSourceGroups() {
  return ["ALL", "Brazil", "North", "Yann", "Yuri", "Shawn", "Sophian", "Operations"] as const;
}

export function getDriveImportSpreadsheetCount(userId: string) {
  return getLatestCachedDriveImportCatalogResult(userId)?.records.length ?? 0;
}

export function buildDriveImportSpreadsheetSummaryById(driveFileId: string, userId: string) {
  const record = getDriveImportSpreadsheetById(driveFileId, userId);
  return record ? buildDriveSpreadsheetSummary(record) : null;
}
