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
import { logEvent } from "@/shared/logging/logger";
import { buildNBResultImageUrl, getNBResult, storeNBResult } from "./nb-result-store";
import { getGeminiImageClient } from "./gemini-image-client";

const nanoBananaRequestPayloadSchema = z
  .object({
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
        aspectRatio: z.string().nullable().optional(),
        imageSize: z.string().nullable().optional(),
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
    aspectRatio: z.string().nullable().optional(),
    imageSize: z.string().nullable().optional(),
  })
  .passthrough();

type ParsedNanoBananaRequest = {
  presetId: string | null;
  customPrompt: string | null;
  finalPrompt: string | null;
  resolvedPrompt: string | null;
  referenceAssets: DesignReferenceAsset[];
  variationCount: number;
  aspectRatio: string;
  imageSize: string;
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

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseRequestPayload(requestPayload: unknown): ParsedNanoBananaRequest {
  const parsed = nanoBananaRequestPayloadSchema.safeParse(requestPayload);

  if (!parsed.success) {
    throw new Error(`Nano Banana request payload is invalid: ${parsed.error.message}`);
  }

  const nested = parsed.data.nanoBanana ?? parsed.data;
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
    aspectRatio: nested.aspectRatio?.trim() || parsed.data.aspectRatio?.trim() || "1:1",
    imageSize: nested.imageSize?.trim() || parsed.data.imageSize?.trim() || "1K",
  };
}

function buildRequestId(
  input: DesignProviderExecutionContext,
  prompt: string,
  parsed: ParsedNanoBananaRequest,
) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        contentItemId: input.contentItemId,
        attemptNumber: input.attemptNumber,
        prompt,
        variationCount: parsed.variationCount,
        aspectRatio: parsed.aspectRatio,
        imageSize: parsed.imageSize,
        referenceAssets: serializeReferenceAssetsForFingerprint(parsed.referenceAssets),
      }),
    )
    .digest("hex")
    .slice(0, 24);

  return `nb-${fingerprint}`;
}

function resolvePrompt(input: DesignProviderExecutionContext, parsed: ParsedNanoBananaRequest) {
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
  return {
    requestId: input.requestId,
    status: "READY" as const,
    generatedAt: input.generatedAt.toISOString(),
    prompt: input.prompt,
    variationCount: input.variations.length,
    nanoBanana: {
      requestId: input.requestId,
      generatedAt: input.generatedAt.toISOString(),
      variationCount: input.variations.length,
      variations: input.variations.map((variation, index) => ({
        id: variation.id,
        label: `Variation ${index + 1}`,
        dataUrl: variation.dataUrl,
        thumbnailUrl: variation.thumbnailUrl,
        editUrl: variation.editUrl,
        selected: index === 0,
      })),
    },
  };
}

