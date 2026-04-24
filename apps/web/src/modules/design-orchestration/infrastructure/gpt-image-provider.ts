import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  DesignExecutionProvider,
  DesignProviderExecutionContext,
  SubmittedDesignRequest,
  SyncedDesignRequest,
} from "../domain/design-provider";
import { resolveNanaBananaPrompt } from "../domain/nano-banana-presets";
import type { DesignReferenceAsset } from "../domain/design-reference-assets";
import {
  normalizeDesignReferenceAssets,
  normalizeReferenceAssetsForGeneration,
  serializeReferenceAssetsForFingerprint,
} from "../domain/design-reference-assets";
import { GPT_IMAGE_MODEL } from "@/shared/config/env";
import { logEvent } from "@/shared/logging/logger";
import { buildNBResultImageUrl, getNBResult, storeNBResult } from "./nb-result-store";
import { getGptImageClient } from "./gpt-image-client";

const gptImageRequestPayloadSchema = z
  .object({
    gptImage: z
      .object({
        presetId: z.string().nullable().optional(),
        presetPrompt: z.string().nullable().optional(),
        customPrompt: z.string().nullable().optional(),
        finalPrompt: z.string().nullable().optional(),
        resolvedPrompt: z.string().nullable().optional(),
        referenceAssets: z.array(z.unknown()).optional(),
        promptRecord: z.record(z.string(), z.unknown()).nullable().optional(),
        variationCount: z.number().int().optional(),
        size: z.string().nullable().optional(),
        quality: z.string().nullable().optional(),
      })
      .optional(),
    nanoBanana: z
      .object({
        presetId: z.string().nullable().optional(),
        presetPrompt: z.string().nullable().optional(),
        customPrompt: z.string().nullable().optional(),
        finalPrompt: z.string().nullable().optional(),
        resolvedPrompt: z.string().nullable().optional(),
        referenceAssets: z.array(z.unknown()).optional(),
        promptRecord: z.record(z.string(), z.unknown()).nullable().optional(),
        variationCount: z.number().int().optional(),
      })
      .optional(),
    presetId: z.string().nullable().optional(),
    presetPrompt: z.string().nullable().optional(),
    customPrompt: z.string().nullable().optional(),
    finalPrompt: z.string().nullable().optional(),
    resolvedPrompt: z.string().nullable().optional(),
    referenceAssets: z.array(z.unknown()).optional(),
    promptRecord: z.record(z.string(), z.unknown()).nullable().optional(),
    variationCount: z.number().int().optional(),
    size: z.string().nullable().optional(),
    quality: z.string().nullable().optional(),
  })
  .passthrough();

type ParsedGptImageRequest = {
  presetId: string | null;
  customPrompt: string | null;
  finalPrompt: string | null;
  resolvedPrompt: string | null;
  referenceAssets: DesignReferenceAsset[];
  variationCount: number;
  size: "1024x1024" | "1024x1536" | "1536x1024";
  quality: "low" | "medium" | "high" | "auto";
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return { message: String(error) };
}

function clampVariationCount(value: unknown): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : Number.parseInt(String(value ?? "1"), 10);

  if (Number.isNaN(parsed)) {
    return 1;
  }

  return Math.min(4, Math.max(1, parsed));
}

function parseSize(value: unknown): "1024x1024" | "1024x1536" | "1536x1024" {
  return value === "1024x1536" || value === "1536x1024" ? value : "1024x1024";
}

