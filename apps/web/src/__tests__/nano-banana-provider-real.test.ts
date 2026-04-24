import { ContentProfile, ContentType, DesignProvider } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const geminiMock = vi.hoisted(() => {
  const generateContentMock = vi.fn();
  const getGenerativeModelMock = vi.fn(() => ({
    generateContent: generateContentMock,
  }));
  const GoogleGenerativeAIMock = vi.fn(function GoogleGenerativeAIMock() {
    return {
      getGenerativeModel: getGenerativeModelMock,
    };
  });

  return {
    generateContentMock,
    getGenerativeModelMock,
    GoogleGenerativeAIMock,
  };
});

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: geminiMock.GoogleGenerativeAIMock,
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

function createGeminiResponse(data: string, mimeType = "image/png") {
  return {
    response: {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data,
                  mimeType,
                },
              },
            ],
          },
        },
      ],
    },
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
    preferredDesignProvider: DesignProvider.AI_VISUAL,
    attemptNumber: 1,
    plannedDate: undefined,
    scenario: "SUCCESS",
    requestPayload: {
      nanoBanana: {
        presetId: "hook",
        customPrompt: null,
        resolvedPrompt: null,
        variationCount: 3,
        aspectRatio: "1:1",
        imageSize: "1K",
      },
    },
    ...overrides,
  };
}

async function importProvider() {
  return import("@/modules/design-orchestration/infrastructure/nano-banana-provider");
}

async function resetGeminiState() {
  const store = await import(
    "@/modules/design-orchestration/infrastructure/nb-result-store"
  );
  const client = await import(
    "@/modules/design-orchestration/infrastructure/gemini-image-client"
  );

  store.clearNBResultStoreForTests();
  client.resetGeminiImageClientForTests();
}

