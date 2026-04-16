import { z } from "zod";
import {
  contentProfileSchema,
  rowDispositionSchema,
  titleDerivationStrategySchema,
  worksheetSelectionStrategySchema,
} from "./sheet-profiles";

export const contentTypeSchema = z.enum(["STATIC_POST", "CAROUSEL"]);
export const orchestratorTypeSchema = z.enum(["ZAPIER", "N8N", "MANUAL"]);
export const importModeSchema = z.enum(["PREVIEW", "COMMIT"]);

const worksheetCandidateSchema = z.object({
  worksheetId: z.string().min(1),
  worksheetName: z.string().min(1),
});

const worksheetSelectionSchema = z.object({
  strategy: worksheetSelectionStrategySchema,
  targetMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  availableWorksheets: z.array(worksheetCandidateSchema).default([]),
});

const normalizedPlanningFieldsSchema = z.object({
  plannedDate: z.string().min(1).optional(),
  platformLabel: z.string().min(1).optional(),
  campaignLabel: z.string().min(1).optional(),
  copyEnglish: z.string().min(1),
  copyPortuguese: z.string().min(1).optional(),
  sourceAssetLink: z.string().min(1).optional(),
  contentDeadline: z.string().min(1).optional(),
});

const sourceMetadataSchema = z.object({
  publishedFlag: z.union([z.string(), z.boolean()]).optional(),
  publishedPostUrl: z.string().min(1).optional(),
  outreachAccount: z.string().min(1).optional(),
  outreachCopy: z.string().min(1).optional(),
  extra: z.record(z.string(), z.unknown()).default({}),
});

const pushbackCandidatesSchema = z.object({
  appItemUrl: z.string().min(1).optional(),
  workflowStatus: z.string().min(1).optional(),
  designAssetUrl: z.string().min(1).optional(),
  publishedAt: z.string().min(1).optional(),
  publishedPostUrl: z.string().min(1).optional(),
});

export const contentIngestionPayloadSchema = z.object({
  version: z.literal(2),
  mode: importModeSchema.default("COMMIT"),
  idempotencyKey: z.string().min(8),
  orchestrator: orchestratorTypeSchema,
  triggeredAt: z.iso.datetime(),
  source: z.object({
    system: z.literal("GOOGLE_SHEETS"),
    spreadsheetId: z.string().min(1),
    spreadsheetName: z.string().min(1).optional(),
    worksheetId: z.string().min(1),
    worksheetName: z.string().min(1),
    rowId: z.string().min(1),
    rowNumber: z.number().int().positive().optional(),
    rowVersion: z.string().min(1).optional(),
    rawRow: z.record(z.string(), z.unknown()).default({}),
  }),
  normalization: z.object({
    sheetProfileKey: z.string().min(1),
    sheetProfileVersion: z.number().int().positive(),
    worksheetSelection: worksheetSelectionSchema,
    headerMapping: z.object({
      headerRowNumber: z.number().int().positive(),
      mappedFields: z.record(
        z.string(),
        z.object({
          header: z.string().min(1),
          columnIndex: z.number().int().nonnegative().optional(),
        }),
      ),
      unmappedHeaders: z.array(z.string()).default([]),
    }),
    rowQualification: z.object({
      disposition: rowDispositionSchema,
      reasons: z.array(z.string()).default([]),
    }),
    titleDerivation: z.object({
      strategy: titleDerivationStrategySchema,
      sourceField: z.string().min(1).optional(),
      title: z.string().min(1),
    }),
  }),
  planning: normalizedPlanningFieldsSchema,
  sourceMetadata: sourceMetadataSchema,
  pushbackCandidates: pushbackCandidatesSchema.default({}),
  content: z.object({
    canonicalKey: z.string().min(1),
    profile: contentProfileSchema,
    contentType: contentTypeSchema,
    title: z.string().min(1),
    copy: z.string().min(1),
    locale: z.string().default("en"),
    translationRequired: z.boolean().default(false),
  }),
});

export type ContentIngestionPayload = z.infer<typeof contentIngestionPayloadSchema>;
