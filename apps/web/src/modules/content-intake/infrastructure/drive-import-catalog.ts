import "server-only";

import { google } from "googleapis";
import { driveSmmPlanImportProfile } from "../domain/sheet-profiles";
import {
  DRIVE_IMPORT_FOLDER_NAME,
  DRIVE_IMPORT_KEYWORD,
  DRIVE_IMPORT_PAGE_SIZE,
  buildDriveSpreadsheetSummary,
  filterDriveSpreadsheetRecords,
  formatDriveSourceGroupLabel,
  groupDriveSpreadsheetRecords,
  paginateDriveSpreadsheetRecords,
  type DriveSpreadsheetRecord,
  type DriveSourceGroup,
  type DriveSourceGroupFilter,
  type DriveSourceContext,
  type DriveSpreadsheetDirectoryPage,
  type DriveWorksheet,
} from "../domain/drive-import";
import {
  GoogleConnectionAccessError,
  getCurrentUserGoogleOAuthClient,
} from "@/modules/auth/application/google-connection-service";

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

type GoogleDriveFileRecord = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  modifiedTime?: string | null;
  parents?: string[] | null;
  owners?: Array<{
    displayName?: string | null;
    emailAddress?: string | null;
  } | null> | null;
  lastModifyingUser?: {
    displayName?: string | null;
    emailAddress?: string | null;
  } | null;
};

type DriveDiscoveryErrorCode =
  | "NO_GOOGLE_CONNECTION"
  | "GOOGLE_OAUTH_NOT_CONFIGURED"
  | "GOOGLE_CONNECTION_INACTIVE"
  | "INSUFFICIENT_GOOGLE_SCOPES"
  | "MISSING_GOOGLE_CREDENTIALS"
  | "FOLDER_INACCESSIBLE"
  | "DRIVE_API_FAILED";

class DriveDiscoveryError extends Error {
  code: DriveDiscoveryErrorCode;

  constructor(code: DriveDiscoveryErrorCode, message: string) {
    super(message);
    this.name = "DriveDiscoveryError";
    this.code = code;
  }
}

const DRIVE_IMPORT_SHEET_PROFILE_KEY = driveSmmPlanImportProfile.key;
const DRIVE_IMPORT_SHEET_PROFILE_VERSION = driveSmmPlanImportProfile.version;
const DRIVE_LIST_PAGE_SIZE = 1000;
const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const GOOGLE_DRIVE_SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

const DRIVE_SOURCE_CONTEXTS: Record<
  DriveSourceGroup,
  {
    region: string;
    audience: string;
    tags: string[];
  }
> = {
  Brazil: {
    region: "Brazil",
    audience: "Regional LinkedIn pipeline",
    tags: ["Brazil", "Regional", "LinkedIn", "Monthly"],
  },
  North: {
    region: "Brazil",
    audience: "North region content",
    tags: ["Brazil", "North", "Regional", "LinkedIn"],
  },
  Yann: {
    region: "North America",
    audience: "Founder-led content",
    tags: ["Yann", "LinkedIn", "Substack", "Personal brand"],
  },
  Yuri: {
    region: "North America",
    audience: "Enterprise browser buyers",
    tags: ["Yuriy", "Yuri", "Security", "LinkedIn", "Enterprise"],
  },
  Shawn: {
    region: "North America",
    audience: "Security and IT leaders",
    tags: ["Sean", "Shawn", "Browser risk", "LinkedIn", "Security"],
  },
  Sophian: {
    region: "EMEA",
    audience: "Bilingual audience",
    tags: ["Sophian", "Bilingual", "LinkedIn", "Marketing"],
  },
  Operations: {
    region: "Global",
    audience: "Shared workflow routing",
    tags: ["Operations", "Routing", "Shared", "Pipeline #1"],
  },
};

const latestDriveImportRecordsById = new Map<string, DriveSpreadsheetRecord>();

function isDriveDiscoveryError(error: unknown): error is DriveDiscoveryError {
  return error instanceof DriveDiscoveryError;
}