describe("nanoBananaProvider real Gemini adapter", () => {
  const originalFetch = globalThis.fetch;
  let restoreEnv: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NB_PROVIDER_MODE: "REAL",
      NB_API_KEY: "test-gemini-key",
      NB_MODEL: "gemini-3.1-flash-image-preview",
    });
    geminiMock.generateContentMock.mockReset();
    geminiMock.getGenerativeModelMock.mockClear();
    geminiMock.GoogleGenerativeAIMock.mockClear();
    globalThis.fetch = originalFetch;
    await resetGeminiState();
  });

  afterEach(() => {
    restoreEnv?.();
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("submitRequest sends the assembled preset prompt with custom instructions", async () => {
    geminiMock.generateContentMock.mockResolvedValue(createGeminiResponse("aGVsbG8="));

    const { nanoBananaProvider } = await importProvider();
    await nanoBananaProvider.submitRequest(
      buildInput({
        requestPayload: {
          nanoBanana: {
            presetId: "hook",
            customPrompt: "A custom prompt for the design",
            resolvedPrompt: null,
            variationCount: 1,
            aspectRatio: "1:1",
            imageSize: "1K",
          },
        },
      }) as never,
    );

    const [request] = geminiMock.generateContentMock.mock.calls[0] ?? [];
    const prompt = String(
      (request as { contents?: Array<{ parts?: Array<{ text?: string }> }> })?.contents?.[0]
        ?.parts?.[0]?.text ?? "",
    );

    expect(prompt).toContain("Create a scroll-stopping LinkedIn visual");
    expect(prompt).toContain("Post context:");
    expect(prompt).toContain("Additional user instructions:");
    expect(prompt).toContain("A custom prompt for the design");
    expect(prompt).toContain("Aspect ratio: 1:1.");
    expect(prompt).toContain("Target size: 1K.");
  });

  it("submitRequest passes ready reference assets as Gemini inline data", async () => {
    geminiMock.generateContentMock.mockResolvedValue(createGeminiResponse("aGVsbG8="));

    const { nanoBananaProvider } = await importProvider();
    await nanoBananaProvider.submitRequest(
      buildInput({
        requestPayload: {
          nanoBanana: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 1,
            aspectRatio: "1:1",
            imageSize: "1K",
            referenceAssets: [
              {
                id: "asset-1",
                source: "upload",
                role: "logo",
                displayName: "Logo.png",
                mimeType: "image/png",
                status: "ready",
                dataUrl: "data:image/png;base64,bG9nbw==",
              },
            ],
          },
        },
      }) as never,
    );

    const [request] = geminiMock.generateContentMock.mock.calls[0] ?? [];
    const parts =
      (request as { contents?: Array<{ parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> }> })
        ?.contents?.[0]?.parts ?? [];

    expect(parts[0]?.text).toContain("Reference assets:");
    expect(parts[1]?.inlineData).toEqual({
      mimeType: "image/png",
      data: "bG9nbw==",
    });
  });

  it("submitRequest resolves the prompt from a preset when customPrompt is absent", async () => {
    geminiMock.generateContentMock.mockResolvedValue(createGeminiResponse("aGVsbG8="));

    const { nanoBananaProvider } = await importProvider();
    await nanoBananaProvider.submitRequest(
      buildInput({
        requestPayload: {
          nanoBanana: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 1,
            aspectRatio: "1:1",
            imageSize: "1K",
          },
        },
      }) as never,
    );

    const [request] = geminiMock.generateContentMock.mock.calls[0] ?? [];
    const prompt = String(
      (request as { contents?: Array<{ parts?: Array<{ text?: string }> }> })?.contents?.[0]
        ?.parts?.[0]?.text ?? "",
    );

    expect(prompt).toContain("Strong title");
    expect(prompt).toContain("Zazmic-style");
    expect(prompt).toContain("Post context:");
    expect(prompt).toContain("Create a scroll-stopping LinkedIn visual");
  });

  it("submitRequest falls back to the default preset when no prompt is provided", async () => {
    geminiMock.generateContentMock.mockResolvedValue(createGeminiResponse("aGVsbG8="));

    const { nanoBananaProvider } = await importProvider();
    await nanoBananaProvider.submitRequest(
      buildInput({
        requestPayload: {
          nanoBanana: {
            presetId: null,
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 1,
            aspectRatio: "1:1",
            imageSize: "1K",
          },
        },
      }) as never,
    );

    const [request] = geminiMock.generateContentMock.mock.calls[0] ?? [];
    const prompt = String(
      (request as { contents?: Array<{ parts?: Array<{ text?: string }> }> })?.contents?.[0]
        ?.parts?.[0]?.text ?? "",
    );

    expect(prompt).toContain("Strong title");
    expect(prompt).toContain("Zazmic-style");
    expect(prompt).toContain("Post context:");
    expect(prompt).toContain("Create a scroll-stopping LinkedIn visual");
  });

  it("submitRequest clamps variationCount above 4", async () => {
    geminiMock.generateContentMock.mockResolvedValue(createGeminiResponse("aGVsbG8="));

    const { nanoBananaProvider } = await importProvider();
    await nanoBananaProvider.submitRequest(
      buildInput({
        requestPayload: {
          nanoBanana: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 9,
            aspectRatio: "1:1",
            imageSize: "1K",
          },
        },
      }) as never,
    );

    expect(geminiMock.generateContentMock).toHaveBeenCalledTimes(4);
  });

  it("syncRequest maps a completed request to READY with selected first variation", async () => {
    geminiMock.generateContentMock.mockResolvedValue(createGeminiResponse("aGVsbG8="));

    const { nanoBananaProvider } = await importProvider();
    const submitted = await nanoBananaProvider.submitRequest(
      buildInput({
        requestPayload: {
          nanoBanana: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 2,
            aspectRatio: "1:1",
            imageSize: "1K",
          },
        },
      }) as never,
    );

    const result = await nanoBananaProvider.syncRequest({
      externalRequestId: submitted.externalRequestId,
      requestPayload: {},
      resultPayload: {},
    });

    expect(result.state).toBe("READY");
    if (result.state === "READY") {
      const payload = result.payload as {
        requestId: string;
        status: string;
        nanoBanana: {
          variations: Array<{
            id: string;
            label: string;
            dataUrl: string;
            thumbnailUrl: string;
            editUrl: string;
            selected: boolean;
          }>;
        };
      };

      expect(payload.requestId).toBe(submitted.externalRequestId);
      expect(payload.nanoBanana.variations).toHaveLength(2);
      expect(payload.nanoBanana.variations[0]).toMatchObject({
        id: `${submitted.externalRequestId}-v1`,
        label: "Variation 1",
        selected: true,
        dataUrl: expect.stringContaining("data:image/png;base64,"),
      });
      expect(payload.nanoBanana.variations[1]).toMatchObject({
        id: `${submitted.externalRequestId}-v2`,
        label: "Variation 2",
        selected: false,
        dataUrl: expect.stringContaining("data:image/png;base64,"),
      });
      expect(result.asset).toMatchObject({
        designId: `${submitted.externalRequestId}-v1`,
        thumbnailUrl: expect.stringContaining("data:image/png;base64,"),
      });
    }
  });

  it("syncRequest returns FAILED retryable true when the stored result is expired", async () => {
    geminiMock.generateContentMock.mockResolvedValue(createGeminiResponse("aGVsbG8="));

    const { nanoBananaProvider } = await importProvider();
    const submitted = await nanoBananaProvider.submitRequest(
      buildInput({
        requestPayload: {
          nanoBanana: {
            presetId: "hook",
            customPrompt: null,
            resolvedPrompt: null,
            variationCount: 1,
            aspectRatio: "1:1",
            imageSize: "1K",
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

    const result = await nanoBananaProvider.syncRequest({
      externalRequestId: submitted.externalRequestId,
      requestPayload: {},
      resultPayload: {},
    });

    expect(result).toMatchObject({
      state: "FAILED",
      retryable: true,
      errorCode: "NB_RESULT_EXPIRED",
    });
  });

  it("syncRequest returns FAILED retryable false when externalRequestId is missing", async () => {
    const { nanoBananaProvider } = await importProvider();
    const result = await nanoBananaProvider.syncRequest({
      externalRequestId: "",
      requestPayload: {},
      resultPayload: {},
    });

    expect(result).toMatchObject({
      state: "FAILED",
      retryable: false,
      errorCode: "NB_REQUEST_ID_REQUIRED",
    });
  });
});
