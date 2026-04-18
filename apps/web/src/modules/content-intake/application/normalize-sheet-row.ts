import { ZodError } from "zod";
import { logEvent } from "@/shared/logging/logger";
import { contentIngestionPayloadSchema } from "../domain/ingestion-contract";
import {
  driveSmmPlanImportProfile,
  deriveTitleFromPlanningFields,
  findMappedFieldHeaders,
  qualifySheetRow,
  selectWorksheetCandidate,
  zazmicBrazilPlanningProfile,
  type SheetProfile,
} from "../domain/sheet-profiles";
import { inferContentOperationalStatus } from "../domain/infer-content-status";
import {
  normalizeSheetRowRequestSchema,
  type NormalizeSheetRowRequest,
} from "../domain/normalize-sheet-request";

const sheetProfiles: Record<string, SheetProfile> = {
  [zazmicBrazilPlanningProfile.key]: zazmicBrazilPlanningProfile,
  [driveSmmPlanImportProfile.key]: driveSmmPlanImportProfile,
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

function normalizeComparableCell(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isRepeatedHeaderRow(headers: string[], rowValues: string[]) {
  const comparisons = headers.map((header, index) => ({
    header: normalizeComparableCell(header),
    value: normalizeComparableCell(rowValues[index] ?? ""),
  }));

  const nonEmptyValueCount = comparisons.filter((entry) => entry.value.length > 0).length;
  const repeatedHeaderMatches = comparisons.filter(
    (entry) => entry.value.length > 0 && entry.header.length > 0 && entry.value === entry.header,
  ).length;

  return repeatedHeaderMatches >= 2 && repeatedHeaderMatches >= Math.ceil(nonEmptyValueCount / 2);
}

function hasNonEmptyText(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function normalizeSheetRow(rawRequest: unknown) {
  const request = normalizeSheetRowRequestSchema.parse(rawRequest);
  logEvent("info", "[TRACE_IMPORT_QUEUE][NORMALIZE] start", {
    spreadsheetId: request.source.spreadsheetId,
    worksheetId: request.source.worksheetId,
    worksheetName: request.source.worksheetName,
    rowId: request.source.rowId,
    rowNumber: request.source.rowNumber,
    rowVersion: request.source.rowVersion,
    mode: request.mode,
    sheetProfileKey: request.sheetProfileKey,
  });
  const profile = getSheetProfile(request.sheetProfileKey);
  const worksheetSelectionResult = selectWorksheetCandidate(
    request.worksheetSelection.availableWorksheets,
    profile,
    request.worksheetSelection.targetMonth,
  );

  const { mappedFields, unmappedHeaders } = findMappedFieldHeaders(request.source.headers, profile);
  const rowMap = buildRowMap(request.source.headers, request.source.rowValues);

  const planningFields = {
    plannedDate: mappedFields.plannedDate ? optionalNonEmpty(rowMap[mappedFields.plannedDate.header]) : undefined,
    platformLabel: mappedFields.platformLabel ? optionalNonEmpty(rowMap[mappedFields.platformLabel.header]) : undefined,
    campaignLabel: mappedFields.campaignLabel ? optionalNonEmpty(rowMap[mappedFields.campaignLabel.header]) : undefined,
    copyEnglish: mappedFields.copyEnglish ? rowMap[mappedFields.copyEnglish.header] ?? "" : "",
    copyPortuguese: mappedFields.copyPortuguese ? optionalNonEmpty(rowMap[mappedFields.copyPortuguese.header]) : undefined,
    sourceAssetLink: mappedFields.sourceAssetLink ? optionalNonEmpty(rowMap[mappedFields.sourceAssetLink.header]) : undefined,
    contentDeadline: mappedFields.contentDeadline ? optionalNonEmpty(rowMap[mappedFields.contentDeadline.header]) : undefined,
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
  } = {
    disposition: qualifiedRow.disposition,
    confidence: qualifiedRow.confidence,
    reasons: [...qualifiedRow.reasons],
    signals: qualifiedRow.signals,
    isPublishedRow: qualifiedRow.isPublishedRow,
  };

  if (isRepeatedHeaderRow(request.source.headers, request.source.rowValues)) {
    rowQualification.disposition = "SKIPPED_NON_DATA";
    rowQualification.confidence = "HIGH";
    rowQualification.reasons = ["Row repeats worksheet headers and was treated as non-data."];
    rowQualification.signals = {
      hasDate: false,
      hasTitle: false,
      hasCopy: false,
      hasPlatform: false,
      hasLink: false,
      hasPublicationMarker: false,
    };
    rowQualification.isPublishedRow = false;
  }

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
  const operationalStatus = inferContentOperationalStatus({
    planning: {
      copyEnglish: planningFields.copyEnglish,
      contentDeadline: planningFields.contentDeadline,
    },
    sourceMetadata,
  });

  if (!titleDerivation) {
    rowQualification.disposition = "REJECTED_INVALID";
    rowQualification.reasons.push("Unable to derive a title from the configured field order.");
  }

  const hasTitle = hasNonEmptyText(planningFields.campaignLabel) || rowQualification.signals.hasTitle;
  const hasCopy = hasNonEmptyText(planningFields.copyEnglish);
  const hasSchedulingSignal =
    hasNonEmptyText(planningFields.plannedDate) ||
    hasNonEmptyText(planningFields.contentDeadline) ||
    hasNonEmptyText(planningFields.platformLabel) ||
    hasNonEmptyText(planningFields.sourceAssetLink);

  if (rowQualification.disposition === "QUALIFIED" && !hasTitle && !hasCopy) {
    rowQualification.disposition = "SKIPPED_NON_DATA";
    rowQualification.confidence = "HIGH";
    rowQualification.reasons = ["Row has no title/idea and no copy, so it was skipped."];
  }

  if (rowQualification.disposition === "QUALIFIED" && !hasSchedulingSignal) {
    rowQualification.disposition = "REJECTED_INVALID";
    rowQualification.confidence = "LOW";
    rowQualification.reasons.push(
      "Row needs at least one operational signal: planned date, deadline, channel/source.",
    );
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
    workflow: {
      translationRequired: request.workflow.translationRequired ?? request.contentHints.translationRequired,
      autoPostEnabled: request.workflow.autoPostEnabled,
      preferredDesignProvider: request.workflow.preferredDesignProvider,
      reimportStrategy: request.workflow.reimportStrategy,
      operationalStatus,
    },
    content: {
      canonicalKey: buildCanonicalKey(request),
      profile: request.contentHints.profile,
      contentType: request.contentHints.contentType,
      title: titleDerivation?.title ?? "Untitled import candidate",
      copy: planningFields.copyEnglish,
      locale: request.contentHints.locale,
      translationRequired: request.workflow.translationRequired ?? request.contentHints.translationRequired,
    },
  });

  logEvent("info", "[TRACE_IMPORT_QUEUE][NORMALIZE] result", {
    spreadsheetId: request.source.spreadsheetId,
    worksheetId: request.source.worksheetId,
    worksheetName: request.source.worksheetName,
    rowId: request.source.rowId,
    rowNumber: request.source.rowNumber,
    disposition: rowQualification.disposition,
    reasons: rowQualification.reasons,
    title: normalizedPayload.content.title,
    hasCopy: normalizedPayload.content.copy.trim().length > 0,
    operationalStatus,
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
