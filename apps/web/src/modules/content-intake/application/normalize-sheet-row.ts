import { ZodError } from "zod";
import { logEvent } from "@/shared/logging/logger";
import { contentIngestionPayloadSchema } from "../domain/ingestion-contract";
import {
  deriveTitleFromPlanningFields,
  findMappedFieldHeaders,
  qualifySheetRow,
  selectWorksheetCandidate,
  zazmicBrazilPlanningProfile,
  type SheetProfile,
} from "../domain/sheet-profiles";
import {
  normalizeSheetRowRequestSchema,
  type NormalizeSheetRowRequest,
} from "../domain/normalize-sheet-request";

const sheetProfiles: Record<string, SheetProfile> = {
  [zazmicBrazilPlanningProfile.key]: zazmicBrazilPlanningProfile,
};

function getSheetProfile(profileKey: string) {
  const profile = sheetProfiles[profileKey];

  if (!profile) {
    throw new Error(`Unsupported sheet profile: ${profileKey}`);
  }

  return profile;
}

function buildCanonicalKey(request: NormalizeSheetRowRequest) {
  if (request.contentHints.canonicalKey) {
    return request.contentHints.canonicalKey;
  }

  return [
    request.contentHints.profile.toLowerCase(),
    request.source.spreadsheetId,
    request.source.worksheetId,
    request.source.rowId,
  ].join(":");
}

function buildIdempotencyKey(request: NormalizeSheetRowRequest) {
  return [
    request.source.spreadsheetId,
    request.source.worksheetId,
    request.source.rowId,
    request.source.rowVersion ?? "no-version",
    request.mode.toLowerCase(),
  ].join(":");
}

function optionalNonEmpty(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildRowMap(headers: string[], rowValues: string[]) {
  return headers.reduce<Record<string, string>>((accumulator, header, index) => {
    accumulator[header] = rowValues[index] ?? "";
    return accumulator;
  }, {});
}

export function normalizeSheetRow(rawRequest: unknown) {
  const request = normalizeSheetRowRequestSchema.parse(rawRequest);
  const profile = getSheetProfile(request.sheetProfileKey);
  const worksheetSelectionResult = selectWorksheetCandidate(
    request.worksheetSelection.availableWorksheets,
    profile,
    request.worksheetSelection.targetMonth,
  );

  const { mappedFields, unmappedHeaders } = findMappedFieldHeaders(request.source.headers, profile);
  const rowMap = buildRowMap(request.source.headers, request.source.rowValues);

  const planningFields = {
    plannedDate: mappedFields.plannedDate ? rowMap[mappedFields.plannedDate.header] : undefined,
    platformLabel: mappedFields.platformLabel ? rowMap[mappedFields.platformLabel.header] : undefined,
    campaignLabel: mappedFields.campaignLabel ? rowMap[mappedFields.campaignLabel.header] : undefined,
    copyEnglish: mappedFields.copyEnglish ? rowMap[mappedFields.copyEnglish.header] ?? "" : "",
    copyPortuguese: mappedFields.copyPortuguese ? rowMap[mappedFields.copyPortuguese.header] : undefined,
    sourceAssetLink: mappedFields.sourceAssetLink ? rowMap[mappedFields.sourceAssetLink.header] : undefined,
    contentDeadline: mappedFields.contentDeadline ? rowMap[mappedFields.contentDeadline.header] : undefined,
  };

  const sourceMetadata = {
    publishedFlag: mappedFields.publishedFlag
      ? optionalNonEmpty(rowMap[mappedFields.publishedFlag.header])
      : undefined,
    publishedPostUrl: mappedFields.publishedPostUrl
      ? optionalNonEmpty(rowMap[mappedFields.publishedPostUrl.header])
      : undefined,
    outreachAccount: mappedFields.outreachAccount
      ? optionalNonEmpty(rowMap[mappedFields.outreachAccount.header])
      : undefined,
    outreachCopy: mappedFields.outreachCopy
      ? optionalNonEmpty(rowMap[mappedFields.outreachCopy.header])
      : undefined,
    extra: unmappedHeaders.reduce<Record<string, string>>((accumulator, header) => {
      const value = rowMap[header];
      if (value && value.trim().length > 0) {
        accumulator[header] = value;
      }

      return accumulator;
    }, {}),
  };

  const qualifiedRow = qualifySheetRow(request.source.rowValues, planningFields, profile);
  const rowQualification: {
    disposition: "QUALIFIED" | "SKIPPED_NON_DATA" | "REJECTED_INVALID";
    reasons: string[];
  } = {
    disposition: qualifiedRow.disposition,
    reasons: [...qualifiedRow.reasons],
  };

  if (
    worksheetSelectionResult.worksheetId &&
    worksheetSelectionResult.worksheetId !== request.source.worksheetId
  ) {
    rowQualification.disposition = "REJECTED_INVALID";
    rowQualification.reasons.push(
      `Worksheet ${request.source.worksheetName} did not match the selected worksheet ${worksheetSelectionResult.worksheetName}.`,
    );
  }

  const titleDerivation = deriveTitleFromPlanningFields(planningFields, profile);

  if (!titleDerivation) {
    rowQualification.disposition = "REJECTED_INVALID";
    rowQualification.reasons.push("Unable to derive a title from the configured field order.");
  }

  const normalizedPayload = contentIngestionPayloadSchema.parse({
    version: 2,
    mode: request.mode,
    idempotencyKey: buildIdempotencyKey(request),
    orchestrator: request.orchestrator,
    triggeredAt: new Date().toISOString(),
    source: {
      system: "GOOGLE_SHEETS",
      spreadsheetId: request.source.spreadsheetId,
      spreadsheetName: request.source.spreadsheetName,
      worksheetId: request.source.worksheetId,
      worksheetName: request.source.worksheetName,
      rowId: request.source.rowId,
      rowNumber: request.source.rowNumber,
      rowVersion: request.source.rowVersion,
      rawRow: rowMap,
    },
    normalization: {
      sheetProfileKey: profile.key,
      sheetProfileVersion: profile.version,
      worksheetSelection: {
        strategy: worksheetSelectionResult.strategy,
        targetMonth: request.worksheetSelection.targetMonth,
        availableWorksheets: request.worksheetSelection.availableWorksheets,
      },
      headerMapping: {
        headerRowNumber: request.source.headerRowNumber,
        mappedFields,
        unmappedHeaders,
      },
      rowQualification,
      titleDerivation: titleDerivation ?? {
        strategy: "HEURISTIC_LAST_RESORT",
        title: "Untitled import candidate",
      },
    },
    planning: planningFields,
    sourceMetadata,
    pushbackCandidates: {},
    content: {
      canonicalKey: buildCanonicalKey(request),
      profile: request.contentHints.profile,
      contentType: request.contentHints.contentType,
      title: titleDerivation?.title ?? "Untitled import candidate",
      copy: planningFields.copyEnglish,
      locale: request.contentHints.locale,
      translationRequired: request.contentHints.translationRequired,
    },
  });

  return {
    profile,
    worksheetSelectionResult,
    normalizedPayload,
  };
}

export function safeNormalizeSheetRow(rawRequest: unknown) {
  try {
    return normalizeSheetRow(rawRequest);
  } catch (error) {
    if (error instanceof ZodError) {
      logEvent("warn", "Rejected invalid raw sheet normalization request", {
        issues: error.issues,
      });
    }

    throw error;
  }
}
