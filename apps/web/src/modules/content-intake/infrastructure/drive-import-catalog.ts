import { zazmicBrazilPlanningProfile } from "../domain/sheet-profiles";

export const MOCK_DRIVE_IMPORT_FOLDER = "Pipeline #1 / SMM Plan";
export const DRIVE_IMPORT_KEYWORD = "SMM Plan";

export type DriveSourceGroup =
  | "Brazil"
  | "North"
  | "Yann"
  | "Yuri"
  | "Shawn"
  | "Sophian"
  | "Operations";

export type DriveSourceContext = {
  sourceGroup: DriveSourceGroup;
  owner: string;
  region: string;
  audience: string;
  tags: string[];
};

export type DriveWorksheetOption = {
  worksheetId: string;
  worksheetName: string;
};

export type DriveSpreadsheetRecord = {
  driveFileId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  folderName: string;
  description: string;
  sourceContext: DriveSourceContext;
  sheetProfileKey: string;
  sheetProfileVersion: number;
  worksheets: DriveWorksheetOption[];
};

const DRIVE_SPREADSHEET_RECORDS: DriveSpreadsheetRecord[] = [
  {
    driveFileId: "drive-file-brazil-q2-smm-plan",
    spreadsheetId: "drive-brazil-q2-smm-plan",
    spreadsheetName: "SMM Plan | Brazil Q2 2026",
    folderName: MOCK_DRIVE_IMPORT_FOLDER,
    description: "Brazil pipeline content calendar with monthly LinkedIn planning tabs.",
    sourceContext: {
      sourceGroup: "Brazil",
      owner: "Brazil content ops",
      region: "Brazil",
      audience: "Regional LinkedIn pipeline",
      tags: ["Brazil", "Regional", "LinkedIn", "Monthly"],
    },
    sheetProfileKey: zazmicBrazilPlanningProfile.key,
    sheetProfileVersion: zazmicBrazilPlanningProfile.version,
    worksheets: [
      { worksheetId: "brazil-apr-2026", worksheetName: "Apr 2026" },
      { worksheetId: "brazil-may-2026", worksheetName: "May 2026" },
      { worksheetId: "brazil-jun-2026", worksheetName: "Jun 2026" },
    ],
  },
  {
    driveFileId: "drive-file-yann-q2-smm-plan",
    spreadsheetId: "drive-yann-q2-smm-plan",
    spreadsheetName: "SMM Plan | Yann Kronberg",
    folderName: MOCK_DRIVE_IMPORT_FOLDER,
    description: "Yann planning workbook with LinkedIn and Substack content tabs.",
    sourceContext: {
      sourceGroup: "Yann",
      owner: "Yann Kronberg",
      region: "North America",
      audience: "Founder-led content",
      tags: ["Yann", "LinkedIn", "Substack", "Personal brand"],
    },
    sheetProfileKey: zazmicBrazilPlanningProfile.key,
    sheetProfileVersion: zazmicBrazilPlanningProfile.version,
    worksheets: [
      { worksheetId: "yann-apr-2026", worksheetName: "LinkedIn + Substack (April 2026)" },
      { worksheetId: "yann-may-2026", worksheetName: "May 2026" },
    ],
  },
  {
    driveFileId: "drive-file-yuri-q2-smm-plan",
    spreadsheetId: "drive-yuri-q2-smm-plan",
    spreadsheetName: "SMM Plan | Yuri",
    folderName: MOCK_DRIVE_IMPORT_FOLDER,
    description: "Yuri content plan for enterprise browser stories and internal campaigns.",
    sourceContext: {
      sourceGroup: "Yuri",
      owner: "Yuri",
      region: "North America",
      audience: "Enterprise browser buyers",
      tags: ["Yuri", "Security", "LinkedIn", "Enterprise"],
    },
    sheetProfileKey: zazmicBrazilPlanningProfile.key,
    sheetProfileVersion: zazmicBrazilPlanningProfile.version,
    worksheets: [
      { worksheetId: "yuri-apr-2026", worksheetName: "Apr 2026" },
      { worksheetId: "yuri-may-2026", worksheetName: "May 2026" },
    ],
  },
  {
    driveFileId: "drive-file-shawn-q2-smm-plan",
    spreadsheetId: "drive-shawn-q2-smm-plan",
    spreadsheetName: "SMM Plan | Shawn",
    folderName: MOCK_DRIVE_IMPORT_FOLDER,
    description: "Shawn pipeline content focused on browser risk and security themes.",
    sourceContext: {
      sourceGroup: "Shawn",
      owner: "Shawn",
      region: "North America",
      audience: "Security and IT leaders",
      tags: ["Shawn", "Browser risk", "LinkedIn", "Security"],
    },
    sheetProfileKey: zazmicBrazilPlanningProfile.key,
    sheetProfileVersion: zazmicBrazilPlanningProfile.version,
    worksheets: [
      { worksheetId: "shawn-apr-2026", worksheetName: "Apr 2026" },
      { worksheetId: "shawn-may-2026", worksheetName: "May 2026" },
      { worksheetId: "shawn-jun-2026", worksheetName: "Jun 2026" },
    ],
  },
  {
    driveFileId: "drive-file-sophian-q2-smm-plan",
    spreadsheetId: "drive-sophian-q2-smm-plan",
    spreadsheetName: "SMM Plan | Sophian Yacine",
    folderName: MOCK_DRIVE_IMPORT_FOLDER,
    description: "Sophian Yacine content plan for bilingual marketing motions.",
    sourceContext: {
      sourceGroup: "Sophian",
      owner: "Sophian Yacine",
      region: "EMEA",
      audience: "Bilingual audience",
      tags: ["Sophian", "Bilingual", "LinkedIn", "Marketing"],
    },
    sheetProfileKey: zazmicBrazilPlanningProfile.key,
    sheetProfileVersion: zazmicBrazilPlanningProfile.version,
    worksheets: [
      { worksheetId: "sophian-apr-2026", worksheetName: "Apr 2026" },
      { worksheetId: "sophian-may-2026", worksheetName: "May 2026" },
    ],
  },
  {
    driveFileId: "drive-file-brazil-north-smm-plan",
    spreadsheetId: "drive-brazil-north-smm-plan",
    spreadsheetName: "SMM Plan | Brazil North",
    folderName: MOCK_DRIVE_IMPORT_FOLDER,
    description: "North region Brazil campaign sheet for monthly publishing.",
    sourceContext: {
      sourceGroup: "North",
      owner: "Brazil North ops",
      region: "Brazil",
      audience: "North region content",
      tags: ["Brazil", "North", "Regional", "LinkedIn"],
    },
    sheetProfileKey: zazmicBrazilPlanningProfile.key,
    sheetProfileVersion: zazmicBrazilPlanningProfile.version,
    worksheets: [
      { worksheetId: "north-apr-2026", worksheetName: "Apr 2026" },
      { worksheetId: "north-may-2026", worksheetName: "May 2026" },
    ],
  },
  {
    driveFileId: "drive-file-market-ops-smm-plan",
    spreadsheetId: "drive-market-ops-smm-plan",
    spreadsheetName: "SMM Plan | Market Ops",
    folderName: MOCK_DRIVE_IMPORT_FOLDER,
    description: "Operations workbook for shared Pipeline #1 planning and routing.",
    sourceContext: {
      sourceGroup: "Operations",
      owner: "Pipeline #1 ops",
      region: "Global",
      audience: "Shared workflow routing",
      tags: ["Operations", "Routing", "Shared", "Pipeline #1"],
    },
    sheetProfileKey: zazmicBrazilPlanningProfile.key,
    sheetProfileVersion: zazmicBrazilPlanningProfile.version,
    worksheets: [
      { worksheetId: "ops-apr-2026", worksheetName: "Apr 2026" },
      { worksheetId: "ops-may-2026", worksheetName: "May 2026" },
      { worksheetId: "ops-jun-2026", worksheetName: "Jun 2026" },
    ],
  },
  {
    driveFileId: "drive-file-future-lab-smm-plan",
    spreadsheetId: "drive-future-lab-smm-plan",
    spreadsheetName: "SMM Plan | Future Lab",
    folderName: MOCK_DRIVE_IMPORT_FOLDER,
    description: "Reserved workbook for future source contexts and content lanes.",
    sourceContext: {
      sourceGroup: "Operations",
      owner: "Future Lab",
      region: "Global",
      audience: "Future content sources",
      tags: ["Future", "Placeholder", "Testing", "Pipeline #1"],
    },
    sheetProfileKey: zazmicBrazilPlanningProfile.key,
    sheetProfileVersion: zazmicBrazilPlanningProfile.version,
    worksheets: [
      { worksheetId: "future-apr-2026", worksheetName: "Apr 2026" },
      { worksheetId: "future-may-2026", worksheetName: "May 2026" },
    ],
  },
];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(record: DriveSpreadsheetRecord, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalizeText(query);
  const haystack = [
    record.spreadsheetName,
    record.description,
    record.folderName,
    record.sourceContext.owner,
    record.sourceContext.region,
    record.sourceContext.audience,
    record.sourceContext.sourceGroup,
    ...record.sourceContext.tags,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function listDriveImportSpreadsheets(options?: {
  query?: string;
  sourceGroup?: DriveSourceGroup | "ALL";
}) {
  const query = options?.query?.trim() ?? "";
  const sourceGroup = options?.sourceGroup ?? "ALL";

  return DRIVE_SPREADSHEET_RECORDS.filter((record) => {
    if (sourceGroup !== "ALL" && record.sourceContext.sourceGroup !== sourceGroup) {
      return false;
    }

    return matchesSearch(record, query);
  });
}

export function groupDriveImportSpreadsheets(records: DriveSpreadsheetRecord[]) {
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

export function getDriveImportSpreadsheetById(driveFileId: string) {
  return DRIVE_SPREADSHEET_RECORDS.find((record) => record.driveFileId === driveFileId) ?? null;
}

export function getDriveImportWorksheets(driveFileId: string) {
  return getDriveImportSpreadsheetById(driveFileId)?.worksheets ?? [];
}

export function getDriveImportSourceGroups() {
  return [
    "ALL",
    "Brazil",
    "North",
    "Yann",
    "Yuri",
    "Shawn",
    "Sophian",
    "Operations",
  ] as const;
}

export function getDriveImportSpreadsheetCount() {
  return DRIVE_SPREADSHEET_RECORDS.length;
}
