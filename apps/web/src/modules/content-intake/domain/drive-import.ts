import { z } from "zod";

export const DRIVE_IMPORT_KEYWORD = "SMM Plan";
export const DRIVE_IMPORT_FOLDER_NAME = "Pipeline #1 / SMM Plan";
export const DRIVE_IMPORT_PAGE_SIZE = 10;

export const driveSourceGroupSchema = z.enum([
  "Brazil",
  "North",
  "Yann",
  "Yuri",
  "Shawn",
  "Sophian",
  "Operations",
]);

export const driveSourceGroupFilterSchema = z.union([driveSourceGroupSchema, z.literal("ALL")]);
export type DriveSourceGroup = z.infer<typeof driveSourceGroupSchema>;
export type DriveSourceGroupFilter = z.infer<typeof driveSourceGroupFilterSchema>;
export const DRIVE_IMPORT_SOURCE_GROUPS = ["ALL", "Brazil", "North", "Yann", "Yuri", "Shawn", "Sophian", "Operations"] as const;

export const driveSourceContextSchema = z.object({
  sourceGroup: driveSourceGroupSchema,
  owner: z.string().min(1),
  region: z.string().min(1),
  audience: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
});

export type DriveSourceContext = z.infer<typeof driveSourceContextSchema>;

export const driveWorksheetSchema = z.object({
  worksheetId: z.string().min(1),
  worksheetName: z.string().min(1),
});

export type DriveWorksheet = z.infer<typeof driveWorksheetSchema>;
export type DriveWorksheetOption = DriveWorksheet;

export const driveSpreadsheetRecordSchema = z.object({
  driveFileId: z.string().min(1),
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  folderName: z.string().min(1),
  subfolderName: z.string().min(1).optional(),
  relativePath: z.string().min(1),
  description: z.string().min(1),
  lastUpdatedAt: z.string().min(1),
  sourceContext: driveSourceContextSchema,
  matchingSignals: z.array(z.string().min(1)).default([]),
  sheetProfileKey: z.string().min(1),
  sheetProfileVersion: z.number().int().positive(),
  worksheets: z.array(driveWorksheetSchema).default([]),
});

export type DriveSpreadsheetRecord = z.infer<typeof driveSpreadsheetRecordSchema>;

export type DriveSpreadsheetScanMatch = {
  record: DriveSpreadsheetRecord;
  matchSignals: string[];
};

export type DriveSpreadsheetScanPage = {
  results: DriveSpreadsheetScanMatch[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type DriveSpreadsheetDirectoryPage = DriveSpreadsheetScanPage & {
  folderName: string;
  pipelineKeyword: string;
  groups: Record<DriveSourceGroup, DriveSpreadsheetRecord[]>;
};

export function normalizeDriveQuery(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

export function recordSearchHaystack(record: DriveSpreadsheetRecord) {
  return [
    record.spreadsheetName,
    record.description,
    record.folderName,
    record.subfolderName ?? "",
    record.relativePath,
    record.sourceContext.owner,
    record.sourceContext.region,
    record.sourceContext.audience,
    record.sourceContext.sourceGroup,
    ...record.sourceContext.tags,
    ...record.matchingSignals,
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesDriveSpreadsheetRecord(record: DriveSpreadsheetRecord, query: string) {
  const normalizedQuery = normalizeDriveQuery(query);
  if (!normalizedQuery) {
    return true;
  }

  return recordSearchHaystack(record).includes(normalizedQuery);
}

export function filterDriveSpreadsheetRecords(
  records: DriveSpreadsheetRecord[],
  options?: {
    query?: string;
    sourceGroup?: DriveSourceGroupFilter;
  },
) {
  const query = options?.query ?? "";
  const sourceGroup = options?.sourceGroup ?? "ALL";

  return records.filter((record) => {
    if (sourceGroup !== "ALL" && record.sourceContext.sourceGroup !== sourceGroup) {
      return false;
    }

    return matchesDriveSpreadsheetRecord(record, query);
  });
}

export function groupDriveSpreadsheetRecords(records: DriveSpreadsheetRecord[]) {
  return records.reduce<Record<DriveSourceGroup, DriveSpreadsheetRecord[]>>(
    (accumulator, record) => {
      accumulator[record.sourceContext.sourceGroup].push(record);
      return accumulator;
    },
    {
      Brazil: [],
      North: [],
      Yann: [],
      Yuri: [],
      Shawn: [],
      Sophian: [],
      Operations: [],
    },
  );
}

export function paginateDriveSpreadsheetRecords(
  records: DriveSpreadsheetRecord[],
  page = 1,
  pageSize = DRIVE_IMPORT_PAGE_SIZE,
): DriveSpreadsheetScanPage {
  const safePageSize = Math.max(1, pageSize);
  const safePage = Math.max(1, page);
  const total = records.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize);
  const start = (safePage - 1) * safePageSize;

  return {
    results: records.slice(start, start + safePageSize).map((record) => ({
      record,
      matchSignals: record.matchingSignals,
    })),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export function buildDriveSpreadsheetSummary(record: DriveSpreadsheetRecord) {
  return {
    spreadsheetName: record.spreadsheetName,
    owner: record.sourceContext.owner,
    lastUpdatedAt: record.lastUpdatedAt,
    sourceGroup: record.sourceContext.sourceGroup,
    relativePath: record.relativePath,
    tags: record.sourceContext.tags,
  };
}

export function formatDriveSourceGroupLabel(group: DriveSourceGroup | "ALL") {
  switch (group) {
    case "ALL":
      return "All sources";
    case "Yuri":
      return "Yuriy";
    case "Shawn":
      return "Sean";
    default:
      return group;
  }
}

export function getDriveImportSourceGroups() {
  return DRIVE_IMPORT_SOURCE_GROUPS;
}
