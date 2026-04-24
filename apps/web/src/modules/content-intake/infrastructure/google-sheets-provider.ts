import "server-only";

import { createHash } from "node:crypto";
import { google } from "googleapis";
import { ContentProfile, type DriveReimportStrategy } from "@prisma/client";
import { getCurrentUserGoogleOAuthClient } from "@/modules/auth/application/google-connection-service";
import { normalizeSheetRow } from "@/modules/content-intake/application/normalize-sheet-row";
import type { DriveSpreadsheetRecord, DriveWorksheet } from "@/modules/content-intake/domain/drive-import";
import { DRIVE_PROVIDER_MODE } from "@/shared/config/env";
import {
  driveSmmPlanImportProfile,
  findMappedFieldHeaders,
  type SheetProfile,
} from "@/modules/content-intake/domain/sheet-profiles";
import type { NormalizeSheetRowRequest } from "@/modules/content-intake/domain/normalize-sheet-request";
import { getMockGoogleSpreadsheetWorkbook } from "./mock-google-sheets-provider";

const SHEET_VALUE_RANGE = "A:AZ";
const MAX_HEADER_SCAN_ROWS = 20;

type RawWorksheet = DriveWorksheet & {
  rows: string[][];
};

type HeaderSelection = {
  headerRowNumber: number;
  headers: string[];
};

export type GoogleSheetsRawWorksheetImport = DriveWorksheet & {
  rows: string[][];
  detectedHeaders: string[];
  detectedHeaderRowNumber: number | null;
};

export type GoogleSheetsRawSpreadsheetImport = {
  spreadsheetId: string;
  spreadsheetName: string;
  availableWorksheets: DriveWorksheet[];
  worksheets: GoogleSheetsRawWorksheetImport[];
};

export type GoogleSheetsParsedRow = {
  worksheetId: string;
  worksheetName: string;
  rowId: string;
  rowNumber: number;
  rowVersion: string;
  rowKind: string;
  headerRowNumber: number;
  headers: string[];
  rowValues: string[];
  rowMap: Record<string, string>;
  mappedFields: Record<string, unknown>;
  unmappedHeaders: string[];
  rowQualification: {
    disposition: "QUALIFIED" | "SKIPPED_NON_DATA" | "REJECTED_INVALID";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    reasons: string[];
    signals: {
      hasDate: boolean;
      hasTitle: boolean;
      hasCopy: boolean;
      hasPlatform: boolean;
      hasLink: boolean;
      hasPublicationMarker: boolean;
    };
    isPublishedRow: boolean;
  };
  titleDerivation: {
    strategy: string;
    title: string;
    sourceField?: string;
    titleDerivedFromBrief?: boolean;
  };
  planningFields: {
    plannedDate?: string;
    campaignLabel?: string;
    copyEnglish: string;
    sourceAssetLink?: string;
    contentDeadline?: string;
  };
  sourceMetadata: {
    publishedFlag?: string | boolean;
  };
  contentProfile: ContentProfile;
  operationalStatus:
    | "BLOCKED"
    | "WAITING_FOR_COPY"
    | "READY_FOR_DESIGN"
    | "READY_TO_PUBLISH"
    | "LATE"
    | "POSTED"
    | "PUBLISHED";
  blockReason?: "MISSING_TITLE" | "MISSING_COPY";
  translationRequired: boolean;
  autoPostEnabled: boolean;
  preferredDesignProvider: "CANVA" | "GPT_IMAGE" | "AI_VISUAL" | "MANUAL";
  contentSignature: string;
};

export type GoogleSheetsWorksheetImport = {
  worksheetId: string;
  worksheetName: string;
  rows: GoogleSheetsParsedRow[];
};

export type GoogleSheetsSpreadsheetImport = {
  spreadsheetId: string;
  spreadsheetName: string;
  availableWorksheets: DriveWorksheet[];
  worksheets: GoogleSheetsWorksheetImport[];
  validWorksheetCount: number;
};

function normalizeHeaderValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeWorksheetName(worksheetName: string) {
  return `'${worksheetName.replace(/'/g, "''")}'`;
}

function hashRowVersion(rowValues: string[]) {
  return createHash("sha256").update(JSON.stringify(rowValues)).digest("hex");
}

function inferContentProfile(sourceGroup: string, spreadsheetName: string): ContentProfile {
  const haystack = `${sourceGroup} ${spreadsheetName}`.toLowerCase();

  if (haystack.includes("yann")) {
    return ContentProfile.YANN;
  }

  if (haystack.includes("yuriy") || haystack.includes("yuri")) {
    return ContentProfile.YURI;
  }

  if (haystack.includes("sean") || haystack.includes("shawn")) {
    return ContentProfile.SHAWN;
  }

  if (haystack.includes("sophian")) {
    return ContentProfile.SOPHIAN_YACINE;
  }

  return ContentProfile.ZAZMIC_PAGE;
}

