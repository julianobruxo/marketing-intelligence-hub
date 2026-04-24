import type { DerivedDesignContext } from "./derive-design-context";
import type { DesignPreset, DesignPresetId } from "./design-presets";
import type { DesignReferenceAsset } from "./design-reference-assets";
import { normalizeReferenceAssetsForGeneration } from "./design-reference-assets";
import { buildReferenceAssetsPromptBlock } from "./build-reference-assets-prompt-block";

export type ImageGenerationPromptRecord = {
  presetId: DesignPresetId;
  presetPrompt: string;
  customPrompt: string | null;
  finalPrompt: string;
  variations: number;
  referenceAssets: DesignReferenceAsset[];
};

function compactOptional(value: string | null | undefined): string | null {
  const compacted = value?.replace(/\s+/g, " ").trim() ?? "";
  return compacted.length > 0 ? compacted : null;
}

function formatList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "none specified";
}

function buildContextBlock(context: DerivedDesignContext): string {
  return `Post context:
- Title: ${context.title}
- Author: ${context.author}
- Main topic: ${context.postTopic}
- Primary angle: ${context.primaryAngle}
- Visual goal: ${context.visualGoal}
- CTA intent: ${context.ctaIntent ?? "none explicit"}
- Likely content shape: ${context.likelyContentShape ?? "single-frame LinkedIn static post"}
- Key entities: ${formatList(context.keyEntities)}
- Text density: ${context.textDensityHint === "high" ? "high-text controlled" : `${context.textDensityHint}-text controlled`}
- Brand context: ${context.brandContext}`;
}

export function buildFinalImagePrompt(input: {
  preset: DesignPreset;
  derivedContext: DerivedDesignContext;
  customPrompt?: string | null;
  referenceAssets?: DesignReferenceAsset[] | null;
}): string {
  const customPrompt = compactOptional(input.customPrompt);
  const referenceAssetsBlock = buildReferenceAssetsPromptBlock(input.referenceAssets);
  const sections = [
    input.preset.prompt.trim(),
    buildContextBlock(input.derivedContext),
  ];

  if (customPrompt) {
    sections.push(`Additional user instructions:
${customPrompt}

Apply these as refinements where practical. Preserve the preset's core brand direction, from-scratch generation mode, and controlled text-density guardrails unless the user explicitly asks for a different asset format.`);
  }

  if (referenceAssetsBlock) {
    sections.push(referenceAssetsBlock);
  }

  return sections.join("\n\n");
}

export function buildImageGenerationPromptRecord(input: {
  preset: DesignPreset;
  derivedContext: DerivedDesignContext;
  customPrompt?: string | null;
  variations: number;
  referenceAssets?: DesignReferenceAsset[] | null;
}): ImageGenerationPromptRecord {
  const customPrompt = compactOptional(input.customPrompt);
  const referenceAssets = normalizeReferenceAssetsForGeneration(input.referenceAssets ?? []);

  return {
    presetId: input.preset.id,
    presetPrompt: input.preset.prompt,
    customPrompt,
    finalPrompt: buildFinalImagePrompt({
      preset: input.preset,
      derivedContext: input.derivedContext,
      customPrompt,
      referenceAssets,
    }),
    variations: input.variations,
    referenceAssets,
  };
}