export const nanoBananaProvider: DesignExecutionProvider = {
  async submitRequest(input: DesignProviderExecutionContext): Promise<SubmittedDesignRequest> {
    const parsed = parseRequestPayload(input.requestPayload);
    const prompt = resolvePrompt(input, parsed);
    const requestId = buildRequestId(input, prompt, parsed);
    const client = getGeminiImageClient();

    logEvent("info", "[NB] Submitting synchronous Gemini generation", {
      contentItemId: input.contentItemId,
      requestId,
      attemptNumber: input.attemptNumber,
      variationCount: parsed.variationCount,
      aspectRatio: parsed.aspectRatio,
      imageSize: parsed.imageSize,
      hasCustomPrompt: !!parsed.customPrompt,
      presetId: parsed.presetId ?? null,
      referenceAssetCount: parsed.referenceAssets.length,
    });

    try {
      const results = await client.generateImages({
        prompt,
        variationCount: parsed.variationCount,
        aspectRatio: parsed.aspectRatio,
        imageSize: parsed.imageSize,
        requestId,
        referenceAssets: parsed.referenceAssets,
      });

      if (results.length === 0) {
        throw new Error("Gemini returned no images.");
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

      // Build the READY payload with base64 data URLs embedded so the result is
      // persisted to the DB immediately via the returned payload. This makes sync
      // work even after the in-memory store TTL expires or the server restarts.
      const variations = results.map((result, index) => {
        const url = buildNBResultImageUrl(requestId, result.id);
        const dataUrl = `data:${result.mimeType};base64,${result.imageBase64}`;
        return {
          id: result.id,
          dataUrl,
          thumbnailUrl: url,
          editUrl: url,
          selected: index === 0,
        };
      });

      const payload = buildReadyPayload({
        requestId,
        prompt,
        generatedAt,
        variations,
      });

      logEvent("info", "[NB] Gemini generation stored", {
        requestId,
        variationCount: results.length,
      });

      return {
        externalRequestId: requestId,
        payload,
      };
    } catch (error) {
      logEvent("error", "[NB] Gemini submit failed", {
        contentItemId: input.contentItemId,
        requestId,
        attemptNumber: input.attemptNumber,
        error: serializeError(error),
      });

      throw new Error(
        `Nano Banana Gemini submit failed: ${
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
            code: "NB_REQUEST_ID_REQUIRED",
            message: "No externalRequestId was provided.",
          },
        },
        errorCode: "NB_REQUEST_ID_REQUIRED",
        errorMessage: "No externalRequestId was provided.",
        retryable: false,
      };
    }

    try {
      // Prefer the READY payload already persisted in the DB (stored at submit time).
      // This survives server restarts and in-memory TTL expiry.
      const resultRecord =
        input.resultPayload && typeof input.resultPayload === "object"
          ? (input.resultPayload as Record<string, unknown>)
          : null;
      const persistedNB =
        resultRecord?.nanoBanana && typeof resultRecord.nanoBanana === "object"
          ? (resultRecord.nanoBanana as Record<string, unknown>)
          : null;
      const persistedVariations = Array.isArray(persistedNB?.variations)
        ? (persistedNB.variations as Array<Record<string, unknown>>).filter(
            (v) => typeof v.id === "string" && typeof v.dataUrl === "string",
          )
        : null;

      if (persistedVariations && persistedVariations.length > 0) {
        const variations = persistedVariations.map((v, index) => ({
          id: v.id as string,
          label: `Variation ${index + 1}`,
          dataUrl: v.dataUrl as string,
          thumbnailUrl: typeof v.thumbnailUrl === "string" ? v.thumbnailUrl : (v.dataUrl as string),
          editUrl: typeof v.editUrl === "string" ? v.editUrl : (v.dataUrl as string),
          selected: index === 0,
        }));

        const readyPayload = buildReadyPayload({
          requestId: input.externalRequestId,
          prompt: typeof resultRecord?.prompt === "string" ? resultRecord.prompt : "",
          generatedAt:
            typeof resultRecord?.generatedAt === "string"
              ? new Date(resultRecord.generatedAt)
              : new Date(),
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
      }

      // Fall back to the in-memory store for requests that pre-date this fix.
      const stored = getNBResult(input.externalRequestId);

      if (!stored || stored.images.length === 0) {
        logEvent("warn", "[NB] Stored Gemini result missing or expired", {
          requestId: input.externalRequestId,
        });

        return {
          state: "FAILED",
          payload: {
            requestId: input.externalRequestId,
            status: "FAILED",
            error: {
              code: "NB_RESULT_EXPIRED",
              message: "Generation result not found or expired. Please retry.",
            },
          },
          errorCode: "NB_RESULT_EXPIRED",
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
      logEvent("error", "[NB] Gemini sync failed", {
        requestId: input.externalRequestId,
        error: serializeError(error),
      });

      return {
        state: "FAILED",
        payload: {
          requestId: input.externalRequestId,
          status: "FAILED",
          error: {
            code: "NB_SYNC_FAILED",
            message:
              error instanceof Error ? error.message : "Unknown Nano Banana sync failure.",
          },
        },
        errorCode: "NB_SYNC_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown Nano Banana sync failure.",
        retryable: true,
      };
    }
  },
};
