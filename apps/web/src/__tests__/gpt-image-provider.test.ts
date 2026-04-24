import { ContentProfile, ContentType, DesignProvider } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openAiMock = vi.hoisted(() => {
  const imagesGenerateMock = vi.fn();
  const OpenAIMock = vi.fn(function OpenAIMock() {
    return {
      images: {
        generate: imagesGenerateMock,
      },
    };
  });

  return {
    imagesGenerateMock,
    OpenAIMock,
  };
});

vi.mock("openai", () => ({
  default: openAiMock.OpenAIMock,
}));

function setProcessEnv(overrides: Record<string, string | undefined>) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function buildInput(overrides: Record<string, unknown> = {}) {
  return {
    contentItemId: "content-item-1",
    canonicalKey: "sheet-1:worksheet-2:row-3",
    title: "Strong title",
    copy: "Final approved copy for the visual generator.",
    contentType: ContentType.STATIC_POST,
    profile: ContentProfile.SHAWN,
    sourceLocale: "en",
    translationRequired: false,
    translationCopy: null,
    platformLabel: null,
    templateId: undefined,
    preferredDesignProvider: DesignProvider.GPT_IMAGE,
    attemptNumber: 1,
    plannedDate: undefined,
    scenario: "SUCCESS",
    requestPayload: {
      gptImage: {
        presetId: "hook",
        customPrompt: null,
        resolvedPrompt: null,
        variationCount: 3,
      },
    },
    ...overrides,
  };
}

async function importProvider() {
  return import("@/modules/design-orchestration/infrastructure/gpt-image-provider");
}

async function resetGptImageState() {
  const store = await import(
    "@/modules/design-orchestration/infrastructure/nb-result-store"
  );
  const client = await import(
    "@/modules/design-orchestration/infrastructure/gpt-image-client"
  );

  store.clearNBResultStoreForTests();
  client.resetGptImageClientForTests();
}

