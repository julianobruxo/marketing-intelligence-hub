export type DesignReferenceAssetSource = "upload" | "google_drive_link";

export type DesignReferenceAssetStatus = "ready" | "resolving" | "failed";

export type DesignReferenceAssetRole =
  | "general_reference"
  | "logo"
  | "photo"
  | "qr_code"
  | "style_reference"
  | "layout_reference"
  | "brand_asset";

export type DesignReferenceAsset = {
  id: string;
  source: DesignReferenceAssetSource;
  role: DesignReferenceAssetRole;
  displayName: string;
  mimeType?: string | null;
  fileName?: string | null;
  originalUrl?: string | null;
  resolvedUrl?: string | null;
  thumbnailUrl?: string | null;
  uploadedFileId?: string | null;
  driveFileId?: string | null;
  status: DesignReferenceAssetStatus;
  errorMessage?: string | null;
  sizeBytes?: number | null;
  dataUrl?: string | null;
};

export const DESIGN_REFERENCE_ASSET_LIMIT = 5;
export const DESIGN_REFERENCE_ASSET_MAX_BYTES = 5 * 1024 * 1024;

export const DESIGN_REFERENCE_ASSET_ROLES: Array<{
  value: DesignReferenceAssetRole;
  label: string;
}> = [
  { value: "general_reference", label: "General" },
  { value: "logo", label: "Logo" },
  { value: "photo", label: "Photo" },
  { value: "qr_code", label: "QR code" },
  { value: "style_reference", label: "Style" },
  { value: "layout_reference", label: "Layout" },
  { value: "brand_asset", label: "Brand" },
];

const ROLE_SET = new Set(DESIGN_REFERENCE_ASSET_ROLES.map((role) => role.value));

function compact(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isDesignReferenceAssetRole(value: unknown): value is DesignReferenceAssetRole {
  return typeof value === "string" && ROLE_SET.has(value as DesignReferenceAssetRole);
}

export function normalizeDesignReferenceAssetRole(
  value: unknown,
): DesignReferenceAssetRole {
  return isDesignReferenceAssetRole(value) ? value : "general_reference";
}

export function isSupportedDesignReferenceMimeType(value: string | null | undefined) {
  return typeof value === "string" && /^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/i.test(value);
}

export function validateReferenceAssetCount(currentCount: number, incomingCount: number) {
  if (currentCount + incomingCount > DESIGN_REFERENCE_ASSET_LIMIT) {
    return `You can add up to ${DESIGN_REFERENCE_ASSET_LIMIT} reference assets total.`;
  }

  return null;
}

export function validateReferenceAssetFile(input: {
  mimeType?: string | null;
  sizeBytes?: number | null;
}) {
  if (!isSupportedDesignReferenceMimeType(input.mimeType)) {
    return "Only image files are supported as reference assets.";
  }

  if (
    typeof input.sizeBytes === "number" &&
    input.sizeBytes > DESIGN_REFERENCE_ASSET_MAX_BYTES
  ) {
    return `Reference images must be ${Math.floor(DESIGN_REFERENCE_ASSET_MAX_BYTES / 1024 / 1024)}MB or smaller.`;
  }

  return null;
}

export function createUploadDesignReferenceAsset(input: {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  role?: DesignReferenceAssetRole;
}): DesignReferenceAsset {
  return {
    id: input.id,
    source: "upload",
    role: input.role ?? "general_reference",
    displayName: compact(input.fileName) ?? "Uploaded image",
    mimeType: input.mimeType,
    fileName: input.fileName,
    originalUrl: null,
    resolvedUrl: input.dataUrl,
    thumbnailUrl: input.dataUrl,
    uploadedFileId: input.id,
    driveFileId: null,
    status: "ready",
    errorMessage: null,
    sizeBytes: input.sizeBytes,
    dataUrl: input.dataUrl,
  };
}

export function createPendingGoogleDriveReferenceAsset(input: {
  id: string;
  originalUrl: string;
  role?: DesignReferenceAssetRole;
}): DesignReferenceAsset {
  return {
    id: input.id,
    source: "google_drive_link",
    role: input.role ?? "general_reference",
    displayName: "Resolving Google Drive asset",
    originalUrl: input.originalUrl,
    status: "resolving",
  };
}

export function createFailedGoogleDriveReferenceAsset(input: {
  id: string;
  originalUrl: string;
  role?: DesignReferenceAssetRole;
  errorMessage: string;
  driveFileId?: string | null;
}): DesignReferenceAsset {
  return {
    id: input.id,
    source: "google_drive_link",
    role: input.role ?? "general_reference",
    displayName: "Google Drive asset",
    originalUrl: input.originalUrl,
    driveFileId: input.driveFileId ?? null,
    status: "failed",
    errorMessage: input.errorMessage,
  };
}

export function createReadyGoogleDriveReferenceAsset(input: {
  id: string;
  originalUrl: string;
  driveFileId: string;
  displayName: string;
  mimeType: string;
  sizeBytes?: number | null;
  dataUrl: string;
  thumbnailUrl?: string | null;
  role?: DesignReferenceAssetRole;
}): DesignReferenceAsset {
  return {
    id: input.id,
    source: "google_drive_link",
    role: input.role ?? "general_reference",
    displayName: compact(input.displayName) ?? "Google Drive image",
    mimeType: input.mimeType,
    fileName: compact(input.displayName),
    originalUrl: input.originalUrl,
    resolvedUrl: input.dataUrl,
    thumbnailUrl: input.thumbnailUrl ?? input.dataUrl,
    uploadedFileId: null,
    driveFileId: input.driveFileId,
    status: "ready",
    errorMessage: null,
    sizeBytes: input.sizeBytes ?? null,
    dataUrl: input.dataUrl,
  };
}

export function extractGoogleDriveFileId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!/(^|\.)google\.com$/i.test(parsed.hostname) && !/(^|\.)googleusercontent\.com$/i.test(parsed.hostname)) {
    return null;
  }

  const filePathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (filePathMatch?.[1]) {
    return filePathMatch[1];
  }

  const folderPathMatch = parsed.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderPathMatch) {
    return null;
  }

  const queryId = parsed.searchParams.get("id");
  return queryId && /^[a-zA-Z0-9_-]+$/.test(queryId) ? queryId : null;
}