function inferContentType(rowValues: string[], spreadsheetName: string) {
  const haystack = `${spreadsheetName} ${rowValues.join(" ")}`.toLowerCase();
  return haystack.includes("carousel") ? "CAROUSEL" : "STATIC_POST";
}

function scoreHeaderRow(headers: string[], profile: SheetProfile) {
  const normalizedHeaders = new Set(headers.map(normalizeHeaderValue).filter(Boolean));
  const { mappedFields } = findMappedFieldHeaders(headers, profile);
  const mappedFieldCount = Object.keys(mappedFields).length;
  const requiredMatches = profile.headerDiscovery.requiredHeaderAliases.filter((alias) =>
    normalizedHeaders.has(normalizeHeaderValue(alias)),
  ).length;

  return {
    mappedFieldCount,
    requiredMatches,
    score: mappedFieldCount * 10 + requiredMatches,
    hasPlannedDate: Boolean(mappedFields.plannedDate),
    hasCopy: Boolean(mappedFields.copyEnglish),
  };
}

function selectHeaderRow(rows: string[][], profile: SheetProfile): HeaderSelection | null {
  const candidateIndexes = new Set<number>();

  for (const rowNumber of profile.headerDiscovery.headerRowCandidates) {
    candidateIndexes.add(Math.max(0, rowNumber - 1));
  }

  for (let index = 0; index < Math.min(rows.length, MAX_HEADER_SCAN_ROWS); index += 1) {
    candidateIndexes.add(index);
  }

  let bestSelection: (HeaderSelection & { score: number }) | null = null;

  for (const rowIndex of candidateIndexes) {
    const headers = (rows[rowIndex] ?? []).map((value) => value.trim());
    if (headers.length === 0 || headers.every((value) => value.length === 0)) {
      continue;
    }

    const score = scoreHeaderRow(headers, profile);
    if (score.mappedFieldCount < 2 || (!score.hasPlannedDate && !score.hasCopy)) {
      continue;
    }

    if (!bestSelection || score.score > bestSelection.score) {
      bestSelection = {
        headerRowNumber: rowIndex + 1,
        headers,
        score: score.score,
      };
    }
  }

  return bestSelection
    ? {
        headerRowNumber: bestSelection.headerRowNumber,
        headers: bestSelection.headers,
      }
    : null;
}

function normalizeRowValues(headers: string[], rowValues: string[]) {
  const nextRowValues = [...rowValues];
  while (nextRowValues.length < headers.length) {
    nextRowValues.push("");
  }

  return nextRowValues.slice(0, headers.length);
}

function buildOperationalRawRow(input: {
  plannedDate?: string;
  campaignLabel?: string;
  copyEnglish: string;
  sourceAssetLink?: string;
  contentDeadline?: string;
  publishedFlag?: string | boolean;
}) {
  const rawRow: Record<string, string | boolean> = {
    "LinkedIn Copy": input.copyEnglish,
  };

  if (input.plannedDate?.trim()) {
    rawRow.Date = input.plannedDate.trim();
  }

  if (input.campaignLabel?.trim()) {
    rawRow.Title = input.campaignLabel.trim();
  }

  if (input.sourceAssetLink?.trim()) {
    rawRow["IMG LINK"] = input.sourceAssetLink.trim();
  }

  if (input.contentDeadline?.trim()) {
    rawRow["Content Deadline"] = input.contentDeadline.trim();
  }

  if (typeof input.publishedFlag === "string") {
    if (input.publishedFlag.trim()) {
      rawRow.Published = input.publishedFlag.trim();
    }
  } else if (typeof input.publishedFlag === "boolean") {
    rawRow.Published = input.publishedFlag ? "Yes" : "No";
  }

  return rawRow as Record<string, string>;
}

async function getSheetsClient() {
  const { oauthClient } = await getCurrentUserGoogleOAuthClient();
  return google.sheets({ version: "v4", auth: oauthClient });
}

export async function listLiveSpreadsheetWorksheets(spreadsheetId: string): Promise<DriveWorksheet[]> {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
    fields: "sheets(properties(sheetId,title,index,hidden))",
  });

  return (response.data.sheets ?? [])
    .map((sheet) => {
      const title = sheet.properties?.title?.trim();
      const sheetId = sheet.properties?.sheetId;
      if (!title || sheetId === undefined || sheet.properties?.hidden) {
        return null;
      }

      return {
        worksheetId: String(sheetId),
        worksheetName: title,
      } satisfies DriveWorksheet;
    })
    .filter((worksheet): worksheet is DriveWorksheet => Boolean(worksheet));
}

