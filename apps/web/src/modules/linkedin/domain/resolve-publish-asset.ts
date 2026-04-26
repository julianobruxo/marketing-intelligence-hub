import type { AssetType } from "@prisma/client";

export type PublishAssetResult = {
  ok: true;
  assetType: AssetType;
  assetUrl: string;
  assetSnapshot: Record<string, unknown>;
};

export type PublishAssetError = {
  ok: false;
  reason: "NO_READY_ASSET";
};

type AssetSource = {
  assetType: AssetType;
  assetStatus: string;
  externalUrl: string | null;
  storagePath: string | null;
  slideIndex: number | null;
  locale: string;
  metadata: unknown;
};

export function resolvePublishAsset(
  assets: AssetSource[],
): PublishAssetResult | PublishAssetError {
  const readyAssets = assets.filter(
    (a) => a.assetStatus === "READY" && (a.externalUrl || a.storagePath),
  );

  // Image assets take priority over video references
  const imageAsset = readyAssets.find((a) => a.assetType !== "VIDEO");
  const videoAsset = readyAssets.find((a) => a.assetType === "VIDEO");

  const chosen = imageAsset ?? videoAsset ?? null;

  if (!chosen) {
    return { ok: false, reason: "NO_READY_ASSET" };
  }

  const url = chosen.externalUrl ?? chosen.storagePath ?? "";

  return {
    ok: true,
    assetType: chosen.assetType,
    assetUrl: url,
    assetSnapshot: {
      assetType: chosen.assetType,
      assetStatus: chosen.assetStatus,
      externalUrl: chosen.externalUrl ?? null,
      storagePath: chosen.storagePath ?? null,
      slideIndex: chosen.slideIndex ?? null,
      locale: chosen.locale,
      metadata: chosen.metadata ?? null,
    },
  };
}
