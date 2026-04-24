import OpenAI from "openai";
import type { DesignReferenceAsset } from "../domain/design-reference-assets";
import { GPT_IMAGE_MODEL, OPENAI_API_KEY } from "@/shared/config/env";
import { logEvent } from "@/shared/logging/logger";

export type GptImageResult = {
  id: string;
  imageBase64: string;
  mimeType: "image/png";
  prompt: string;
  generatedAt: Date;
};

export type GptImageGenerateOptions = {
  prompt: string;
  variationCount?: number;
  requestId?: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  quality?: "low" | "medium" | "high" | "auto";
  referenceAssets?: DesignReferenceAsset[];
};

function clampVariationCount(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 1;
  }

  return Math.min(4, Math.max(1, Math.trunc(value)));
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

export class GptImageClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateImages(options: GptImageGenerateOptions): Promise<GptImageResult[]> {
    const variationCount = clampVariationCount(options.variationCount);
    const requestId = options.requestId ?? crypto.randomUUID();
    const size = options.size ?? "1024x1024";
    const quality = options.quality ?? "auto";

    logEvent("info", "[GPT_IMAGE] Generating images via OpenAI API", {
      model: this.model,
      requestId,
      variationCount,
      size,
      quality,
      promptLength: options.prompt.trim().length,
      referenceAssetCount: options.referenceAssets?.length ?? 0,
      referenceAssetMode: "prompt_only",
    });

    const generationPromises = Array.from({ length: variationCount }, (_, variationIndex) =>
      this.generateSingle(options.prompt, {
        requestId,
        variationIndex,
        size,
        quality,
      }),
    );

    const results = await Promise.allSettled(generationPromises);
    const successful = results
      .filter((result): result is PromiseFulfilledResult<GptImageResult> => result.status === "fulfilled")
      .map((result) => result.value);

    if (successful.length === 0) {
      const firstError = results.find((result) => result.status === "rejected");
      const reason =
        firstError && firstError.status === "rejected"
          ? firstError.reason instanceof Error
            ? firstError.reason.message
            : String(firstError.reason)
          : "unknown";

      logEvent("error", "[GPT_IMAGE] OpenAI generation failed", {
        model: this.model,
        requestId,
        variationCount,
        reason,
      });

      throw new Error(`All ${variationCount} GPT Image generations failed: ${reason}`);
    }

    if (successful.length < variationCount) {
      logEvent("warn", "[GPT_IMAGE] OpenAI generation partially succeeded", {
        model: this.model,
        requestId,
        requested: variationCount,
        successful: successful.length,
      });
    }

    return successful;
  }

  private async generateSingle(
    prompt: string,
    options: {
      requestId: string;
      variationIndex: number;
      size: "1024x1024" | "1024x1536" | "1536x1024";
      quality: "low" | "medium" | "high" | "auto";
    },
  ): Promise<GptImageResult> {
    const variationId = `${options.requestId}-v${options.variationIndex + 1}`;
    const variationPrompt =
      options.variationIndex === 0
        ? prompt
        : `${prompt}\n\nCreative variation ${options.variationIndex + 1}: keep the same message and brand rules, but vary composition and visual emphasis.`;

    try {
      const response = await this.client.images.generate({
        model: this.model,
        prompt: variationPrompt,
        n: 1,
        size: options.size,
        quality: options.quality,
        output_format: "png",
      });

      const imageData = response.data?.[0];
      if (!imageData?.b64_json) {
        throw new Error("No image data returned from GPT Image.");
      }

      return {
        id: variationId,
        imageBase64: imageData.b64_json,
        mimeType: "image/png",
        prompt: variationPrompt,
        generatedAt: new Date(),
      };
    } catch (error) {
      logEvent("error", "[GPT_IMAGE] OpenAI variation generation failed", {
        requestId: options.requestId,
        variationIndex: options.variationIndex,
        error: serializeError(error),
      });
      throw error;
    }
  }
}

let cachedClient: GptImageClient | null = null;

export function getGptImageClient(): GptImageClient {
  if (cachedClient) {
    return cachedClient;
  }

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for GPT Image REAL mode.");
  }

  cachedClient = new GptImageClient(OPENAI_API_KEY, GPT_IMAGE_MODEL);
  return cachedClient;
}

export function resetGptImageClientForTests() {
  cachedClient = null;
}