async function loadWorksheetRows(spreadsheetId: string, worksheets: DriveWorksheet[]): Promise<RawWorksheet[]> {
  if (worksheets.length === 0) {
    return [];
  }

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: worksheets.map((worksheet) => `${escapeWorksheetName(worksheet.worksheetName)}!${SHEET_VALUE_RANGE}`),
    majorDimension: "ROWS",
  });

  return worksheets.map((worksheet, index) => ({
    ...worksheet,
    rows: (response.data.valueRanges?.[index]?.values ?? []).map((row) => row.map((value) => `${value ?? ""}`)),
  }));
}

export async function readGoogleSpreadsheetWorkbook(input: {
  spreadsheetId: string;
  spreadsheetName: string;
  sourceGroup: DriveSpreadsheetRecord["sourceContext"]["sourceGroup"];
}): Promise<GoogleSheetsRawSpreadsheetImport> {
  if (DRIVE_PROVIDER_MODE === "MOCK") {
    return getMockGoogleSpreadsheetWorkbook({
      driveFileId: input.spreadsheetId,
      spreadsheetId: input.spreadsheetId,
      spreadsheetName: input.spreadsheetName,
      sourceContext: {
        sourceGroup: input.sourceGroup,
        owner: "Mock",
        region: "Mock",
        audience: "Mock",
        tags: [],
      },
    });
  }

  const profile = driveSmmPlanImportProfile;
  const worksheets = await listLiveSpreadsheetWorksheets(input.spreadsheetId);
  const rawWorksheets = await loadWorksheetRows(input.spreadsheetId, worksheets);

  return {
    spreadsheetId: input.spreadsheetId,
    spreadsheetName: input.spreadsheetName,
    availableWorksheets: worksheets,
    worksheets: rawWorksheets.map((worksheet) => {
      const headerSelection = selectHeaderRow(worksheet.rows, profile);
      return {
        worksheetId: worksheet.worksheetId,
        worksheetName: worksheet.worksheetName,
        rows: worksheet.rows,
        detectedHeaders: headerSelection?.headers ?? [],
        detectedHeaderRowNumber: headerSelection?.headerRowNumber ?? null,
      } satisfies GoogleSheetsRawWorksheetImport;
    }),
  };
}

export async function buildNormalizeRequestsForDriveSpreadsheet(input: {
  record: DriveSpreadsheetRecord;
  reimportStrategy: DriveReimportStrategy;
}) {
  const profile = driveSmmPlanImportProfile;
  const worksheets = await listLiveSpreadsheetWorksheets(input.record.spreadsheetId);
  const rawWorksheets = await loadWorksheetRows(input.record.spreadsheetId, worksheets);
  const selectedWorksheets = rawWorksheets
    .map((worksheet) => {
      const headerSelection = selectHeaderRow(worksheet.rows, profile);
      return headerSelection ? { worksheet, headerSelection } : null;
    })
    .filter(
      (
        worksheet,
      ): worksheet is {
        worksheet: RawWorksheet;
        headerSelection: HeaderSelection;
      } => Boolean(worksheet),
    );

  const availableWorksheets = worksheets.map((worksheet) => ({
    worksheetId: worksheet.worksheetId,
    worksheetName: worksheet.worksheetName,
  }));
  const contentProfile = inferContentProfile(
    input.record.sourceContext.sourceGroup,
    input.record.spreadsheetName,
  );

  const requests: NormalizeSheetRowRequest[] = [];

  for (const entry of selectedWorksheets) {
    const { worksheet, headerSelection } = entry;
    for (let rowIndex = headerSelection.headerRowNumber; rowIndex < worksheet.rows.length; rowIndex += 1) {
      const rowNumber = rowIndex + 1;
      const rowValues = normalizeRowValues(headerSelection.headers, worksheet.rows[rowIndex] ?? []);
      const rawHash = hashRowVersion(rowValues);

      requests.push({
        version: 1,
        mode: "COMMIT",
        orchestrator: "MANUAL",
        sheetProfileKey: profile.key,
        source: {
          spreadsheetId: input.record.spreadsheetId,
          spreadsheetName: input.record.spreadsheetName,
          worksheetId: worksheet.worksheetId,
          worksheetName: worksheet.worksheetName,
          rowId: `row-${rowNumber}`,
          rowNumber,
          rowVersion: rawHash,
          headerRowNumber: headerSelection.headerRowNumber,
          headers: headerSelection.headers,
          rowValues,
        },
        worksheetSelection: {
          availableWorksheets,
        },
        contentHints: {
          profile: contentProfile,
          contentType: inferContentType(rowValues, input.record.spreadsheetName),
          locale: "en",
          translationRequired: false,
        },
        workflow: {
          translationRequired: false,
          autoPostEnabled: false,
          preferredDesignProvider: "MANUAL",
          reimportStrategy: input.reimportStrategy,
          conflictConfidence: "NO_MEANINGFUL_MATCH",
        },
      });
    }
  }

  return {
    worksheets,
    validWorksheets: selectedWorksheets.map(({ worksheet }) => ({
      worksheetId: worksheet.worksheetId,
      worksheetName: worksheet.worksheetName,
    })),
    requests,
  };
}

