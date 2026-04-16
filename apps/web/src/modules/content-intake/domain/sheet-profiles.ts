import { z } from "zod";

export const worksheetSelectionStrategySchema = z.enum([
  "EXPLICIT_WORKSHEET_ID",
  "EXACT_WORKSHEET_NAME",
  "MONTHLY_TAB_PATTERN",
]);

export const titleDerivationStrategySchema = z.enum([
  "EXPLICIT_MAPPED_FIELD",
  "PROFILE_FALLBACK_FIELD",
  "HEURISTIC_LAST_RESORT",
]);

export const contentProfileSchema = z.enum(["YANN", "YURI", "ZAZMIC_JOBS"]);

export const rowDispositionSchema = z.enum([
  "QUALIFIED",
  "SKIPPED_NON_DATA",
  "REJECTED_INVALID",
]);

export const canonicalPlanningFieldSchema = z.enum([
  "plannedDate",
  "platformLabel",
  "campaignLabel",
  "copyEnglish",
  "copyPortuguese",
  "sourceAssetLink",
  "contentDeadline",
  "publishedFlag",
  "publishedPostUrl",
  "outreachAccount",
  "outreachCopy",
]);

export const titleFallbackFieldSchema = z.enum([
  "campaignLabel",
  "copyEnglish",
  "copyPortuguese",
]);

export const sheetFieldMappingSchema = z.object({
  field: canonicalPlanningFieldSchema,
  headerAliases: z.array(z.string()).min(1),
  required: z.boolean().default(false),
});

export const sheetProfileSchema = z.object({
  key: z.string().min(1),
  version: z.number().int().positive(),
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  worksheetSelection: z.object({
    allowedStrategies: z.array(worksheetSelectionStrategySchema).min(1),
    exactWorksheetNames: z.array(z.string()).default([]),
    monthlyWorksheetPattern: z.string().optional(),
    monthlyWorksheetExamples: z.array(z.string()).default([]),
  }),
  headerDiscovery: z.object({
    headerRowCandidates: z.array(z.number().int().positive()).min(1),
    requiredHeaderAliases: z.array(z.string()).min(1),
  }),
  dataRowRules: z.object({
    minimumMappedFields: z.array(canonicalPlanningFieldSchema).min(1),
    skipRowWhenAnyCellMatches: z.array(z.string()).default([]),
  }),
  titleDerivation: z.object({
    explicitMappedField: titleFallbackFieldSchema.optional(),
    fallbackField: titleFallbackFieldSchema.optional(),
    allowHeuristicFallback: z.boolean().default(true),
  }),
  fieldMappings: z.array(sheetFieldMappingSchema).min(1),
  pushbackCandidates: z.array(
    z.enum(["appItemUrl", "workflowStatus", "designAssetUrl", "publishedAt", "publishedPostUrl"]),
  ),
});

export type SheetProfile = z.infer<typeof sheetProfileSchema>;

export type WorksheetCandidate = {
  worksheetId: string;
  worksheetName: string;
};

const monthTokenPattern =
  /\b(?:jan|january|fev|feb|february|mar|march|abr|apr|april|mai|may|jun|june|jul|july|ago|aug|august|set|sep|september|out|oct|october|nov|november|dez|dec|december)\b/i;

const monthTokenToNumber: Record<string, string> = {
  jan: "01",
  january: "01",
  fev: "02",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  abr: "04",
  apr: "04",
  april: "04",
  mai: "05",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  ago: "08",
  aug: "08",
  august: "08",
  set: "09",
  sep: "09",
  september: "09",
  out: "10",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dez: "12",
  dec: "12",
  december: "12",
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractMonthTokens(value: string) {
  const normalized = value.trim().toLowerCase();
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const monthMatch = normalized.match(monthTokenPattern);

  return {
    year: yearMatch?.[1] ?? null,
    monthToken: monthMatch?.[0] ?? null,
  };
}

export function findMappedFieldHeaders(headers: string[], profile: SheetProfile) {
  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    normalized: normalizeHeader(header),
  }));

  const mappedFields = profile.fieldMappings.reduce<Record<string, { header: string; columnIndex: number }>>(
    (accumulator, mapping) => {
      const aliasSet = new Set(mapping.headerAliases.map(normalizeHeader));
      const match = normalizedHeaders.find((header) => aliasSet.has(header.normalized));

      if (match) {
        accumulator[mapping.field] = {
          header: match.raw,
          columnIndex: normalizedHeaders.findIndex((header) => header.raw === match.raw),
        };
      }

      return accumulator;
    },
    {},
  );

  const unmappedHeaders = normalizedHeaders
    .filter((header) => !Object.values(mappedFields).some((mapped) => mapped.header === header.raw))
    .map((header) => header.raw);

  return {
    mappedFields,
    unmappedHeaders,
  };
}