function getGoogleApiStatus(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: number;
      response?: { status?: number };
    };

    return candidate.response?.status ?? candidate.code ?? null;
  }

  return null;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function matchesSourceGroupToken(value: string): DriveSourceGroup | null {
  const normalized = normalizeText(value);

  if (normalized.includes("brazil north")) {
    return "North";
  }

  if (normalized.includes("brazil")) {
    return "Brazil";
  }

  if (normalized.includes("yann")) {
    return "Yann";
  }

  if (normalized.includes("yuri")) {
    return "Yuri";
  }

  if (normalized.includes("yuriy")) {
    return "Yuri";
  }

  if (normalized.includes("shawn")) {
    return "Shawn";
  }

  if (normalized.includes("sean")) {
    return "Shawn";
  }

  if (normalized.includes("sophian")) {
    return "Sophian";
  }

  if (
    normalized.includes("operations") ||
    normalized.includes("market ops") ||
    normalized.includes("future lab") ||
    normalized.includes("routing")
  ) {
    return "Operations";
  }

  return null;
}

function inferSourceGroupFromPath(pathSegments: string[], spreadsheetName: string): DriveSourceGroup {
  const segmentsToCheck = [...pathSegments].slice(1).reverse();
  for (const segment of segmentsToCheck) {
    const match = matchesSourceGroupToken(segment);
    if (match) {
      return match;
    }
  }

  return inferSourceGroupFromSpreadsheetName(spreadsheetName);
}

function inferSourceGroupFromSpreadsheetName(spreadsheetName: string): DriveSourceGroup {
  return matchesSourceGroupToken(spreadsheetName) ?? "Operations";
}

function inferOwnerFromDriveFile(file: GoogleDriveFileRecord) {
  return (
    file.owners?.[0]?.displayName?.trim() ||
    file.owners?.[0]?.emailAddress?.trim() ||
    file.lastModifyingUser?.displayName?.trim() ||
    file.lastModifyingUser?.emailAddress?.trim() ||
    "Unknown owner"
  );
}

function buildRelativePath(pathSegments: string[], spreadsheetName: string) {
  return [...pathSegments, spreadsheetName].join(" / ");
}

function buildMatchingSignals(sourceGroup: DriveSourceGroup, owner: string, spreadsheetName: string, pathSegments: string[]) {
  return [
    "google-drive-live",
    `folder:${DRIVE_IMPORT_FOLDER_ID}`,
    `path:${pathSegments.join(" / ")}`,
    `source-group:${sourceGroup}`,
    `owner:${owner}`,
    `file:${spreadsheetName}`,
  ];
}

function buildSourceContext(sourceGroup: DriveSourceGroup, owner: string): DriveSourceContext {
  const context = DRIVE_SOURCE_CONTEXTS[sourceGroup];

  return {
    sourceGroup,
    owner,
    region: context.region,
    audience: context.audience,
    tags: context.tags,
  };
}

function buildDriveSpreadsheetRecord(file: GoogleDriveFileRecord, pathSegments: string[]): DriveSpreadsheetRecord | null {
  if (!file.id || !file.name) {
    return null;
  }

  const spreadsheetName = file.name.trim();

  const sourceGroup = inferSourceGroupFromPath(pathSegments, spreadsheetName);
  const owner = inferOwnerFromDriveFile(file);
  const sourceContext = buildSourceContext(sourceGroup, owner);

  return {
    driveFileId: file.id,
    spreadsheetId: file.id,
    spreadsheetName,
    folderName: DRIVE_IMPORT_FOLDER_NAME,
    subfolderName: pathSegments.length > 1 ? pathSegments.slice(1).join(" / ") : undefined,
    relativePath: buildRelativePath(pathSegments, spreadsheetName),
    description: `${formatDriveSourceGroupLabel(sourceGroup)} spreadsheet discovered in the configured Drive folder.`,
    lastUpdatedAt: file.modifiedTime ?? new Date().toISOString(),
    sourceContext,
    matchingSignals: buildMatchingSignals(sourceGroup, owner, spreadsheetName, pathSegments),
    sheetProfileKey: DRIVE_IMPORT_SHEET_PROFILE_KEY,
    sheetProfileVersion: DRIVE_IMPORT_SHEET_PROFILE_VERSION,
    worksheets: [],
  };
}

