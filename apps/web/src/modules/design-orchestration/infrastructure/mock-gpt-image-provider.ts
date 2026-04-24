import type {
  DesignExecutionProvider,
  DesignProviderExecutionContext,
  SyncedDesignRequest,
} from "../domain/design-provider";

const VARIATION_COUNT_DEFAULT = 3;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getSyncCount(previousPayload: unknown): number {
  if (!previousPayload || typeof previousPayload !== "object") return 0;
  const meta = (previousPayload as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") return 0;
  const count = (meta as Record<string, unknown>).syncCount;
  return typeof count === "number" ? count : 0;
}

function getScenario(requestPayload: unknown): string {
  if (!requestPayload || typeof requestPayload !== "object") return "SUCCESS";
  const execution = (requestPayload as Record<string, unknown>).execution;
  if (!execution || typeof execution !== "object") return "SUCCESS";
  const scenario = (execution as Record<string, unknown>).simulationScenario;
  return typeof scenario === "string" ? scenario : "SUCCESS";
}

function getVariationCount(requestPayload: unknown): number {
  if (!requestPayload || typeof requestPayload !== "object") return VARIATION_COUNT_DEFAULT;
  const payload = requestPayload as Record<string, unknown>;
  const gptImage = payload.gptImage;
  const nanoBanana = payload.nanoBanana;
  const providerPayload =
    gptImage && typeof gptImage === "object"
      ? (gptImage as Record<string, unknown>)
      : nanoBanana && typeof nanoBanana === "object"
        ? (nanoBanana as Record<string, unknown>)
        : null;
  const count = providerPayload?.variationCount;
  return typeof count === "number" && count > 0 ? Math.min(count, 4) : VARIATION_COUNT_DEFAULT;
}

function buildVariations(
  externalRequestId: string,
  count: number,
): Array<{ id: string; thumbnailUrl: string; editUrl: string; label: string }> {
  return Array.from({ length: count }, (_, index) => ({
    id: `${externalRequestId}-v${index + 1}`,
    thumbnailUrl: `https://mock.design.local/gpt-image/${externalRequestId}/v${index + 1}/thumbnail.png`,
    editUrl: `https://mock.design.local/gpt-image/${externalRequestId}/v${index + 1}/edit`,
    label: `Variation ${index + 1}`,
  }));
}

export const mockGptImageProvider: DesignExecutionProvider = {
  async submitRequest(input: DesignProviderExecutionContext) {
    await sleep(220);

    const jobId = `gpt-img-${input.contentItemId}-attempt-${input.attemptNumber}`;

    return {
      externalRequestId: jobId,
      payload: {
        job: {
          id: jobId,
          status: "accepted",
        },
        meta: {
          simulationScenario: input.scenario,
          providerMode: "MOCK_GPT_IMAGE" as const,
          profile: input.profile as string,
          contentType: input.contentType as string,
          locale: input.sourceLocale,
        },
      },
    };
  },

  async syncRequest(input) {
    await sleep(260);

    const scenario = getScenario(input.requestPayload);
    const syncCount = getSyncCount(input.resultPayload);
    const variationCount = getVariationCount(input.requestPayload);

    if (scenario === "FAILURE") {
      return {
        state: "FAILED",
        payload: {
          job: { id: input.externalRequestId, status: "failed" },
          meta: {
            simulationScenario: scenario,
            providerMode: "MOCK_GPT_IMAGE",
            syncCount: syncCount + 1,
          },
        },
        errorCode: "GPT_IMAGE_RENDER_FAILED",
        errorMessage: "The GPT Image mock simulated a render failure.",
        retryable: false,
      } satisfies SyncedDesignRequest;
    }

    if (scenario === "MALFORMED_RESPONSE") {
      throw new Error("Mock GPT Image returned an unparseable response.");
    }

    if (scenario === "DELAYED_SUCCESS" && syncCount === 0) {
      return {
        state: "IN_PROGRESS",
        payload: {
          job: { id: input.externalRequestId, status: "in_progress", progress: 0.45 },
          meta: {
            simulationScenario: scenario,
            providerMode: "MOCK_GPT_IMAGE",
            syncCount: 1,
            remainingPolls: 1,
          },
        },
      } satisfies SyncedDesignRequest;
    }

    const variations = buildVariations(input.externalRequestId, variationCount);
    const first = variations[0];

    return {
      state: "READY",
      payload: {
        job: { id: input.externalRequestId, status: "success" },
        meta: {
          simulationScenario: scenario,
          providerMode: "MOCK_GPT_IMAGE",
          syncCount: syncCount + 1,
        },
        gptImage: {
          variations,
          selectedVariationId: first.id,
        },
        nanoBanana: {
          variations,
          selectedVariationId: first.id,
        },
      },
      asset: {
        designId: first.id,
        editUrl: first.editUrl,
        thumbnailUrl: first.thumbnailUrl,
      },
    } satisfies SyncedDesignRequest;
  },
};
