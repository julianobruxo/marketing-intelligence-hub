import { createHash } from "node:crypto";
import { DesignProvider } from "@prisma/client";
import type { DesignReferenceAsset } from "./design-reference-assets";
import { serializeReferenceAssetsForFingerprint } from "./design-reference-assets";

type DesignSourceIdentity = {
  canonicalKey: string;
  spreadsheetId?: string | null;
  worksheetId?: string | null;
  rowId?: string | null;
};

export function buildDesignSourceIdentity(input: DesignSourceIdentity): string {
  const spreadsheetId = input.spreadsheetId?.trim() ?? "";
  const worksheetId = input.worksheetId?.trim() ?? "";
  const rowId = input.rowId?.trim() ?? "";

  if (spreadsheetId && worksheetId && rowId) {
    return [spreadsheetId, worksheetId, rowId].join(":");
  }

  return input.canonicalKey.trim();
}

function normalizeFieldMappings(fieldMappings: Record<string, string>) {
  return Object.keys(fieldMappings)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, string>>((accumulator, key) => {
      accumulator[key] = fieldMappings[key]?.trim() ?? "";
      return accumulator;
    }, {});
}

export function buildDesignRequestFingerprint(input: {
  provider: DesignProvider;
  sourceIdentity: string;
  templateId?: string | null;
  fieldMappings?: Record<string, string>;
  presetId?: string | null;
  customPrompt?: string | null;
  variationCount?: number | null;
  resolvedPrompt?: string | null;
  referenceAssets?: DesignReferenceAsset[] | null;
}): string {
  const normalized =
    input.provider === DesignProvider.CANVA
      ? {
          provider: input.provider,
          sourceIdentity: input.sourceIdentity,
          templateId: input.templateId?.trim() ?? "",
          fieldMappings: normalizeFieldMappings(input.fieldMappings ?? {}),
        }
      : {
          provider: input.provider,
          sourceIdentity: input.sourceIdentity,
          presetId: input.presetId?.trim() ?? "",
          customPrompt: input.customPrompt?.trim() ?? "",
          variationCount: input.variationCount ?? 0,
          resolvedPrompt: input.resolvedPrompt?.trim() ?? "",
          referenceAssets: serializeReferenceAssetsForFingerprint(input.referenceAssets ?? []),
        };

  return createHash("md5").update(JSON.stringify(normalized)).digest("hex");
}
