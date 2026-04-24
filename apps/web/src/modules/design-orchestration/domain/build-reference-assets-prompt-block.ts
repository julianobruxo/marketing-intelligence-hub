import type { DesignReferenceAsset, DesignReferenceAssetRole } from "./design-reference-assets";
import { normalizeReferenceAssetsForGeneration } from "./design-reference-assets";

const ROLE_PROMPT_COPY: Record<DesignReferenceAssetRole, string> = {
  general_reference: "general reference image to guide the design where useful",
  logo: "logo asset to incorporate cleanly and legibly into the design",
  photo: "photo or headshot asset to incorporate into the composition",
  qr_code: "QR code asset to include as a visible functional element if possible; preserve the supplied code image rather than redrawing it from memory",
  style_reference: "style reference image to guide tone, visual language, and composition",
  layout_reference: "layout reference image to guide structure without copying it exactly",
  brand_asset: "brand asset to preserve and integrate with the Zazmic-style visual system",
};

function formatDisplayName(asset: DesignReferenceAsset) {
  const name = asset.displayName || asset.fileName;
  return name ? ` (${name})` : "";
}

export function buildReferenceAssetsPromptBlock(
  assets: DesignReferenceAsset[] | null | undefined,
): string | null {
  const readyAssets = normalizeReferenceAssetsForGeneration(assets ?? []);
  if (readyAssets.length === 0) {
    return null;
  }

  const lines = readyAssets.map((asset, index) => {
    const roleCopy = ROLE_PROMPT_COPY[asset.role] ?? ROLE_PROMPT_COPY.general_reference;
    return `- Asset ${index + 1}: ${roleCopy}${formatDisplayName(asset)}.`;
  });

  return `Reference assets:
${lines.join("\n")}

Use these as guidance inputs alongside the preset and card context. Do not let references replace the core message, brand direction, or selected preset. Similar images should guide generation rather than imply exact pixel-level editing.`;
}
