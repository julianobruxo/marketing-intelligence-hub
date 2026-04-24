import { ZodError } from "zod";
import { logEvent } from "@/shared/logging/logger";
import { contentIngestionPayloadSchema } from "../domain/ingestion-contract";
import {
  driveSmmPlanImportProfile,
  deriveTitleFromPlanningFields,
  findMappedFieldHeaders,
  qualifySheetRow,
  selectWorksheetCandidate,
  yannKronbergPlanningProfile,
  zazmicBrazilPlanningProfile,
  type SheetProfile,
} from "../domain/sheet-profiles";
import {
  hasImageLink,
  hasRealCopy,
  inferContentRouting,
} from "../domain/infer-content-status";
import {
  normalizeSheetRowRequestSchema,
  type NormalizeSheetRowRequest,
} from "../domain/normalize-sheet-request";

const sheetProfiles: Record<string, SheetProfile> = {
  [zazmicBrazilPlanningProfile.key]: zazmicBrazilPlanningProfile,
  [yannKronbergPlanningProfile.key]: yannKronbergPlanningProfile,
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
    rawRow.Published = input.publishedFlag;
  }

  return rawRow;
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
    campaignLabel: mappedFields.campaignLabel ? optionalNonEmpty(rowMap[mappedFields.campaignLabel.header]) : undefined,
    copyEnglish: mappedFields.copyEnglish ? rowMap[mappedFields.copyEnglish.header] ?? "" : "",
    sourceAssetLink: mappedFields.sourceAssetLink ? optionalNonEmpty(rowMap[mappedFields.sourceAssetLink.header]) : undefined,
    contentDeadline: mappedFields.contentDeadline ? optionalNonEmpty(rowMap[mappedFields.contentDeadline.header]) : undefined,
  };

  const sourceMetadata = {
    publishedFlag: mappedFields.publishedFlag
      ? optionalNonEmpty(rowMap[mappedFields.publishedFlag.header])
      : undefined,
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

  // Rows rejected solely because a required planning field (typically copyEnglish) is
  // missing should not disappear silently. If the row has at least a title/brief and a
  // scheduling signal it is a legitimate item with incomplete data — promote it to
  // QUALIFIED so the routing layer assigns BLOCKED: MISSING_COPY, keeping it visible
  // in the queue until the team completes the copy.

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
  const routingTitle = titleDerivation?.title;
  const routing = inferContentRouting({
    planning: {
      title: routingTitle,
      copyEnglish: planningFields.copyEnglish,
      contentDeadline: planningFields.contentDeadline,
      sourceAssetLink: planningFields.sourceAssetLink,
    },
    sourceMetadata,
  });
  const operationalStatus = routing.operationalStatus;

  if (!titleDerivation) {
    rowQualification.disposition = "REJECTED_INVALID";
    rowQualification.reasons.push("Unable to derive a title from the configured field order.");
  }

  const hasTitle = hasNonEmptyText(planningFields.campaignLabel) || Boolean(routingTitle);
  const hasCopy = hasRealCopy(planningFields.copyEnglish);
  const hasPublishedSignal = hasNonEmptyText(sourceMetadata.publishedFlag);
  const hasOperationalIdentity =
    hasNonEmptyText(planningFields.campaignLabel) ||
    hasImageLink(planningFields.sourceAssetLink) ||
    hasPublishedSignal;
  const hasSchedulingSignal =
    hasNonEmptyText(planningFields.plannedDate) ||
    hasNonEmptyText(planningFields.contentDeadline) ||
    hasNonEmptyText(planningFields.sourceAssetLink) ||
    hasPublishedSignal;

  if (
    rowQualification.disposition === "REJECTED_INVALID" &&
    rowQualification.reasons.some((reason) => reason.includes("Missing required planning fields")) &&
    hasOperationalIdentity &&
    hasSchedulingSignal
  ) {
    rowQualification.disposition = "QUALIFIED";
    rowQualification.confidence = "LOW";
    rowQualification.reasons = [
      "Promoted from rejected: has operational spreadsheet signals but is missing LinkedIn copy. Will route as BLOCKED.",
    ];
  }

  if (rowQualification.disposition === "QUALIFIED" && !hasTitle && !hasCopy && !hasPublishedSignal) {
    rowQualification.disposition = "SKIPPED_NON_DATA";
    rowQualification.confidence = "HIGH";
    rowQualification.reasons = ["Row has no operational title, published signal, or real LinkedIn copy, so it was skipped."];
  }

  if (rowQualification.disposition === "QUALIFIED" && routing.blockReason) {
    rowQualification.reasons.push(`Blocked: ${routing.blockReason}.`);
  }

  rowQualification.signals.hasTitle = Boolean(routingTitle);
  rowQualification.signals.hasCopy = hasCopy;
  rowQualification.signals.hasLink = hasImageLink(planningFields.sourceAssetLink);
  rowQualification.isPublishedRow = operationalStatus === "POSTED";

  if (rowQualification.disposition === "QUALIFIED" && !hasSchedulingSignal) {
    rowQualification.disposition = "REJECTED_INVALID";
    rowQualification.confidence = "LOW";
    rowQualification.reasons.push(
      "Row needs at least one operational signal: date, content deadline, image link, or published marker.",
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
      rawRow: buildOperationalRawRow({
        ...planningFields,
        publishedFlag: sourceMetadata.publishedFlag,
      }),
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
      blockReason: routing.blockReason,
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