function cacheDriveImportRecords(records: DriveSpreadsheetRecord[]) {
  latestDriveImportRecordsById.clear();

  for (const record of records) {
    latestDriveImportRecordsById.set(record.driveFileId, record);
  }
}

function getDriveImportErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Drive discovery error";
}

function mapGoogleErrorToDiscoveryError(error: unknown): DriveDiscoveryError {
  if (error instanceof GoogleConnectionAccessError) {
    return new DriveDiscoveryError(error.code as DriveDiscoveryErrorCode, error.message);
  }

  const status = getGoogleApiStatus(error);
  const message = getDriveImportErrorMessage(error);

  if (status === 403 || status === 404) {
    return new DriveDiscoveryError(
      "FOLDER_INACCESSIBLE",
      "The configured Drive folder is not accessible for the connected Google account.",
    );
  }

  if (status === 401) {
    return new DriveDiscoveryError(
      "MISSING_GOOGLE_CREDENTIALS",
      "The connected Google credentials are missing, expired, or revoked.",
    );
  }

  return new DriveDiscoveryError("DRIVE_API_FAILED", message);
}

async function listDriveFolderChildren(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
) {
  const children: GoogleDriveFileRecord[] = [];
  let nextPageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      corpora: "allDrives",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: DRIVE_LIST_PAGE_SIZE,
      pageToken: nextPageToken,
      fields:
        "nextPageToken, files(id,name,mimeType,modifiedTime,parents,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))",
    });

    children.push(...((response.data.files ?? []) as GoogleDriveFileRecord[]));
    nextPageToken = response.data.nextPageToken ?? undefined;
  } while (nextPageToken);

  return children;
}

async function traverseDriveFolderTree(input: {
  drive: ReturnType<typeof google.drive>;
  folderId: string;
  pathSegments: string[];
  visitedFolderIds: Set<string>;
  seenSpreadsheetIds: Set<string>;
  records: DriveSpreadsheetRecord[];
  stats: {
    foldersTraversed: number;
    spreadsheetsFound: number;
  };
}) {
  const { drive, folderId, pathSegments, visitedFolderIds, seenSpreadsheetIds, records, stats } = input;

  if (visitedFolderIds.has(folderId)) {
    return;
  }

  visitedFolderIds.add(folderId);
  stats.foldersTraversed += 1;

  const children = await listDriveFolderChildren(drive, folderId);

  for (const child of children) {
    if (!child.id || !child.mimeType) {
      continue;
    }

    if (child.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
      await traverseDriveFolderTree({
        drive,
        folderId: child.id,
        pathSegments: [...pathSegments, child.name?.trim() || "Untitled folder"],
        visitedFolderIds,
        seenSpreadsheetIds,
        records,
        stats,
      });
      continue;
    }

    if (child.mimeType === GOOGLE_DRIVE_SPREADSHEET_MIME_TYPE) {
      if (seenSpreadsheetIds.has(child.id)) {
        continue;
      }

      const record = buildDriveSpreadsheetRecord(child, pathSegments);
      if (record) {
        seenSpreadsheetIds.add(child.id);
        records.push(record);
        stats.spreadsheetsFound += 1;
      }
    }
  }
}