export function parseImageDataUrl(dataUrl: string | null | undefined): {
  mimeType: string;
  data: string;
} | null {
  const match = dataUrl?.match(/^data:(image\/[-+.\w]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  if (!isSupportedDesignReferenceMimeType(mimeType)) {
    return null;
  }

  return {
    mimeType,
    data: match[2],
  };
}

export function normalizeDesignReferenceAsset(value: unknown): DesignReferenceAsset | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = compact(typeof value.id === "string" ? value.id : null);
  const source = value.source === "upload" || value.source === "google_drive_link"
    ? value.source
    : null;
  const status = value.status === "ready" || value.status === "resolving" || value.status === "failed"
    ? value.status
    : null;

  if (!id || !source || !status) {
    return null;
  }

  const role = normalizeDesignReferenceAssetRole(value.role);
  const displayName = compact(typeof value.displayName === "string" ? value.displayName : null) ?? "Reference asset";
  const mimeType = compact(typeof value.mimeType === "string" ? value.mimeType : null);
  const sizeBytes = typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes)
    ? Math.max(0, Math.trunc(value.sizeBytes))
    : null;

  return {
    id,
    source,
    role,
    displayName,
    mimeType,
    fileName: compact(typeof value.fileName === "string" ? value.fileName : null),
    originalUrl: compact(typeof value.originalUrl === "string" ? value.originalUrl : null),
    resolvedUrl: compact(typeof value.resolvedUrl === "string" ? value.resolvedUrl : null),
    thumbnailUrl: compact(typeof value.thumbnailUrl === "string" ? value.thumbnailUrl : null),
    uploadedFileId: compact(typeof value.uploadedFileId === "string" ? value.uploadedFileId : null),
    driveFileId: compact(typeof value.driveFileId === "string" ? value.driveFileId : null),
    status,
    errorMessage: compact(typeof value.errorMessage === "string" ? value.errorMessage : null),
    sizeBytes,
    dataUrl: compact(typeof value.dataUrl === "string" ? value.dataUrl : null),
  };
}

export function normalizeDesignReferenceAssets(values: unknown): DesignReferenceAsset[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => normalizeDesignReferenceAsset(value))
    .filter((asset): asset is DesignReferenceAsset => !!asset)
    .slice(0, DESIGN_REFERENCE_ASSET_LIMIT);
}

export function normalizeReferenceAssetsForGeneration(
  assets: DesignReferenceAsset[],
): DesignReferenceAsset[] {
  return assets
    .filter((asset) => asset.status === "ready")
    .filter((asset) => isSupportedDesignReferenceMimeType(asset.mimeType))
    .slice(0, DESIGN_REFERENCE_ASSET_LIMIT);
}

export function parseReferenceAssetsFormValue(value: FormDataEntryValue | null): DesignReferenceAsset[] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeReferenceAssetsForGeneration(normalizeDesignReferenceAssets(parsed));
  } catch {
    return [];
  }
}

export function serializeReferenceAssetsForFingerprint(
  assets: DesignReferenceAsset[],
): Array<Record<string, unknown>> {
  return normalizeReferenceAssetsForGeneration(assets).map((asset) => ({
    source: asset.source,
    role: asset.role,
    displayName: asset.displayName,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    driveFileId: asset.driveFileId ?? null,
    uploadedFileId: asset.uploadedFileId ?? null,
    dataUrl: asset.dataUrl ?? null,
    resolvedUrl: asset.resolvedUrl ?? null,
  }));
}
