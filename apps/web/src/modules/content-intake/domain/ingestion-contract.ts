import { z } from "zod";
import {
  contentProfileSchema,
  rowDispositionSchema,
  titleDerivationStrategySchema,
  worksheetSelectionStrategySchema,
} from "./sheet-profiles";
import {
  operationalContentStatusSchema,
  workflowBlockReasonSchema,
} from "./infer-content-status";

export const contentTypeSchema = z.enum(["STATIC_POST", "CAROUSEL"]);
export const orchestratorTypeSchema = z.enum(["ZAPIER", "N8N", "MANUAL"]);
export const importModeSchema = z.enum(["PREVIEW", "COMMIT"]);
export const rowQualificationConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

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
  campaignLabel: z.string().min(1).optional(),
  copyEnglish: z.string(),
  sourceAssetLink: z.string().min(1).optional(),
  contentDeadline: z.string().min(1).optional(),
});

const sourceMetadataSchema = z.object({
  publishedFlag: z.union([z.string(), z.boolean()]).optional(),
});

const pushbackCandidatesSchema = z.object({
  appItemUrl: z.string().min(1).optional(),
  workflowStatus: z.string().min(1).optional(),
  designAssetUrl: z.string().min(1).optional(),
  publishedAt: z.string().min(1).optional(),
  publishedPostUrl: z.string().min(1).optional(),
});

const workflowIntentSchema = z.object({
  translationRequired: z.boolean().default(false),
  autoPostEnabled: z.boolean().default(false),
  preferredDesignProvider: z.enum(["CANVA", "GPT_IMAGE", "AI_VISUAL", "MANUAL"]).default("CANVA"),
  reimportStrategy: z.enum(["UPDATE", "REPLACE", "KEEP_AS_IS"]).default("UPDATE"),
  equivalenceTargetContentItemId: z.string().min(1).optional(),
  conflictConfidence: z.enum(["HIGH_CONFIDENCE_DUPLICATE", "POSSIBLE_DUPLICATE", "NO_MEANINGFUL_MATCH"]).default(
    "NO_MEANINGFUL_MATCH",
  ),
  operationalStatus: operationalContentStatusSchema.optional(),
  blockReason: workflowBlockReasonSchema.optional(),
});

export const contentIngestionPayloadSchema = z.object({
  version: z.literal(2),
  mode: importModeSchema.default("COMMIT"),
  idempotencyKey: z.string().min(8),
  orchestrator: orchestratorTypeSchema.default("MANUAL"),
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
          header: z.string().min(1).nullish(),
          columnIndex: z.number().int().nonnegative().optional(),
        }),
      ),
      unmappedHeaders: z.array(z.string()).default([]),
    }),
    rowQualification: z.object({
      disposition: rowDispositionSchema,
      confidence: rowQualificationConfidenceSchema.default("MEDIUM"),
      reasons: z.array(z.string()).default([]),
      signals: z.object({
        hasDate: z.boolean().default(false),
        hasTitle: z.boolean().default(false),
        hasCopy: z.boolean().default(false),
        hasPlatform: z.boolean().default(false),
        hasLink: z.boolean().default(false),
        hasPublicationMarker: z.boolean().default(false),
      }).default({
        hasDate: false,
        hasTitle: false,
        hasCopy: false,
        hasPlatform: false,
        hasLink: false,
        hasPublicationMarker: false,
      }),
      isPublishedRow: z.boolean().default(false),
    }),
    titleDerivation: z.object({
      strategy: titleDerivationStrategySchema,
      sourceField: z.string().min(1).optional(),
      title: z.string().min(1),
      titleDerivedFromBrief: z.boolean().optional(),
    }),
  }),
  planning: normalizedPlanningFieldsSchema,
  sourceMetadata: sourceMetadataSchema,
  pushbackCandidates: pushbackCandidatesSchema.default({}),
  workflow: workflowIntentSchema.default({
    translationRequired: false,
    autoPostEnabled: false,
    preferredDesignProvider: "CANVA",
    reimportStrategy: "UPDATE",
    conflictConfidence: "NO_MEANINGFUL_MATCH",
  }),
  content: z.object({
    canonicalKey: z.string().min(1),
    profile: contentProfileSchema,
    contentType: contentTypeSchema,
    title: z.string().min(1),
    copy: z.string(),
    locale: z.string().default("en"),
    translationRequired: z.boolean().default(false),
    translationCopy: z.string().min(1).optional(),
    translationRequestedAt: z.iso.datetime().optional(),
    translationGeneratedAt: z.iso.datetime().optional(),
  }),
});

export type ContentIngestionPayload = z.infer<typeof contentIngestionPayloadSchema>;