export function qualifySheetRow(
  rowValues: string[],
  mappedPlanningFields: Partial<Record<z.infer<typeof canonicalPlanningFieldSchema>, string | undefined>>,
  profile: SheetProfile,
) {
  const normalizedRowValues = rowValues.map((value) => value.trim());

  if (normalizedRowValues.every((value) => value.length === 0)) {
    return {
      disposition: "SKIPPED_NON_DATA" as const,
      reasons: ["Row is empty."],
    };
  }

  const matchedSkipPattern = profile.dataRowRules.skipRowWhenAnyCellMatches.find((pattern) =>
    normalizedRowValues.some((value) => value.toLowerCase().includes(pattern.toLowerCase())),
  );

  if (matchedSkipPattern) {
    return {
      disposition: "SKIPPED_NON_DATA" as const,
      reasons: [`Row matched non-data pattern: ${matchedSkipPattern}`],
    };
  }

  const missingRequiredFields = profile.dataRowRules.minimumMappedFields.filter((field) => {
    const value = mappedPlanningFields[field];
    return !value || value.trim().length === 0;
  });

  if (missingRequiredFields.length > 0) {
    return {
      disposition: "REJECTED_INVALID" as const,
      reasons: [`Missing required planning fields: ${missingRequiredFields.join(", ")}`],
    };
  }

  return {
    disposition: "QUALIFIED" as const,
    reasons: [],
  };
}

export function deriveTitleFromPlanningFields(
  planningFields: Partial<Record<z.infer<typeof canonicalPlanningFieldSchema>, string | undefined>>,
  profile: SheetProfile,
) {
  const explicitField = profile.titleDerivation.explicitMappedField;
  const fallbackField = profile.titleDerivation.fallbackField;

  const explicitValue = explicitField ? planningFields[explicitField] : undefined;
  if (explicitValue && explicitValue.trim().length > 0) {
    return {
      title: explicitValue.trim(),
      strategy: "EXPLICIT_MAPPED_FIELD" as const,
      sourceField: explicitField,
    };
  }

  const fallbackValue = fallbackField ? planningFields[fallbackField] : undefined;
  if (fallbackValue && fallbackValue.trim().length > 0) {
    return {
      title: fallbackValue.trim(),
      strategy: "PROFILE_FALLBACK_FIELD" as const,
      sourceField: fallbackField,
    };
  }

  if (profile.titleDerivation.allowHeuristicFallback) {
    const heuristicCandidate = [planningFields.copyEnglish, planningFields.copyPortuguese]
      .find((value) => value && value.trim().length > 0)
      ?.trim();

    if (heuristicCandidate) {
      return {
        title: heuristicCandidate.slice(0, 96),
        strategy: "HEURISTIC_LAST_RESORT" as const,
        sourceField: heuristicCandidate === planningFields.copyEnglish ? "copyEnglish" : "copyPortuguese",
      };
    }
  }

  return null;
}

