import { z } from "zod";
import { contentTypeSchema, importModeSchema, orchestratorTypeSchema } from "./ingestion-contract";
import { contentProfileSchema } from "./sheet-profiles";

export const normalizeSheetRowRequestSchema = z.object({
  version: z.literal(1),
  mode: importModeSchema.default("PREVIEW"),
  orchestrator: orchestratorTypeSchema.default("MANUAL"),
  sheetProfileKey: z.string().min(1),
  source: z.object({
    spreadsheetId: z.string().min(1),
    spreadsheetName: z.string().min(1),
    worksheetId: z.string().min(1),
    worksheetName: z.string().min(1),
    rowId: z.string().min(1),
    rowNumber: z.number().int().positive().optional(),
    rowVersion: z.string().min(1).optional(),
    headerRowNumber: z.number().int().positive(),
    headers: z.array(z.string()).min(1),
    rowValues: z.array(z.string()).min(1),
  }),
  worksheetSelection: z.object({
    targetMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    availableWorksheets: z
      .array(
        z.object({
          worksheetId: z.string().min(1),
          worksheetName: z.string().min(1),
        }),
      )
      .default([]),
  }),
  contentHints: z.object({
    profile: contentProfileSchema,
    contentType: contentTypeSchema,
    locale: z.string().default("en"),
    translationRequired: z.boolean().default(false),
    canonicalKey: z.string().min(1).optional(),
  }),
});

export type NormalizeSheetRowRequest = z.infer<typeof normalizeSheetRowRequestSchema>;
