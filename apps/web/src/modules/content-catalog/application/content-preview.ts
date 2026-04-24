type AssetLike = {
  externalUrl?: string | null;
};

type PreviewInput = {
  planningSnapshot: unknown;
  assets?: AssetLike[];
};

export type PublishedPreview = {
  previewUrl: string;
  referenceUrl: string;
  label: string;
};

function readRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function collectUrlCandidates(planningSnapshot: unknown) {
  const snapshot = readRecord(planningSnapshot);
  if (!snapshot) {
    return [];
  }

  const planning = readRecord(snapshot.planning);
  const candidates: Array<{ url: string; label: string }> = [];

  const pushCandidate = (value: unknown, label: string) => {
    if (typeof value !== "string") {
      return;
    }

    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return;
    }

    candidates.push({ url: trimmed, label });
  };

  pushCandidate(planning?.sourceAssetLink, "Source visual");

  return candidates;
}

function isImageExtensionUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url);
}

function extractGoogleDriveFileId(url: string) {
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return fileMatch[1];
  }

  const queryMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) {
    return queryMatch[1];
  }

  return null;
}

function toPreviewableImageUrl(url: string) {
  if (/^data:image\//i.test(url)) {
    return url;
  }

  if (isImageExtensionUrl(url) || /googleusercontent\.com|ggpht\.com|imgur\.com/i.test(url)) {
    return url;
  }

  const driveFileId = extractGoogleDriveFileId(url);
  if (driveFileId) {
    return `https://drive.google.com/uc?export=view&id=${driveFileId}`;
  }

  return null;
}

export function getPublishedPreview(input: PreviewInput): PublishedPreview | null {
  const assetUrl = input.assets?.find((asset) => typeof asset.externalUrl === "string" && asset.externalUrl.trim().length > 0)?.externalUrl?.trim();
  if (assetUrl) {
    const previewUrl = toPreviewableImageUrl(assetUrl);
    if (previewUrl) {
      return {
        previewUrl,
        referenceUrl: assetUrl,
        label: "Published visual",
      };
    }
  }

  for (const candidate of collectUrlCandidates(input.planningSnapshot)) {
    const previewUrl = toPreviewableImageUrl(candidate.url);
    if (!previewUrl) {
      continue;
    }

    return {
      previewUrl,
      referenceUrl: candidate.url,
      label: candidate.label,
    };
  }

  return null;
}
