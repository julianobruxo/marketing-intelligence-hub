import { buildFinalImagePrompt } from "./build-image-prompt";
import { deriveDesignContextFromCard } from "./derive-design-context";
import type { DesignReferenceAsset } from "./design-reference-assets";
import {
  DESIGN_PRESETS,
  getDefaultDesignPreset,
  getDesignPresetById,
  resolveDesignPreset,
  type DesignPreset,
} from "./design-presets";

export type NanaBananaPreset = DesignPreset;

export const NANO_BANANA_PRESETS = DESIGN_PRESETS;

export function getNanaBananaPresetById(id: string): NanaBananaPreset | null {
  return getDesignPresetById(id);
}

export function getDefaultNanaBananaPreset(): NanaBananaPreset {
  return getDefaultDesignPreset();
}

export function resolveNanaBananaPrompt(input: {
  presetId: string | null;
  customPrompt: string | null;
  title: string;
  author?: string | null;
  copy: string;
  referenceAssets?: DesignReferenceAsset[] | null;
}): string {
  const preset = resolveDesignPreset(input.presetId);
  const derivedContext = deriveDesignContextFromCard({
    title: input.title,
    author: input.author ?? "Zazmic",
    copy: input.copy,
  });

  return buildFinalImagePrompt({
    preset,
    derivedContext,
    customPrompt: input.customPrompt,
    referenceAssets: input.referenceAssets,
  });
}
