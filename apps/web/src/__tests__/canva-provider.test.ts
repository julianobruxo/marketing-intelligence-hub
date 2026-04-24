import { ContentProfile, ContentType, DesignProvider } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_ENV = {
  NODE_ENV: "test",
  CANVA_PROVIDER_MODE: "REAL",
  CANVA_API_URL: "https://api.canva.com/rest/v1",
  CANVA_API_KEY: "canva-token",
};

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

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function importProvider() {
  vi.resetModules();
  return import("@/modules/design-orchestration/infrastructure/canva-provider");
}

function buildInput(overrides: Record<string, unknown> = {}) {
  return {
    contentItemId: "content-item-1",
    canonicalKey: "sheet-1:worksheet-2:row-3",
    title: "Strong title",
    copy: "Final approved copy.",
    contentType: ContentType.STATIC_POST,
    profile: ContentProfile.SHAWN,
    sourceLocale: "en",
    translationRequired: false,
    translationCopy: null,
    platformLabel: null,
    templateId: "template-123",
    preferredDesignProvider: DesignProvider.CANVA,
    attemptNumber: 1,
    plannedDate: undefined,
    scenario: "SUCCESS",
    requestPayload: {
      templateId: "template-123",
      fieldMappings: {
        TITLE: "Headline",
        BODY: "Body copy",
      },
    },
    ...overrides,
  };
}

describe("canvaProvider", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    restoreEnv = setProcessEnv(TEST_ENV);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    restoreEnv?.();
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("submitRequest accepts a valid payload and forwards the Canva autofill body", async () => {
    fetchMock.mockResolvedValueOnce(createJsonResponse({ job: { id: "job-123" } }));

    const { canvaProvider } = await importProvider();
    const result = await canvaProvider.submitRequest(buildInput() as never);

    expect(result.externalRequestId).toBe("job-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/autofills");

    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toEqual({
      brand_template_id: "template-123",
      data: {
        TITLE: { type: "text", text: "Headline" },
        BODY: { type: "text", text: "Body copy" },
      },
    });
  });

  it("submitRequest rejects when templateId is missing", async () => {
    const { canvaProvider } = await importProvider();

    await expect(
      canvaProvider.submitRequest(
        buildInput({
          requestPayload: {
            fieldMappings: {
              TITLE: "Headline",
            },
          },
        }) as never,
      ),
    ).rejects.toMatchObject({
      name: "CANVA_REQUEST_VALIDATION_ERROR",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submitRequest rejects when fieldMappings are missing", async () => {
    const { canvaProvider } = await importProvider();

    await expect(
      canvaProvider.submitRequest(
        buildInput({
          requestPayload: {
            templateId: "template-123",
          },
        }) as never,
      ),
    ).rejects.toMatchObject({
      name: "CANVA_REQUEST_VALIDATION_ERROR",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submitRequest throws a clear network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const { canvaProvider } = await importProvider();

    await expect(canvaProvider.submitRequest(buildInput() as never)).rejects.toThrow(
      "Canva submit failed due to a network error",
    );
  });

  it("syncRequest maps a completed Canva job to READY with a single variation", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        job: {
          id: "job-123",
          status: "success",
          result: {
            type: "create_design",
            design: {
              url: "https://www.canva.com/design/design-123/edit",
              thumbnail: {
                url: "https://export-download.canva.com/thumb.png",
              },
            },
          },
        },
      }),
    );

    const { canvaProvider } = await importProvider();
    const result = await canvaProvider.syncRequest({
      externalRequestId: "job-123",
      requestPayload: {},
      resultPayload: {},
    });

    expect(result.state).toBe("READY");
    if (result.state === "READY") {
      expect(result.payload).toMatchObject({
        variations: [
          {
            id: "primary",
            url: "https://www.canva.com/design/design-123/edit",
            thumbnailUrl: "https://export-download.canva.com/thumb.png",
            selected: true,
          },
        ],
      });
      expect(result.asset).toMatchObject({
        designId: "primary",
        editUrl: "https://www.canva.com/design/design-123/edit",
        thumbnailUrl: "https://export-download.canva.com/thumb.png",
      });
    }
  });

  it("syncRequest maps an in-progress Canva job to IN_PROGRESS", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        job: {
          id: "job-123",
          status: "in_progress",
        },
      }),
    );

    const { canvaProvider } = await importProvider();
    const result = await canvaProvider.syncRequest({
      externalRequestId: "job-123",
      requestPayload: {},
      resultPayload: {},
    });

    expect(result.state).toBe("IN_PROGRESS");
  });

  it("syncRequest marks recoverable Canva failures as retryable", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        job: {
          id: "job-123",
          status: "failed",
          error: {
            code: "autofill_error",
            message: "Temporary renderer outage",
          },
        },
      }),
    );

    const { canvaProvider } = await importProvider();
    const result = await canvaProvider.syncRequest({
      externalRequestId: "job-123",
      requestPayload: {},
      resultPayload: {},
    });

    expect(result).toMatchObject({
      state: "FAILED",
      retryable: true,
      errorCode: "autofill_error",
    });
  });

  it("syncRequest marks template-invalid Canva failures as terminal", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        job: {
          id: "job-123",
          status: "failed",
          error: {
            code: "not_found",
            message: "Job not found",
          },
        },
      }),
    );

    const { canvaProvider } = await importProvider();
    const result = await canvaProvider.syncRequest({
      externalRequestId: "job-123",
      requestPayload: {},
      resultPayload: {},
    });

    expect(result).toMatchObject({
      state: "FAILED",
      retryable: false,
      errorCode: "not_found",
    });
  });

  it("syncRequest treats transport failures as retryable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const { canvaProvider } = await importProvider();
    const result = await canvaProvider.syncRequest({
      externalRequestId: "job-123",
      requestPayload: {},
      resultPayload: {},
    });

    expect(result).toMatchObject({
      state: "FAILED",
      retryable: true,
      errorCode: "CANVA_NETWORK_ERROR",
    });
  });
});