function parseQuality(value: unknown): "low" | "medium" | "high" | "auto" {
  return value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "auto"
    ? value
    : "auto";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseRequestPayload(requestPayload: unknown): ParsedGptImageRequest {
  const parsed = gptImageRequestPayloadSchema.safeParse(requestPayload);

  if (!parsed.success) {
    throw new Error(`GPT Image request payload is invalid: ${parsed.error.message}`);
  }

  const nested = parsed.data.gptImage ?? parsed.data.nanoBanana ?? parsed.data;
  const nestedRecord = nested as Record<string, unknown>;
  const promptRecord = nestedRecord.promptRecord && typeof nestedRecord.promptRecord === "object"
    ? (nestedRecord.promptRecord as Record<string, unknown>)
    : null;
  const customPrompt = readString(nestedRecord.customPrompt);
  const presetId = readString(nestedRecord.presetId);
  const finalPrompt = readString(nestedRecord.finalPrompt) ?? readString(promptRecord?.finalPrompt);
  const resolvedPrompt = readString(nestedRecord.resolvedPrompt);
  const referenceAssets = normalizeReferenceAssetsForGeneration(
    normalizeDesignReferenceAssets(nestedRecord.referenceAssets ?? promptRecord?.referenceAssets),
  );

  return {
    presetId,
    customPrompt,
    finalPrompt,
    resolvedPrompt,
    referenceAssets,
    variationCount: clampVariationCount(nested.variationCount ?? parsed.data.variationCount),
    size: parseSize(nestedRecord.size ?? parsed.data.size),
    quality: parseQuality(nestedRecord.quality ?? parsed.data.quality),
  };
}

function buildRequestId(
  input: DesignProviderExecutionContext,
  prompt: string,
  parsed: ParsedGptImageRequest,
) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        contentItemId: input.contentItemId,
        attemptNumber: input.attemptNumber,
        prompt,
        variationCount: parsed.variationCount,
        size: parsed.size,
        quality: parsed.quality,
        referenceAssets: serializeReferenceAssetsForFingerprint(parsed.referenceAssets),
      }),
    )
    .digest("hex")
    .slice(0, 24);

  return `gpt-img-${fingerprint}`;
}

function resolvePrompt(input: DesignProviderExecutionContext, parsed: ParsedGptImageRequest) {
  if (parsed.finalPrompt && parsed.finalPrompt.trim().length > 0) {
    return parsed.finalPrompt.trim();
  }

  if (parsed.resolvedPrompt && parsed.resolvedPrompt.trim().length > 0) {
    return parsed.resolvedPrompt.trim();
  }

  return resolveNanaBananaPrompt({
    presetId: parsed.presetId,
    customPrompt: parsed.customPrompt,
    title: input.title,
    author: String(input.profile),
    copy: input.copy,
    referenceAssets: parsed.referenceAssets,
  });
}

function buildSubmitPayload(input: {
  requestId: string;
  prompt: string;
  generatedAt: Date;
  variationCount: number;
  imageIds: string[];
  size: string;
  quality: string;
}) {
  return {
    requestId: input.requestId,
    status: "GENERATED" as const,
    generatedAt: input.generatedAt.toISOString(),
    prompt: input.prompt,
    variationCount: input.variationCount,
    imageIds: input.imageIds,
    gptImage: {
      requestId: input.requestId,
      generatedAt: input.generatedAt.toISOString(),
      variationCount: input.variationCount,
      size: input.size,
      quality: input.quality,
      imageIds: input.imageIds,
      model: GPT_IMAGE_MODEL,
    },
  };
}

function buildReadyPayload(input: {
  requestId: string;
  prompt: string;
  generatedAt: Date;
  variations: Array<{
    id: string;
    dataUrl: string;
    thumbnailUrl: string;
    editUrl: string;
    selected: boolean;
  }>;
}) {
  const variations = input.variations.map((variation, index) => ({
    id: variation.id,
    label: `Variation ${index + 1}`,
    dataUrl: variation.dataUrl,
    thumbnailUrl: variation.thumbnailUrl,
    editUrl: variation.editUrl,
    selected: index === 0,
  }));

  return {
    requestId: input.requestId,
    status: "READY" as const,
    generatedAt: input.generatedAt.toISOString(),
    prompt: input.prompt,
    variationCount: variations.length,
    gptImage: {
      requestId: input.requestId,
      generatedAt: input.generatedAt.toISOString(),
      variationCount: variations.length,
      variations,
    },
    nanoBanana: {
      requestId: input.requestId,
      generatedAt: input.generatedAt.toISOString(),
      variationCount: variations.length,
      variations,
    },
  };
}

