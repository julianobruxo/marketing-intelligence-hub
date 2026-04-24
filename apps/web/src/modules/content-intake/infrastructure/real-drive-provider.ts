import "server-only";

import { google } from "googleapis";
import { driveSmmPlanImportProfile } from "../domain/sheet-profiles";
import {
  DRIVE_IMPORT_FOLDER_NAME,
  formatDriveSourceGroupLabel,
  type DriveSpreadsheetRecord,
  type DriveSourceContext,
  type DriveSourceGroup,
} from "../domain/drive-import";
import { GoogleConnectionAccessError, getCurrentUserGoogleOAuthClient } from "@/modules/auth/application/google-connection-service";
import { logEvent } from "@/shared/logging/logger";
import type { DriveProvider, DriveProviderScanContext, DriveProviderScanResult } from "./drive-provider-contract";

export const DRIVE_IMPORT_FOLDER_ID = "1nCrB2SnDsw_84ph7eXJGXICuQz510zgS";

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

class DriveProviderError extends Error {
  code: DriveDiscoveryErrorCode;

  constructor(code: DriveDiscoveryErrorCode, message: string) {
    super(message);
    this.name = "DriveProviderError";
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

function inferSourceGroupFromSpreadsheetName(spreadsheetName: string): DriveSourceGroup {
  return matchesSourceGroupToken(spreadsheetName) ?? "Operations";
}

function inferSourceGroupFromPath(pathSegments: string[], spreadsheetName: string): DriveSourceGroup {
  const nameGroup = inferSourceGroupFromSpreadsheetName(spreadsheetName);
  if (nameGroup !== "Operations") {
    return nameGroup;
  }

  const segmentsToCheck = [...pathSegments].slice(1).reverse();
  for (const segment of segmentsToCheck) {
    const match = matchesSourceGroupToken(segment);
    if (match) {
      return match;
    }
  }

  return "Operations";
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

function mapGoogleErrorToProviderError(error: unknown): DriveProviderError {
  if (error instanceof GoogleConnectionAccessError) {
    return new DriveProviderError(error.code as DriveDiscoveryErrorCode, error.message);
  }

  const status = getGoogleApiStatus(error);
  const message = error instanceof Error ? error.message : "Unknown Drive discovery error";

  if (status === 403 || status === 404) {
    return new DriveProviderError(
      "FOLDER_INACCESSIBLE",
      "The configured Drive folder is not accessible for the connected Google account.",
    );
  }

  if (status === 401) {
    return new DriveProviderError(
      "MISSING_GOOGLE_CREDENTIALS",
      "The connected Google credentials are missing, expired, or revoked.",
    );
  }

  return new DriveProviderError("DRIVE_API_FAILED", message);
}

async function listDriveFolderChildren(drive: ReturnType<typeof google.drive>, folderId: string) {
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

async function scanRealDriveImportCatalog(input: DriveProviderScanContext = {}): Promise<DriveProviderScanResult> {
  const { connection, oauthClient } = await getCurrentUserGoogleOAuthClient();
  const drive = google.drive({ version: "v3", auth: oauthClient });

  logEvent("info", "[DRIVE] Starting real provider scan", {
    requestedUserId: input.userId ?? null,
    userId: connection.userId,
    folderId: DRIVE_IMPORT_FOLDER_ID,
    mode: "REAL",
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

  logEvent("info", "[DRIVE] Real provider scan completed", {
    userId: connection.userId,
    folderId: DRIVE_IMPORT_FOLDER_ID,
    foldersTraversed: stats.foldersTraversed,
    subfoldersTraversed: Math.max(0, stats.foldersTraversed - 1),
    spreadsheetCount: stats.spreadsheetsFound,
  });

  return {
    records,
    source: "REAL",
    userId: connection.userId,
    scannedAt: new Date(),
  };
}

export const realDriveProvider: DriveProvider = {
  async scanCatalog(input = {}) {
    try {
      return await scanRealDriveImportCatalog(input);
    } catch (error) {
      const providerError = error instanceof DriveProviderError ? error : mapGoogleErrorToProviderError(error);

      logEvent("error", "[DRIVE] Real provider scan failed", {
        requestedUserId: input.userId ?? null,
        code: providerError.code,
        message: providerError.message,
        status: getGoogleApiStatus(error),
      });

      throw providerError;
    }
  },
};
