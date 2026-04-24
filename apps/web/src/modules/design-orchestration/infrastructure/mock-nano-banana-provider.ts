/**
 * Mock Nano Banana Provider — phase-1.0
 *
 * Simulates the Nano Banana AI visual generation service
 * (DesignProvider.AI_VISUAL).  Returns multiple design variations on sync
 * so the operator can review and select one.
 *
 * Differences from mockDesignProvider (Canva mock):
 *   - resultPayload includes a `variations` array
 *   - The "selected" asset defaults to the first variation
 *   - DELAYED_SUCCESS requires one poll before resolving (same as Canva mock)
 *
 * Swap this out for a real Nano Banana HTTP adapter by implementing
 * DesignExecutionProvider and updating design-provider-registry.ts.
 */

import type {
  DesignExecutionProvider,
  DesignProviderExecutionContext,
  SyncedDesignRequest,
} from "../domain/design-provider";

const VARIATION_COUNT_DEFAULT = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
  const s = (execution as Record<string, unknown>).simulationScenario;
  return typeof s === "string" ? s : "SUCCESS";
}

function getVariationCount(requestPayload: unknown): number {
  if (!requestPayload || typeof requestPayload !== "object") return VARIATION_COUNT_DEFAULT;
  const nb = (requestPayload as Record<string, unknown>).nanoBanana;
  if (!nb || typeof nb !== "object") return VARIATION_COUNT_DEFAULT;
  const count = (nb as Record<string, unknown>).variationCount;
  return typeof count === "number" && count > 0 ? Math.min(count, 4) : VARIATION_COUNT_DEFAULT;
}

function buildVariations(
  externalRequestId: string,
  count: number,
): Array<{ id: string; thumbnailUrl: string; editUrl: string; label: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: `${externalRequestId}-v${i + 1}`,
    thumbnailUrl: `https://mock.design.local/nb/${externalRequestId}/v${i + 1}/thumbnail.png`,
    editUrl: `https://mock.design.local/nb/${externalRequestId}/v${i + 1}/edit`,
    label: `Variation ${i + 1}`,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider implementation
// ─────────────────────────────────────────────────────────────────────────────

export const mockNanaBananaProvider: DesignExecutionProvider = {
  async submitRequest(input: DesignProviderExecutionContext) {
    await sleep(220);

    const jobId = `nb-${input.contentItemId}-attempt-${input.attemptNumber}`;

    return {
      externalRequestId: jobId,
      payload: {
        job: {
          id: jobId,
          status: "accepted",
        },
        meta: {
          simulationScenario: input.scenario,
          providerMode: "MOCK_NB" as const,
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

    // Deterministic failure
    if (scenario === "FAILURE") {
      return {
        state: "FAILED",
        payload: {
          job: { id: input.externalRequestId, status: "failed" },
          meta: { simulationScenario: scenario, providerMode: "MOCK_NB", syncCount: syncCount + 1 },
        },
        errorCode: "NB_RENDER_FAILED",
        errorMessage: "The Nano Banana mock simulated a render failure.",
        retryable: false,
      } satisfies SyncedDesignRequest;
    }

    // Malformed response
    if (scenario === "MALFORMED_RESPONSE") {
      throw new Error("Mock Nano Banana returned an unparseable response.");
    }

    // Delayed success: first poll returns in-progress
    if (scenario === "DELAYED_SUCCESS" && syncCount === 0) {
      return {
        state: "IN_PROGRESS",
        payload: {
          job: { id: input.externalRequestId, status: "in_progress", progress: 0.45 },
          meta: {
            simulationScenario: scenario,
            providerMode: "MOCK_NB",
            syncCount: 1,
            remainingPolls: 1,
          },
        },
      } satisfies SyncedDesignRequest;
    }

    // Ready — return multiple variations
    const variations = buildVariations(input.externalRequestId, variationCount);
    const first = variations[0];

    return {
      state: "READY",
      payload: {
        job: { id: input.externalRequestId, status: "success" },
        meta: {
          simulationScenario: scenario,
          providerMode: "MOCK_NB",
          syncCount: syncCount + 1,
        },
        // Nano Banana-specific: all generated variations
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