function buildContentSignature(input: {
  sourceGroup: string;
  title: string;
  plannedDate?: string;
  copyEnglish: string;
}) {
  return [
    input.sourceGroup.trim().toLowerCase(),
    input.plannedDate?.trim().toLowerCase() ?? "",
    input.title.trim().toLowerCase(),
    input.copyEnglish.trim().toLowerCase(),
  ]
    .filter(Boolean)
    .join(" | ");
}

export async function readGoogleSpreadsheetImport(input: {
  spreadsheetId: string;
  spreadsheetName: string;
  sourceGroup: DriveSpreadsheetRecord["sourceContext"]["sourceGroup"];
  reimportStrategy?: DriveReimportStrategy;
}): Promise<GoogleSheetsSpreadsheetImport> {
  const requestBundle = await buildNormalizeRequestsForDriveSpreadsheet({
    record: {
      driveFileId: input.spreadsheetId,
      spreadsheetId: input.spreadsheetId,
      spreadsheetName: input.spreadsheetName,
      folderName: "",
      relativePath: input.spreadsheetName,
      description: "",
      lastUpdatedAt: new Date().toISOString(),
      sourceContext: {
        sourceGroup: input.sourceGroup,
        owner: "",
        region: "",
        audience: "",
        tags: [],
      },
      matchingSignals: [],
      sheetProfileKey: driveSmmPlanImportProfile.key,
      sheetProfileVersion: driveSmmPlanImportProfile.version,
      worksheets: [],
    },
    reimportStrategy: input.reimportStrategy ?? "UPDATE",
  });

  const rowsByWorksheet = new Map<string, GoogleSheetsWorksheetImport>();

  for (const request of requestBundle.requests) {
    const normalized = normalizeSheetRow(request).normalizedPayload;
    const headerMapping = normalized.normalization.headerMapping;
    const rowQualification = normalized.normalization.rowQualification;
    const titleDerivation = normalized.normalization.titleDerivation;
    const planningFields = normalized.planning;
    const sourceMetadata = normalized.sourceMetadata;
    const rowMap = buildOperationalRawRow({
      ...planningFields,
      publishedFlag: sourceMetadata.publishedFlag,
    });

    const parsedRow: GoogleSheetsParsedRow = {
      worksheetId: request.source.worksheetId,
      worksheetName: request.source.worksheetName,
      rowId: request.source.rowId,
      rowNumber: request.source.rowNumber ?? 0,
      rowVersion: request.source.rowVersion ?? "",
      rowKind: "DATA",
      headerRowNumber: request.source.headerRowNumber,
      headers: request.source.headers,
      rowValues: request.source.rowValues,
      rowMap,
      mappedFields: headerMapping.mappedFields as Record<string, unknown>,
      unmappedHeaders: headerMapping.unmappedHeaders,
      rowQualification,
      titleDerivation,
      planningFields,
      sourceMetadata,
      contentProfile: normalized.content.profile,
      operationalStatus: normalized.workflow.operationalStatus ?? "READY_FOR_DESIGN",
      blockReason: normalized.workflow.blockReason,
      translationRequired: normalized.workflow.translationRequired,
      autoPostEnabled: normalized.workflow.autoPostEnabled,
      preferredDesignProvider: normalized.workflow.preferredDesignProvider,
      contentSignature: buildContentSignature({
        sourceGroup: input.sourceGroup,
        title: titleDerivation.title,
        plannedDate: planningFields.plannedDate,
        copyEnglish: planningFields.copyEnglish,
      }),
    };

    const worksheetKey = `${parsedRow.worksheetId}:${parsedRow.worksheetName}`;
    const worksheet = rowsByWorksheet.get(worksheetKey) ?? {
      worksheetId: parsedRow.worksheetId,
      worksheetName: parsedRow.worksheetName,
      rows: [],
    };
    worksheet.rows.push(parsedRow);
    rowsByWorksheet.set(worksheetKey, worksheet);
  }

  return {
    spreadsheetId: input.spreadsheetId,
    spreadsheetName: input.spreadsheetName,
    availableWorksheets: requestBundle.worksheets,
    worksheets: Array.from(rowsByWorksheet.values()),
    validWorksheetCount: requestBundle.validWorksheets.length,
  };
}