async function loadLiveDriveImportRecords() {
  let connectionContext:
    | {
        userId: string;
        userEmail: string;
        hasAccessToken: boolean;
        hasRefreshToken: boolean;
        scopePresent: boolean;
      }
    | null = null;

  try {
    const { connection, oauthClient } = await getCurrentUserGoogleOAuthClient();
    const drive = google.drive({ version: "v3", auth: oauthClient });

    connectionContext = {
      userId: connection.userId,
      userEmail: connection.googleEmail,
      hasAccessToken: Boolean(connection.accessToken),
      hasRefreshToken: Boolean(connection.refreshToken),
      scopePresent: Boolean(connection.scope),
    };

    console.info("[drive-import] scanning configured Drive folder", {
      userId: connectionContext.userId,
      userEmail: connectionContext.userEmail,
      folderId: DRIVE_IMPORT_FOLDER_ID,
      hasAccessToken: connectionContext.hasAccessToken,
      hasRefreshToken: connectionContext.hasRefreshToken,
      scopePresent: connectionContext.scopePresent,
    });

    const rootFolderResponse = await drive.files.get({
      fileId: DRIVE_IMPORT_FOLDER_ID,
      supportsAllDrives: true,
      fields: "id,name,mimeType,trashed",
    });

    const rootFolderName = rootFolderResponse.data.name?.trim() || DRIVE_IMPORT_FOLDER_NAME;
    const records: DriveSpreadsheetRecord[] = [];
    const stats = {
      foldersTraversed: 0,
      spreadsheetsFound: 0,
    };

    await traverseDriveFolderTree({
      drive,
      folderId: DRIVE_IMPORT_FOLDER_ID,
      pathSegments: [rootFolderName],
      visitedFolderIds: new Set<string>(),
      seenSpreadsheetIds: new Set<string>(),
      records,
      stats,
    });

    cacheDriveImportRecords(records);

    console.info("[drive-import] configured Drive folder scan completed", {
      userId: connection.userId,
      userEmail: connection.googleEmail,
      folderId: DRIVE_IMPORT_FOLDER_ID,
      foldersTraversed: stats.foldersTraversed,
      subfoldersTraversed: Math.max(0, stats.foldersTraversed - 1),
      spreadsheetCount: stats.spreadsheetsFound,
    });

    return records;
  } catch (error) {
    const discoveryError = isDriveDiscoveryError(error) ? error : mapGoogleErrorToDiscoveryError(error);

    console.warn("[drive-import] configured Drive folder scan failed", {
      ...(connectionContext ?? {}),
      folderId: DRIVE_IMPORT_FOLDER_ID,
      code: discoveryError.code,
      status: getGoogleApiStatus(error),
    });

    throw discoveryError;
  }
}

export async function listDriveImportSpreadsheets(options?: {
  query?: string;
  sourceGroup?: DriveSourceGroupFilter;
}) {
  const records = await loadLiveDriveImportRecords();
  return filterDriveSpreadsheetRecords(records, options);
}

export async function scanDriveImportSpreadsheets(options?: {
  query?: string;
  sourceGroup?: DriveSourceGroupFilter;
  page?: number;
  pageSize?: number;
}): Promise<DriveSpreadsheetDirectoryPage> {
  const filtered = await listDriveImportSpreadsheets(options);
  const paginated = paginateDriveSpreadsheetRecords(filtered, options?.page, options?.pageSize);

  return {
    ...paginated,
    folderName: DRIVE_IMPORT_FOLDER_NAME,
    pipelineKeyword: DRIVE_IMPORT_KEYWORD,
    groups: groupDriveSpreadsheetRecords(filtered),
  };
}

export function groupDriveImportSpreadsheets(records: DriveSpreadsheetRecord[]) {
  return groupDriveSpreadsheetRecords(records);
}

export function getDriveImportSpreadsheetById(driveFileId: string) {
  return latestDriveImportRecordsById.get(driveFileId) ?? null;
}

export function getDriveImportWorksheets(driveFileId: string) {
  return getDriveImportSpreadsheetById(driveFileId)?.worksheets ?? [];
}

export function getDriveImportSourceGroups() {
  return ["ALL", "Brazil", "North", "Yann", "Yuri", "Shawn", "Sophian", "Operations"] as const;
}

export function getDriveImportSpreadsheetCount() {
  return latestDriveImportRecordsById.size;
}

export function buildDriveImportSpreadsheetSummaryById(driveFileId: string) {
  const record = getDriveImportSpreadsheetById(driveFileId);
  return record ? buildDriveSpreadsheetSummary(record) : null;
}