export function selectWorksheetCandidate(
  candidates: WorksheetCandidate[],
  profile: SheetProfile,
  targetMonth?: string,
) {
  const exactNameMatch = candidates.find((candidate) =>
    profile.worksheetSelection.exactWorksheetNames.some(
      (name) => name.toLowerCase() === candidate.worksheetName.trim().toLowerCase(),
    ),
  );

  if (exactNameMatch) {
    return {
      worksheetId: exactNameMatch.worksheetId,
      worksheetName: exactNameMatch.worksheetName,
      strategy: "EXACT_WORKSHEET_NAME" as const,
      reasons: [`Matched exact worksheet name: ${exactNameMatch.worksheetName}`],
    };
  }

  if (targetMonth && profile.worksheetSelection.monthlyWorksheetPattern) {
    const [targetYear, targetMonthNumber] = targetMonth.split("-");
    const monthlyPattern = profile.worksheetSelection.monthlyWorksheetPattern;
    const matchingCandidates = candidates.filter((candidate) => {
      const tokens = extractMonthTokens(candidate.worksheetName);

      if (!tokens.year || !tokens.monthToken) {
        return false;
      }

      const normalizedMonthNumber = monthTokenToNumber[tokens.monthToken.toLowerCase()];

      return (
        tokens.year === targetYear &&
        normalizedMonthNumber === targetMonthNumber &&
        candidate.worksheetName.match(new RegExp(monthlyPattern, "i"))
      );
    });

    if (matchingCandidates.length === 1) {
      return {
        worksheetId: matchingCandidates[0].worksheetId,
        worksheetName: matchingCandidates[0].worksheetName,
        strategy: "MONTHLY_TAB_PATTERN" as const,
        reasons: [
          `Matched monthly worksheet for ${targetMonth} using pattern ${monthlyPattern}.`,
        ],
      };
    }

    if (matchingCandidates.length > 1) {
      return {
        worksheetId: null,
        worksheetName: null,
        strategy: "MONTHLY_TAB_PATTERN" as const,
        reasons: [`Multiple monthly worksheet candidates matched ${targetMonth}.`],
      };
    }

    return {
      worksheetId: null,
      worksheetName: null,
      strategy: "MONTHLY_TAB_PATTERN" as const,
      reasons: [`No monthly worksheet candidate matched ${targetMonth}.`],
    };
  }

  return {
    worksheetId: null,
    worksheetName: null,
    strategy: "EXACT_WORKSHEET_NAME" as const,
    reasons: ["No worksheet candidate matched the configured sheet profile."],
  };
}

export const zazmicBrazilPlanningProfile = sheetProfileSchema.parse({
  key: "zazmic-brazil-monthly-linkedin",
  version: 1,
  spreadsheetId: "zazmic-brazil-smm-plan",
  spreadsheetName: "SMM Plan | Zazmic Brazil",
  worksheetSelection: {
    allowedStrategies: ["EXACT_WORKSHEET_NAME", "MONTHLY_TAB_PATTERN"],
    exactWorksheetNames: ["LinkedIn Plan"],
    monthlyWorksheetPattern: "(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*(20\\d{2})",
    monthlyWorksheetExamples: ["Aug 2026", "Ago 2026", "August 2026"],
  },
  headerDiscovery: {
    headerRowCandidates: [11, 12],
    requiredHeaderAliases: ["Date", "Linkedin", "Portuguese version"],
  },
  dataRowRules: {
    minimumMappedFields: ["plannedDate", "copyEnglish"],
    skipRowWhenAnyCellMatches: ["week 1", "week 2", "week 3", "week 4", "hashtags", "qr code"],
  },
  titleDerivation: {
    explicitMappedField: "campaignLabel",
    fallbackField: "copyEnglish",
    allowHeuristicFallback: true,
  },
  fieldMappings: [
    { field: "plannedDate", headerAliases: ["Date"], required: true },
    { field: "platformLabel", headerAliases: ["Platform", "Channel"] },
    { field: "campaignLabel", headerAliases: ["Campaign", "Post title", "Theme"] },
    { field: "copyEnglish", headerAliases: ["Linkedin", "LinkedIn"], required: true },
    { field: "copyPortuguese", headerAliases: ["Portuguese version"] },
    { field: "sourceAssetLink", headerAliases: ["Link IMG", "Image link", "Link image"] },
    { field: "contentDeadline", headerAliases: ["Content Deadline", "Deadline"] },
    { field: "publishedFlag", headerAliases: ["Published"] },
    { field: "publishedPostUrl", headerAliases: ["Link to the post"] },
    { field: "outreachAccount", headerAliases: ["LI account for outreach"] },
    { field: "outreachCopy", headerAliases: ["Li outreach copy"] },
  ],
  pushbackCandidates: ["appItemUrl", "workflowStatus", "designAssetUrl", "publishedAt", "publishedPostUrl"],
});
