import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerativeModel } from "@google/generative-ai";
import type { Part } from "@google/generative-ai";
import type { DesignReferenceAsset } from "../domain/design-reference-assets";
import { parseImageDataUrl } from "../domain/design-reference-assets";
import { NB_API_KEY, NB_MODEL } from "@/shared/config/env";
import { logEvent } from "@/shared/logging/logger";

export type GeminiImageResult = {
  id: string;
  imageBase64: string;
  mimeType: string;
  prompt: string;
  generatedAt: Date;
};

export type GeminiGenerateOptions = {
  prompt: string;
  variationCount?: number;
  aspectRatio?: string;
  imageSize?: string;
  requestId?: string;
  referenceAssets?: DesignReferenceAsset[];
};

type InlineData = {
  mimeType: string;
  data: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return { message: String(error) };
}

function clampVariationCount(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 1;
  }

  return Math.min(4, Math.max(1, Math.trunc(value)));
}

function buildVariationPrompt(
  prompt: string,
  options: {
    aspectRatio: string;
    imageSize: string;
    variationIndex: number;
  },
) {
  const parts = [prompt.trim()];

  if (options.aspectRatio.trim().length > 0) {
    parts.push(`Aspect ratio: ${options.aspectRatio.trim()}.`);
  }

  if (options.imageSize.trim().length > 0) {
    parts.push(`Target size: ${options.imageSize.trim()}.`);
  }

  if (options.variationIndex > 0) {
    parts.push(
      `Variation ${options.variationIndex + 1}: make it subtly different in composition while preserving the same message.`,
    );
  }

  return parts.join(" ");
}

function buildReferenceImageParts(assets: DesignReferenceAsset[] | undefined): Array<{ inlineData: InlineData }> {
  return (assets ?? []).flatMap((asset) => {
    const parsed = parseImageDataUrl(asset.dataUrl ?? asset.resolvedUrl);
    return parsed ? [{ inlineData: parsed }] : [];
  });
}

function isInlineDataPart(part: Part): part is Part & { inlineData: InlineData } {
  return (
    "inlineData" in part &&
    !!part.inlineData &&
    typeof part.inlineData.data === "string" &&
    typeof part.inlineData.mimeType === "string" &&
    part.inlineData.mimeType.startsWith("image/")
  );
}

function extractImageInlineData(response: unknown): InlineData | null {
  const responseRecord = asRecord(response);
  const candidates = Array.isArray(responseRecord?.candidates)
    ? responseRecord.candidates
    : [];

  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate);
    const content = asRecord(candidateRecord?.content);
    const parts = Array.isArray(content?.parts) ? content.parts : [];

    for (const rawPart of parts) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as Part;

      if (isInlineDataPart(part)) {
        return part.inlineData;
      }
    }
  }

  return null;
}

export class GeminiImageClient {
  private readonly model: GenerativeModel;
  private readonly modelId: string;

  constructor(apiKey: string, modelId: string) {
    this.modelId = modelId;
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: modelId });
  }

  async generateImages(options: GeminiGenerateOptions): Promise<GeminiImageResult[]> {
    const variationCount = clampVariationCount(options.variationCount);
    const requestId = options.requestId ?? crypto.randomUUID();

    logEvent("info", "[NB] Generating images via Gemini API", {
      model: this.modelId,
      requestId,
      variationCount,
      promptLength: options.prompt.trim().length,
      aspectRatio: options.aspectRatio ?? "1:1",
      imageSize: options.imageSize ?? "1K",
      referenceAssetCount: options.referenceAssets?.length ?? 0,
      attachedReferenceAssetCount: buildReferenceImageParts(options.referenceAssets).length,
    });

    const generationPromises = Array.from({ length: variationCount }, (_, variationIndex) =>
      this.generateSingle(options.prompt, {
        requestId,
        variationIndex,
        aspectRatio: options.aspectRatio ?? "1:1",
        imageSize: options.imageSize ?? "1K",
        referenceAssets: options.referenceAssets ?? [],
      }),
    );

    const results = await Promise.allSettled(generationPromises);
    const successful = results
      .filter((result): result is PromiseFulfilledResult<GeminiImageResult> => result.status === "fulfilled")
      .map((result) => result.value);

    if (successful.length === 0) {
      const firstError = results.find((result) => result.status === "rejected");
      const reason =
        firstError && firstError.status === "rejected"
          ? firstError.reason instanceof Error
            ? firstError.reason.message
            : String(firstError.reason)
          : "unknown";

      logEvent("error", "[NB] Gemini generation failed", {
        requestId,
        model: this.modelId,
        variationCount,
        reason,
      });

      throw new Error(`All ${variationCount} Gemini generations failed: ${reason}`);
    }

    if (successful.length < variationCount) {
      logEvent("warn", "[NB] Gemini generation partially succeeded", {
        requestId,
        model: this.modelId,
        requested: variationCount,
        successful: successful.length,
      });
    }

    logEvent("info", "[NB] Gemini generation complete", {
      requestId,
      model: this.modelId,
      requested: variationCount,
      successful: successful.length,
    });

    return successful;
  }

  private async generateSingle(
    prompt: string,
    options: {
      requestId: string;
      variationIndex: number;
      aspectRatio: string;
      imageSize: string;
      referenceAssets: DesignReferenceAsset[];
    },
  ): Promise<GeminiImageResult> {
    const variationId = `${options.requestId}-v${options.variationIndex + 1}`;
    const variationPrompt = buildVariationPrompt(prompt, options);
    const parts = [
      { text: variationPrompt },
      ...buildReferenceImageParts(options.referenceAssets),
    ] as Part[];

    try {
      const request = {
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
        },
      } as unknown as Parameters<GenerativeModel["generateContent"]>[0];

      const result = await this.model.generateContent(request);

      const inlineData = extractImageInlineData(result.response);

      if (!inlineData) {
        throw new Error(`No image was returned for variation ${options.variationIndex + 1}.`);
      }

      return {
        id: variationId,
        imageBase64: inlineData.data,
        mimeType: inlineData.mimeType,
        prompt: variationPrompt,
        generatedAt: new Date(),
      };
    } catch (error) {
      logEvent("error", "[NB] Gemini variation generation failed", {
        requestId: options.requestId,
        variationIndex: options.variationIndex,
        error: serializeError(error),
      });
      throw error;
    }
  }
}

let cachedClient: GeminiImageClient | null = null;

export function getGeminiImageClient(): GeminiImageClient {
  if (cachedClient) {
    return cachedClient;
  }

  if (!NB_API_KEY) {
    throw new Error("NB_API_KEY is required for REAL mode.");
  }

  cachedClient = new GeminiImageClient(NB_API_KEY, NB_MODEL);
  return cachedClient;
}

export function resetGeminiImageClientForTests() {
  cachedClient = null;
}