describe("gptImageProvider real OpenAI adapter", () => {
  let restoreEnv: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      GPT_IMAGE_PROVIDER_MODE: "REAL",
      OPENAI_API_KEY: "test-openai-key",
      GPT_IMAGE_MODEL: "gpt-image-2",
    });
    openAiMock.imagesGenerateMock.mockReset();
    openAiMock.OpenAIMock.mockClear();
    await resetGptImageState();
  });

  afterEach(() => {
    restoreEnv?.();
    vi.resetModules();
  });

  it("submitRequest with a valid prompt returns a request id", async () => {
    openAiMock.imagesGenerateMock.mockResolvedValue({
      data: [{ b64_json: "aGVsbG8=" }],
    });

    const { gptImageProvider } = await importProvider();
    const submitted = await gptImageProvider.submitRequest(
      buildInput({
        requestPayload: {
          gptImage: {
            presetId: "hook",
            customPrompt: "A custom GPT Image prompt",
            resolvedPrompt: null,
            variationCount: 1,
          },
        },
      }) as never,
    );

    expect(submitted.externalRequestId).toMatch(/^gpt-img-/);
    expect(openAiMock.OpenAIMock).toHaveBeenCalledWith({ apiKey: "test-openai-key" });
    expect(openAiMock.imagesGenerateMock).toHaveBeenCalledTimes(1);
  });

  it("submitRequest includes reference assets in the prompt-only GPT Image request", async () => {
    openAiMock.imagesGenerateMock.mockResolvedValue({
      data: [{ b64_json: "aGVsbG8=" }],
    });

    const { gptImageProvider } = await importProvider();
    await gptImageProvider.submitRequest(
      buildInput({
        requestPayload: {
          gptImage: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 1,
            referenceAssets: [
              {
                id: "asset-1",
                source: "upload",
                role: "style_reference",
                displayName: "Example style.png",
                mimeType: "image/png",
                status: "ready",
                dataUrl: "data:image/png;base64,ZXhhbXBsZQ==",
              },
            ],
          },
        },
      }) as never,
    );

    const [request] = openAiMock.imagesGenerateMock.mock.calls[0] ?? [];
    const prompt = String((request as { prompt?: string })?.prompt ?? "");

    expect(prompt).toContain("Reference assets:");
    expect(prompt).toContain("style reference image");
    expect(request).not.toHaveProperty("image");
  });

  it("submitRequest without an API key throws", async () => {
    restoreEnv?.();
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      GPT_IMAGE_PROVIDER_MODE: "REAL",
      OPENAI_API_KEY: undefined,
      GPT_IMAGE_MODEL: "gpt-image-2",
    });
    vi.resetModules();
    await resetGptImageState();

    const { gptImageProvider } = await importProvider();

    await expect(gptImageProvider.submitRequest(buildInput() as never)).rejects.toThrow(
      "OPENAI_API_KEY is required",
    );
  });

  it("syncRequest with a valid id returns READY with variations", async () => {
    openAiMock.imagesGenerateMock.mockResolvedValue({
      data: [{ b64_json: "aGVsbG8=" }],
    });

    const { gptImageProvider } = await importProvider();
    const submitted = await gptImageProvider.submitRequest(
      buildInput({
        requestPayload: {
          gptImage: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 2,
          },
        },
      }) as never,
    );

    const result = await gptImageProvider.syncRequest({
      externalRequestId: submitted.externalRequestId,
      requestPayload: {},
      resultPayload: {},
    });

    expect(result.state).toBe("READY");
    if (result.state === "READY") {
      const payload = result.payload as {
        requestId: string;
        gptImage: {
          variations: Array<{
            id: string;
            dataUrl: string;
            selected: boolean;
          }>;
        };
      };

      expect(payload.requestId).toBe(submitted.externalRequestId);
      expect(payload.gptImage.variations).toHaveLength(2);
      expect(payload.gptImage.variations[0]).toMatchObject({
        id: `${submitted.externalRequestId}-v1`,
        selected: true,
        dataUrl: expect.stringContaining("data:image/png;base64,"),
      });
      expect(payload.gptImage.variations[1]).toMatchObject({
        id: `${submitted.externalRequestId}-v2`,
        selected: false,
      });
      expect(result.asset).toMatchObject({
        designId: `${submitted.externalRequestId}-v1`,
        thumbnailUrl: expect.stringContaining("data:image/png;base64,"),
      });
    }
  });

  it("syncRequest with an expired id returns FAILED retryable true", async () => {
    openAiMock.imagesGenerateMock.mockResolvedValue({
      data: [{ b64_json: "aGVsbG8=" }],
    });

    const { gptImageProvider } = await importProvider();
    const submitted = await gptImageProvider.submitRequest(
      buildInput({
        requestPayload: {
          gptImage: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 1,
          },
        },
      }) as never,
    );

    const store = await import(
      "@/modules/design-orchestration/infrastructure/nb-result-store"
    );

    store.clearNBResultStoreForTests();
    store.storeNBResult(
      submitted.externalRequestId,
      [
        {
          id: `${submitted.externalRequestId}-v1`,
          imageBase64: "aGVsbG8=",
          mimeType: "image/png",
        },
      ],
      {
        prompt: "expired result",
        generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        ttlMs: 1,
      },
    );

    const result = await gptImageProvider.syncRequest({
      externalRequestId: submitted.externalRequestId,
      requestPayload: {},
      resultPayload: {},
    });

    expect(result).toMatchObject({
      state: "FAILED",
      retryable: true,
      errorCode: "GPT_IMAGE_RESULT_EXPIRED",
    });
  });

  it("variationCount above 4 is clamped to 4", async () => {
    openAiMock.imagesGenerateMock.mockResolvedValue({
      data: [{ b64_json: "aGVsbG8=" }],
    });

    const { gptImageProvider } = await importProvider();
    await gptImageProvider.submitRequest(
      buildInput({
        requestPayload: {
          gptImage: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 9,
          },
        },
      }) as never,
    );

    expect(openAiMock.imagesGenerateMock).toHaveBeenCalledTimes(4);
  });

  it("variation zero is selected by default", async () => {
    openAiMock.imagesGenerateMock.mockResolvedValue({
      data: [{ b64_json: "aGVsbG8=" }],
    });

    const { gptImageProvider } = await importProvider();
    const submitted = await gptImageProvider.submitRequest(
      buildInput({
        requestPayload: {
          gptImage: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 2,
          },
        },
      }) as never,
    );

    const result = await gptImageProvider.syncRequest({
      externalRequestId: submitted.externalRequestId,
      requestPayload: {},
      resultPayload: {},
    });

    expect(result.state).toBe("READY");
    if (result.state === "READY") {
      const payload = result.payload as {
        gptImage: { variations: Array<{ selected: boolean }> };
      };
      expect(payload.gptImage.variations[0].selected).toBe(true);
      expect(payload.gptImage.variations[1].selected).toBe(false);
    }
  });
});
