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

export const contentProfileSchema = z.enum(["YANN", "YURI", "SHAWN", "SOPHIAN_YACINE", "ZAZMIC_PAGE"]);

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
    qualifyingAnyOfMappedFields: z.array(canonicalPlanningFieldSchema).default([]),
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

function normalizeCellText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function looksLikeDateCell(value: string) {
  const normalized = normalizeCellText(value);
  if (!normalized) {
    return false;
  }

  return (
    /^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(normalized) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|fev|abr|mai|ago|set|out|dez)\b/i.test(
      normalized,
    )
  );
}

function looksLikeUrlCell(value: string) {
  return /https?:\/\/|www\./i.test(value);
}

function looksLikePublicationMarker(value: string) {
  return /\b(?:yes|published|publish(ed)?|done|complete|completed|live)\b/i.test(value);
}

function looksLikeCopyCell(value: string) {
  const normalized = normalizeCellText(value);
  return normalized.length >= 40 && /[.!?]/.test(normalized);
}

function looksLikeTitleCell(value: string) {
  const normalized = normalizeCellText(value);
  return normalized.length >= 12 && normalized.length <= 120 && /[A-Za-z]/.test(normalized);
}

function scoreCellSignals(
  rowValues: string[],
  mappedPlanningFields: Partial<Record<z.infer<typeof canonicalPlanningFieldSchema>, string | undefined>>,
) {
  const normalizedRowValues = rowValues.map(normalizeCellText);
  const hasDate = Boolean(mappedPlanningFields.plannedDate) || normalizedRowValues.some(looksLikeDateCell);
  const hasPlatform =
    Boolean(mappedPlanningFields.platformLabel) ||
    normalizedRowValues.some((value) => /\b(linkedin|instagram|substack|x|threads)\b/i.test(value));
  const hasTitle =
    Boolean(mappedPlanningFields.campaignLabel) ||
    normalizedRowValues.some(looksLikeTitleCell);
  const hasCopy = Boolean(mappedPlanningFields.copyEnglish) || normalizedRowValues.some(looksLikeCopyCell);
  const hasLink =
    Boolean(mappedPlanningFields.sourceAssetLink) ||
    normalizedRowValues.some(looksLikeUrlCell);
  const hasPublicationMarker =
    Boolean(mappedPlanningFields.publishedFlag) ||
    Boolean(mappedPlanningFields.publishedPostUrl) ||
    normalizedRowValues.some(looksLikePublicationMarker);

  return {
    hasDate,
    hasTitle,
    hasCopy,
    hasPlatform,
    hasLink,
    hasPublicationMarker,
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
      const match = normalizedHeaders.find((header) =>
        header.normalized.length > 0 &&
        Array.from(aliasSet).some(
          (alias) =>
            header.normalized === alias ||
            header.normalized.includes(alias) ||
            (header.normalized.length > 2 && alias.includes(header.normalized)),
        ),
      );

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
      confidence: "LOW" as const,
      reasons: ["Row is empty."],
      signals: {
        hasDate: false,
        hasTitle: false,
        hasCopy: false,
        hasPlatform: false,
        hasLink: false,
        hasPublicationMarker: false,
      },
      isPublishedRow: false,
    };
  }

  const matchedSkipPattern = profile.dataRowRules.skipRowWhenAnyCellMatches.find((pattern) =>
    normalizedRowValues.some((value) => value.toLowerCase().includes(pattern.toLowerCase())),
  );

  if (matchedSkipPattern) {
    return {
      disposition: "SKIPPED_NON_DATA" as const,
      confidence: "LOW" as const,
      reasons: [`Row matched non-data pattern: ${matchedSkipPattern}`],
      signals: {
        hasDate: false,
        hasTitle: false,
        hasCopy: false,
        hasPlatform: false,
        hasLink: false,
        hasPublicationMarker: false,
      },
      isPublishedRow: false,
    };
  }

  const signals = scoreCellSignals(rowValues, mappedPlanningFields);
  const signalScore = Object.values(signals).filter(Boolean).length;
  const qualifyingFieldValues = profile.dataRowRules.qualifyingAnyOfMappedFields.filter((field) => {
    const value = mappedPlanningFields[field];
    return Boolean(value && value.trim().length > 0);
  });
  const missingRequiredFields = profile.dataRowRules.minimumMappedFields.filter((field) => {
    const value = mappedPlanningFields[field];
    return !value || value.trim().length === 0;
  });

  const isPublishedRow = signals.hasPublicationMarker;
  const hasOperationalSignal =
    qualifyingFieldValues.length > 0 ||
    signals.hasDate ||
    signals.hasTitle ||
    signals.hasPublicationMarker ||
    Boolean(missingRequiredFields.length === 0 && signalScore >= 2);

  if (!hasOperationalSignal) {
    return {
      disposition: "REJECTED_INVALID" as const,
      confidence: "LOW" as const,
      reasons: [
        missingRequiredFields.length > 0
          ? `Missing required planning fields: ${missingRequiredFields.join(", ")}`
          : "Row does not contain a qualifying operational signal.",
      ],
      signals,
      isPublishedRow,
    };
  }

  return {
    disposition: "QUALIFIED" as const,
    confidence: signalScore >= 5 ? ("HIGH" as const) : signalScore >= 3 ? ("MEDIUM" as const) : ("LOW" as const),
    reasons: isPublishedRow ? ["Row is already marked as published in the source sheet."] : [],
    signals,
    isPublishedRow,
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

    if (planningFields.plannedDate && planningFields.plannedDate.trim().length > 0) {
      return {
        title: `Planned item - ${planningFields.plannedDate.trim()}`,
        strategy: "HEURISTIC_LAST_RESORT" as const,
        sourceField: "plannedDate",
      };
    }

    if (planningFields.contentDeadline && planningFields.contentDeadline.trim().length > 0) {
      return {
        title: `Deadline item - ${planningFields.contentDeadline.trim()}`,
        strategy: "HEURISTIC_LAST_RESORT" as const,
        sourceField: "contentDeadline",
      };
    }

    return {
      title: "Published item",
      strategy: "HEURISTIC_LAST_RESORT" as const,
      sourceField: "campaignLabel",
    };
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
    qualifyingAnyOfMappedFields: ["plannedDate", "campaignLabel", "contentDeadline", "publishedFlag", "publishedPostUrl"],
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

export const yannKronbergPlanningProfile = sheetProfileSchema.parse({
  key: "yann-smm-plan",
  version: 1,
  spreadsheetId: "1jjYpO7XxCBY2Jfe7hnqanS2H2EJDbbzs-P_BmkefLM4",
  spreadsheetName: "SMM Plan | Yann Kronberg",
  worksheetSelection: {
    allowedStrategies: ["MONTHLY_TAB_PATTERN", "EXACT_WORKSHEET_NAME"],
    exactWorksheetNames: [],
    monthlyWorksheetPattern: "LinkedIn \\+ Substack\\s*\\([a-zA-Z]+\\s*20\\d{2}\\)",
    monthlyWorksheetExamples: ["LinkedIn + Substack(April 2026)"],
  },
  headerDiscovery: {
    headerRowCandidates: [9, 10],
    requiredHeaderAliases: ["Date", "Platform", "Title", "LinkedIn Copy"],
  },
  dataRowRules: {
    minimumMappedFields: ["plannedDate", "copyEnglish"],
    qualifyingAnyOfMappedFields: ["plannedDate", "campaignLabel", "contentDeadline", "publishedFlag", "publishedPostUrl"],
    skipRowWhenAnyCellMatches: ["week 1", "week 2", "week 3", "week 4", "week 5"],
  },
  titleDerivation: {
    explicitMappedField: undefined,
    fallbackField: "copyEnglish",
    allowHeuristicFallback: true,
  },
  fieldMappings: [
    { field: "plannedDate", headerAliases: ["Date"], required: true },
    { field: "platformLabel", headerAliases: ["Platform", "Platform label"] },
    { field: "campaignLabel", headerAliases: ["Title", "Post title"] },
    { field: "copyEnglish", headerAliases: ["LinkedIn Copy", "LinkedIn - up to 3000 characters"], required: true },
    { field: "sourceAssetLink", headerAliases: ["Substack", "Link to the doc"] },
    { field: "publishedFlag", headerAliases: ["Published"] },
    { field: "contentDeadline", headerAliases: ["Content Deadline"] },
    { field: "publishedPostUrl", headerAliases: ["Link to the comments"] },
  ],
  pushbackCandidates: [],
});

export const driveSmmPlanImportProfile = sheetProfileSchema.parse({
  key: "drive-smm-plan-import",
  version: 1,
  spreadsheetId: "google-drive-smm-plan",
  spreadsheetName: "SMM Plan import",
  worksheetSelection: {
    allowedStrategies: ["MONTHLY_TAB_PATTERN", "EXACT_WORKSHEET_NAME"],
    exactWorksheetNames: [],
    monthlyWorksheetPattern:
      "(jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec).*(20\\d{2})",
    monthlyWorksheetExamples: ["Apr 2026", "Ago 2026", "LinkedIn + Substack (April 2026)"],
  },
  headerDiscovery: {
    headerRowCandidates: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    requiredHeaderAliases: ["Date", "LinkedIn", "LinkedIn Copy"],
  },
  dataRowRules: {
    minimumMappedFields: ["plannedDate", "copyEnglish"],
    qualifyingAnyOfMappedFields: ["plannedDate", "campaignLabel", "contentDeadline", "publishedFlag", "publishedPostUrl"],
    skipRowWhenAnyCellMatches: [
      "week 1",
      "week 2",
      "week 3",
      "week 4",
      "week 5",
      "hashtags",
      "links",
      "link block",
      "helper",
      "notes",
      "qr code",
    ],
  },
  titleDerivation: {
    explicitMappedField: "campaignLabel",
    fallbackField: "copyEnglish",
    allowHeuristicFallback: true,
  },
  fieldMappings: [
    { field: "plannedDate", headerAliases: ["Date", "Planned date"], required: true },
    { field: "platformLabel", headerAliases: ["Platform", "Channel", "Account", "Person"] },
    { field: "campaignLabel", headerAliases: ["Campaign", "Title", "Post title", "Topic", "Idea", "Theme"] },
    {
      field: "copyEnglish",
      headerAliases: [
        "Linkedin",
        "LinkedIn",
        "LinkedIn Copy",
        "LinkedIn - up to 3000 characters",
        "Copy",
        "Copy (EN)",
        "English copy",
      ],
      required: true,
    },
    {
      field: "copyPortuguese",
      headerAliases: ["Portuguese version", "Portuguese", "PT version", "PT-BR", "Portuguese copy"],
    },
    {
      field: "sourceAssetLink",
      headerAliases: ["Link IMG", "Image link", "Link image", "Link to the doc", "Substack", "Asset link"],
    },
    { field: "contentDeadline", headerAliases: ["Content Deadline", "Deadline", "Due date"] },
    { field: "publishedFlag", headerAliases: ["Published", "Status", "Posted"] },
    { field: "publishedPostUrl", headerAliases: ["Link to the post", "Link to the comments", "Post link"] },
    { field: "outreachAccount", headerAliases: ["LI account for outreach", "Outreach account"] },
    { field: "outreachCopy", headerAliases: ["Li outreach copy", "Outreach copy"] },
  ],
  pushbackCandidates: ["appItemUrl", "workflowStatus", "designAssetUrl", "publishedAt", "publishedPostUrl"],
});
