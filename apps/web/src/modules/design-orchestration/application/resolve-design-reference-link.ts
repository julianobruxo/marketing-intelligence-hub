"use server";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { GoogleConnectionAccessError, getCurrentUserGoogleOAuthClient } from "@/modules/auth/application/google-connection-service";
import {
  DESIGN_REFERENCE_ASSET_MAX_BYTES,
  createFailedGoogleDriveReferenceAsset,
  createReadyGoogleDriveReferenceAsset,
  extractGoogleDriveFileId,
  isSupportedDesignReferenceMimeType,
  normalizeDesignReferenceAssetRole,
  type DesignReferenceAsset,
  type DesignReferenceAssetRole,
} from "../domain/design-reference-assets";

export type ResolveDesignReferenceLinkResult =
  | {
      ok: true;
      asset: DesignReferenceAsset;
    }
  | {
      ok: false;
      asset: DesignReferenceAsset;
      errorMessage: string;
    };

function getGoogleApiStatus(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: number;
      response?: { status?: number };
    };

    return candidate.response?.status ?? candidate.code ?? null;
  }

  return null;
}

function mapDriveReferenceError(error: unknown) {
  if (error instanceof GoogleConnectionAccessError) {
    return error.message;
  }

  const status = getGoogleApiStatus(error);
  if (status === 401) {
    return "The connected Google credentials are missing, expired, or revoked.";
  }

  if (status === 403 || status === 404) {
    return "This Google Drive image is not accessible for the connected account.";
  }

  return error instanceof Error
    ? error.message
    : "Could not resolve this Google Drive image.";
}

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  if (typeof data === "string") {
    return Buffer.from(data, "binary");
  }

  throw new Error("Google Drive returned an unsupported image payload.");
}

async function resolveGoogleDriveImageReferenceAsset(input: {
  id: string;
  originalUrl: string;
  driveFileId: string;
  role: DesignReferenceAssetRole;
}): Promise<DesignReferenceAsset> {
  const { oauthClient } = await getCurrentUserGoogleOAuthClient();
  const drive = google.drive({ version: "v3", auth: oauthClient });

  const metadataResponse = await drive.files.get({
    fileId: input.driveFileId,
    supportsAllDrives: true,
    fields: "id,name,mimeType,size,thumbnailLink,webContentLink,webViewLink",
  });

  const file = metadataResponse.data;
  const displayName = file.name?.trim() || "Google Drive image";
  const mimeType = file.mimeType?.trim() || "";
  const sizeBytes = file.size ? Number.parseInt(file.size, 10) : null;

  if (!isSupportedDesignReferenceMimeType(mimeType)) {
    throw new Error("The Google Drive link resolved, but the file is not a supported image.");
  }

  if (
    typeof sizeBytes === "number" &&
    Number.isFinite(sizeBytes) &&
    sizeBytes > DESIGN_REFERENCE_ASSET_MAX_BYTES
  ) {
    throw new Error(
      `The Google Drive image is larger than ${Math.floor(DESIGN_REFERENCE_ASSET_MAX_BYTES / 1024 / 1024)}MB.`,
    );
  }

  const mediaResponse = await drive.files.get(
    {
      fileId: input.driveFileId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "arraybuffer",
    },
  );
  const imageBuffer = toBuffer(mediaResponse.data);

  if (imageBuffer.byteLength > DESIGN_REFERENCE_ASSET_MAX_BYTES) {
    throw new Error(
      `The Google Drive image is larger than ${Math.floor(DESIGN_REFERENCE_ASSET_MAX_BYTES / 1024 / 1024)}MB.`,
    );
  }

  return createReadyGoogleDriveReferenceAsset({
    id: input.id,
    originalUrl: input.originalUrl,
    driveFileId: input.driveFileId,
    displayName,
    mimeType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : imageBuffer.byteLength,
    dataUrl: `data:${mimeType};base64,${imageBuffer.toString("base64")}`,
    thumbnailUrl: file.thumbnailLink ?? null,
    role: input.role,
  });
}

export async function resolveDesignReferenceLinkAction(input: {
  id?: string | null;
  url: string;
  role?: DesignReferenceAssetRole | null;
}): Promise<ResolveDesignReferenceLinkResult> {
  const id = input.id?.trim() || randomUUID();
  const originalUrl = input.url.trim();
  const role = normalizeDesignReferenceAssetRole(input.role);
  const driveFileId = extractGoogleDriveFileId(originalUrl);

  if (!originalUrl) {
    const errorMessage = "Paste a Google Drive image link first.";
    return {
      ok: false,
      errorMessage,
      asset: createFailedGoogleDriveReferenceAsset({
        id,
        originalUrl,
        role,
        errorMessage,
      }),
    };
  }

  if (!driveFileId) {
    const errorMessage = "Paste a valid Google Drive file link to an image.";
    return {
      ok: false,
      errorMessage,
      asset: createFailedGoogleDriveReferenceAsset({
        id,
        originalUrl,
        role,
        errorMessage,
      }),
    };
  }

  try {
    return {
      ok: true,
      asset: await resolveGoogleDriveImageReferenceAsset({
        id,
        originalUrl,
        driveFileId,
        role,
      }),
    };
  } catch (error) {
    const errorMessage = mapDriveReferenceError(error);
    return {
      ok: false,
      errorMessage,
      asset: createFailedGoogleDriveReferenceAsset({
        id,
        originalUrl,
        role,
        driveFileId,
        errorMessage,
      }),
    };
  }
}
