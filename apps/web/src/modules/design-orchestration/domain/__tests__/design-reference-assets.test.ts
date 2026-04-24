import { describe, expect, it } from "vitest";
import { buildFinalImagePrompt, buildImageGenerationPromptRecord } from "../build-image-prompt";
import { buildReferenceAssetsPromptBlock } from "../build-reference-assets-prompt-block";
import { deriveDesignContextFromCard } from "../derive-design-context";
import { getDefaultDesignPreset } from "../design-presets";
import {
  createUploadDesignReferenceAsset,
  extractGoogleDriveFileId,
  normalizeDesignReferenceAsset,
  parseImageDataUrl,
  validateReferenceAssetCount,
  type DesignReferenceAsset,
} from "../design-reference-assets";

const PNG_DATA_URL = "data:image/png;base64,aGVsbG8=";

function buildAsset(overrides: Partial<DesignReferenceAsset> = {}): DesignReferenceAsset {
  return {
    id: "asset-1",
    source: "upload",
    role: "logo",
    displayName: "Zazmic logo.png",
    mimeType: "image/png",
    fileName: "Zazmic logo.png",
    resolvedUrl: PNG_DATA_URL,
    thumbnailUrl: PNG_DATA_URL,
    uploadedFileId: "asset-1",
    status: "ready",
    sizeBytes: 512,
    dataUrl: PNG_DATA_URL,
    ...overrides,
  };
}

describe("design reference assets", () => {
  it("enforces the combined asset count limit", () => {
    expect(validateReferenceAssetCount(4, 1)).toBeNull();
    expect(validateReferenceAssetCount(4, 2)).toContain("up to 5");
  });

  it("preserves supported roles and normalizes unknown roles", () => {
    expect(normalizeDesignReferenceAsset(buildAsset({ role: "qr_code" }))?.role).toBe("qr_code");
    expect(normalizeDesignReferenceAsset({ ...buildAsset(), role: "mystery" })?.role).toBe("general_reference");
  });

  it("extracts common Google Drive file ids and rejects folders", () => {
    expect(extractGoogleDriveFileId("https://drive.google.com/file/d/abc_123-XYZ/view")).toBe("abc_123-XYZ");
    expect(extractGoogleDriveFileId("https://drive.google.com/open?id=file-id-1")).toBe("file-id-1");
    expect(extractGoogleDriveFileId("https://drive.google.com/drive/folders/folder-id")).toBeNull();
    expect(extractGoogleDriveFileId("https://example.com/file/d/abc/view")).toBeNull();
  });

  it("normalizes uploaded image assets with role and data url preserved", () => {
    const asset = createUploadDesignReferenceAsset({
      id: "upload-1",
      fileName: "headshot.webp",
      mimeType: "image/webp",
      sizeBytes: 1234,
      dataUrl: "data:image/webp;base64,aGVsbG8=",
      role: "photo",
    });

    expect(asset).toMatchObject({
      id: "upload-1",
      source: "upload",
      role: "photo",
      status: "ready",
      mimeType: "image/webp",
      dataUrl: "data:image/webp;base64,aGVsbG8=",
    });
  });

  it("parses supported image data urls for provider attachments", () => {
    expect(parseImageDataUrl(PNG_DATA_URL)).toEqual({
      mimeType: "image/png",
      data: "aGVsbG8=",
    });
    expect(parseImageDataUrl("data:text/plain;base64,aGVsbG8=")).toBeNull();
  });

  it("builds a concise semantic prompt block for ready reference assets", () => {
    const block = buildReferenceAssetsPromptBlock([
      buildAsset({ role: "logo" }),
      buildAsset({ id: "asset-2", role: "qr_code", displayName: "Event QR.png" }),
      buildAsset({ id: "asset-3", status: "failed", errorMessage: "No access" }),
    ]);

    expect(block).toContain("Asset 1: logo asset");
    expect(block).toContain("Asset 2: QR code asset");
    expect(block).not.toContain("No access");
  });

  it("extends final prompts and prompt records with reference asset metadata", () => {
    const preset = getDefaultDesignPreset();
    const derivedContext = deriveDesignContextFromCard({
      title: "AI governance checklist",
      author: "Shawn",
      copy: "Download the checklist and use the framework.",
    });
    const referenceAssets = [buildAsset({ role: "brand_asset" })];

    const finalPrompt = buildFinalImagePrompt({
      preset,
      derivedContext,
      customPrompt: "Use the logo in the lower-right corner.",
      referenceAssets,
    });
    const record = buildImageGenerationPromptRecord({
      preset,
      derivedContext,
      customPrompt: "Use the logo in the lower-right corner.",
      variations: 2,
      referenceAssets,
    });

    expect(finalPrompt).toContain("Additional user instructions:");
    expect(finalPrompt).toContain("Reference assets:");
    expect(finalPrompt.indexOf("Additional user instructions:")).toBeLessThan(
      finalPrompt.indexOf("Reference assets:"),
    );
    expect(record.referenceAssets).toHaveLength(1);
    expect(record.referenceAssets[0]?.role).toBe("brand_asset");
    expect(record.finalPrompt).toContain("Reference assets:");
  });
});