export const gptImageProvider: DesignExecutionProvider = {
  async submitRequest(input: DesignProviderExecutionContext): Promise<SubmittedDesignRequest> {
    const parsed = parseRequestPayload(input.requestPayload);
    const prompt = resolvePrompt(input, parsed);
    const requestId = buildRequestId(input, prompt, parsed);
    const client = getGptImageClient();

    logEvent("info", "[GPT_IMAGE] Submitting synchronous OpenAI generation", {
      contentItemId: input.contentItemId,
      requestId,
      attemptNumber: input.attemptNumber,
      variationCount: parsed.variationCount,
      size: parsed.size,
      quality: parsed.quality,
      hasCustomPrompt: !!parsed.customPrompt,
      presetId: parsed.presetId ?? null,
      referenceAssetCount: parsed.referenceAssets.length,
    });

    try {
      const results = await client.generateImages({
        prompt,
        variationCount: parsed.variationCount,
        requestId,
        size: parsed.size,
        quality: parsed.quality,
        referenceAssets: parsed.referenceAssets,
      });

      if (results.length === 0) {
        throw new Error("OpenAI returned no images.");
      }

      const generatedAt = results[0]?.generatedAt ?? new Date();

      storeNBResult(
        requestId,
        results.map((result) => ({
          id: result.id,
          imageBase64: result.imageBase64,
          mimeType: result.mimeType,
        })),
        {
          prompt,
          generatedAt,
        },
      );

      const payload = buildSubmitPayload({
        requestId,
        prompt,
        generatedAt,
        variationCount: results.length,
        imageIds: results.map((result) => result.id),
        size: parsed.size,
        quality: parsed.quality,
      });

      logEvent("info", "[GPT_IMAGE] OpenAI generation stored", {
        requestId,
        variationCount: results.length,
      });

      return {
        externalRequestId: requestId,
        payload,
      };
    } catch (error) {
      logEvent("error", "[GPT_IMAGE] OpenAI submit failed", {
        contentItemId: input.contentItemId,
        requestId,
        attemptNumber: input.attemptNumber,
        error: serializeError(error),
      });

      throw new Error(
        `GPT Image submit failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },

  async syncRequest(input: {
    externalRequestId: string;
    requestPayload: unknown;
    resultPayload: unknown;
  }): Promise<SyncedDesignRequest> {
    if (!input.externalRequestId) {
      return {
        state: "FAILED",
        payload: {
          requestId: "",
          status: "FAILED",
          error: {
            code: "GPT_IMAGE_REQUEST_ID_REQUIRED",
            message: "No externalRequestId was provided.",
          },
        },
        errorCode: "GPT_IMAGE_REQUEST_ID_REQUIRED",
        errorMessage: "No externalRequestId was provided.",
        retryable: false,
      };
    }

    try {
      const stored = getNBResult(input.externalRequestId);

      if (!stored || stored.images.length === 0) {
        logEvent("warn", "[GPT_IMAGE] Stored OpenAI result missing or expired", {
          requestId: input.externalRequestId,
        });

        return {
          state: "FAILED",
          payload: {
            requestId: input.externalRequestId,
            status: "FAILED",
            error: {
              code: "GPT_IMAGE_RESULT_EXPIRED",
              message: "Generation result not found or expired. Please retry.",
            },
          },
          errorCode: "GPT_IMAGE_RESULT_EXPIRED",
          errorMessage: "Generation result not found or expired. Please retry.",
          retryable: true,
        };
      }

      const variations = stored.images.map((image, index) => {
        const url = buildNBResultImageUrl(stored.requestId, image.id);
        const dataUrl = `data:${image.mimeType};base64,${image.imageBase64}`;

        return {
          id: image.id,
          label: `Variation ${index + 1}`,
          dataUrl,
          thumbnailUrl: url,
          editUrl: url,
          selected: index === 0,
        };
      });

      const readyPayload = buildReadyPayload({
        requestId: stored.requestId,
        prompt: stored.prompt,
        generatedAt: stored.generatedAt,
        variations,
      });

      return {
        state: "READY",
        payload: readyPayload,
        asset: {
          designId: variations[0].id,
          editUrl: variations[0].editUrl,
          thumbnailUrl: variations[0].dataUrl,
        },
      };
    } catch (error) {
      logEvent("error", "[GPT_IMAGE] OpenAI sync failed", {
        requestId: input.externalRequestId,
        error: serializeError(error),
      });

      return {
        state: "FAILED",
        payload: {
          requestId: input.externalRequestId,
          status: "FAILED",
          error: {
            code: "GPT_IMAGE_SYNC_FAILED",
            message: error instanceof Error ? error.message : "Unknown GPT Image sync failure.",
          },
        },
        errorCode: "GPT_IMAGE_SYNC_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown GPT Image sync failure.",
        retryable: true,
      };
    }
  },
};
