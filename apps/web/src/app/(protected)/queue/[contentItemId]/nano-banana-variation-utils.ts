export type NanaBananaVariation = {
  id: string;
  label: string;
  thumbnailUrl: string;
  editUrl: string;
};

export function extractNanaBananaVariations(resultPayload: unknown): NanaBananaVariation[] {
  if (!resultPayload || typeof resultPayload !== "object") return [];

  const payload = resultPayload as Record<string, unknown>;
  const nb = payload.nanoBanana ?? payload.gptImage;
  if (!nb || typeof nb !== "object") return [];

  const nbData = nb as Record<string, unknown>;
  if (!Array.isArray(nbData.variations)) return [];

  return nbData.variations
    .filter(
      (v): v is {
        id: string;
        thumbnailUrl?: string;
        dataUrl?: string;
        editUrl: string;
        label: string;
      } =>
        !!v &&
        typeof v === "object" &&
        typeof v.id === "string" &&
        (typeof v.dataUrl === "string" || typeof v.thumbnailUrl === "string") &&
        typeof v.editUrl === "string",
    )
    .map((v) => ({
      id: v.id,
      label: typeof v.label === "string" ? v.label : v.id,
      thumbnailUrl:
        typeof v.dataUrl === "string" && v.dataUrl.trim().length > 0
          ? v.dataUrl
          : typeof v.thumbnailUrl === "string"
            ? v.thumbnailUrl
            : "",
      editUrl: v.editUrl,
    }));
}

export function extractSelectedVariationId(assetMetadata: unknown): string | null {
  if (!assetMetadata || typeof assetMetadata !== "object") return null;
  const meta = assetMetadata as Record<string, unknown>;
  if (typeof meta.selectedVariationId === "string") {
    return meta.selectedVariationId;
  }

  const selectedVariation = meta.selectedVariation;
  if (selectedVariation && typeof selectedVariation === "object" && !Array.isArray(selectedVariation)) {
    const selectedVariationData = selectedVariation as Record<string, unknown>;
    return typeof selectedVariationData.id === "string" ? selectedVariationData.id : null;
  }

  return null;
}
