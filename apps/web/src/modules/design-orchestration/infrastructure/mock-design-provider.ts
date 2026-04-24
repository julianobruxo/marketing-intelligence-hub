/**
 * Mock Design Provider — phase-1.0
 *
 * A self-contained mock that simulates the full design execution lifecycle:
 *   submitRequest  → accepts any DesignProviderExecutionContext
 *   syncRequest    → resolves based on the simulation scenario embedded
 *                    in the requestPayload
 *
 * This provider is scenario-driven and is intended for:
 *   - local development
 *   - integration testing
 *   - UI/workflow validation before a real provider is connected
 *
 * It is NOT tied to any specific external provider (Canva, Nano Banana, …).
 * The providerMode tag in payloads is "MOCK" to reflect this.
 *
 * How to swap in a real provider:
 *   1. Implement DesignExecutionProvider in a new file under infrastructure/
 *   2. Update design-provider-registry.ts to return your implementation
 *      (conditioned on an env var or provider config flag)
 *   3. The application layer (run-canva-design-request.ts) and the workflow
 *      contract require zero changes.
 */

import { z } from "zod";
import type {
  DesignExecutionProvider,
  DesignProviderExecutionContext,
  SyncedDesignRequest,
} from "../domain/design-provider";

// ─────────────────────────────────────────────────────────────────────────────
// Internal payload schemas (used for validation / structured logging)
// ─────────────────────────────────────────────────────────────────────────────

const submitResponseSchema = z.object({
  job: z.object({
    id: z.string().min(1),
    status: z.literal("accepted"),
  }),
  meta: z.object({
    simulationScenario: z.string(),
    providerMode: z.literal("MOCK"),
    profile: z.string().optional(),
    contentType: z.string().optional(),
    locale: z.string().optional(),
    templateId: z.string().optional(),
  }),
});

const syncSuccessSchema = z.object({
  job: z.object({
    id: z.string().min(1),
    status: z.literal("success"),
    result: z.object({
      design_id: z.string().min(1),
      edit_url: z.string().url(),
      thumbnail_url: z.string().url(),
    }),
  }),
  meta: z.object({
    simulationScenario: z.string(),
    providerMode: z.literal("MOCK"),
    syncCount: z.number().int().nonnegative(),
  }),
});

const syncInProgressSchema = z.object({
  job: z.object({
    id: z.string().min(1),
    status: z.literal("in_progress"),
    progress: z.number().min(0).max(1),
  }),
  meta: z.object({
    simulationScenario: z.string(),
    providerMode: z.literal("MOCK"),
    syncCount: z.number().int().nonnegative(),
    remainingPolls: z.number().int().nonnegative(),
  }),
});

const syncFailedSchema = z.object({
  job: z.object({
    id: z.string().min(1),
    status: z.literal("failed"),
    error: z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      retryable: z.boolean(),
    }),
  }),
  meta: z.object({
    simulationScenario: z.string(),
    providerMode: z.literal("MOCK"),
    syncCount: z.number().int().nonnegative(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getSyncCount(previousPayload: unknown): number {
  if (!previousPayload || typeof previousPayload !== "object") {
    return 0;
  }

  const payload = previousPayload as Record<string, unknown>;
  const meta =
    payload.meta && typeof payload.meta === "object"
      ? (payload.meta as Record<string, unknown>)
      : null;

  return typeof meta?.syncCount === "number" ? meta.syncCount : 0;
}

function buildMalformedProviderError(rawPayload: unknown) {
  const error = new Error(
    `Mock design provider returned an unexpected payload: ${JSON.stringify(rawPayload)}`,
  );
  error.name = "MOCK_PROVIDER_MALFORMED_RESPONSE";
  return error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builders
// ─────────────────────────────────────────────────────────────────────────────

function buildSubmitPayload(input: DesignProviderExecutionContext) {
  return {
    job: {
      id: `mock-design-${input.contentItemId}-attempt-${input.attemptNumber}`,
      status: "accepted" as const,
    },
    meta: {
      simulationScenario: input.scenario,
      providerMode: "MOCK" as const,
      // Routing hints preserved in the payload for auditability
      profile: input.profile as string,
      contentType: input.contentType as string,
      locale: input.sourceLocale,
      templateId: input.templateId,
    },
  };
}

function buildSyncPayload(input: {
  externalRequestId: string;
  scenario: string;
  syncCount: number;
}) {
  if (input.scenario === "FAILURE") {
    return {
      job: {
        id: input.externalRequestId,
        status: "failed" as const,
        error: {
          code: "MOCK_PROVIDER_RENDER_FAILED",
          message:
            "The mock design provider simulated a deterministic render failure.",
          retryable: false,
        },
      },
      meta: {
        simulationScenario: input.scenario,
        providerMode: "MOCK" as const,
        syncCount: input.syncCount + 1,
      },
    };
  }

  if (input.scenario === "MALFORMED_RESPONSE") {
    // Intentionally malformed — will fail schema validation downstream
    return {
      broken: true,
      meta: {
        simulationScenario: input.scenario,
        providerMode: "MOCK" as const,
        syncCount: input.syncCount + 1,
      },
    };
  }

  if (input.scenario === "DELAYED_SUCCESS" && input.syncCount === 0) {
    return {
      job: {
        id: input.externalRequestId,
        status: "in_progress" as const,
        progress: 0.58,
      },
      meta: {
        simulationScenario: input.scenario,
        providerMode: "MOCK" as const,
        syncCount: 1,
        remainingPolls: 1,
      },
    };
  }

  return {
    job: {
      id: input.externalRequestId,
      status: "success" as const,
      result: {
        design_id: `${input.externalRequestId}-design`,
        edit_url: `https://mock.design.local/designs/${input.externalRequestId}/edit`,
        thumbnail_url: `https://mock.design.local/designs/${input.externalRequestId}/thumbnail.png`,
      },
    },
    meta: {
      simulationScenario: input.scenario,
      providerMode: "MOCK" as const,
      syncCount: input.syncCount + 1,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider implementation
// ─────────────────────────────────────────────────────────────────────────────

export const mockDesignProvider: DesignExecutionProvider = {
  async submitRequest(input: DesignProviderExecutionContext) {
    await sleep(200);
    const rawPayload = buildSubmitPayload(input);
    const parsed = submitResponseSchema.safeParse(rawPayload);

    if (!parsed.success) {
      throw buildMalformedProviderError(rawPayload);
    }

    return {
      externalRequestId: parsed.data.job.id,
      payload: rawPayload,
    };
  },

  async syncRequest(input) {
    await sleep(250);

    const requestPayload =
      input.requestPayload && typeof input.requestPayload === "object"
        ? (input.requestPayload as Record<string, unknown>)
        : null;

    // Scenario is stored in the request payload under execution.simulationScenario
    // for backward compatibility with the Canva-shaped payload structure.
    const execution =
      requestPayload?.execution && typeof requestPayload.execution === "object"
        ? (requestPayload.execution as Record<string, unknown>)
        : null;

    const scenario =
      typeof execution?.simulationScenario === "string"
        ? execution.simulationScenario
        : "SUCCESS";

    const syncCount = getSyncCount(input.resultPayload);

    const rawPayload = buildSyncPayload({
      externalRequestId: input.externalRequestId,
      scenario,
      syncCount,
    });

    // Evaluate success first
    const success = syncSuccessSchema.safeParse(rawPayload);
    if (success.success) {
      return {
        state: "READY",
        payload: rawPayload,
        asset: {
          designId: success.data.job.result.design_id,
          editUrl: success.data.job.result.edit_url,
          thumbnailUrl: success.data.job.result.thumbnail_url,
        },
      } satisfies SyncedDesignRequest;
    }

    // Evaluate in-progress
    const inProgress = syncInProgressSchema.safeParse(rawPayload);
    if (inProgress.success) {
      return {
        state: "IN_PROGRESS",
        payload: rawPayload,
      } satisfies SyncedDesignRequest;
    }

    // Evaluate failure
    const failed = syncFailedSchema.safeParse(rawPayload);
    if (failed.success) {
      return {
        state: "FAILED",
        payload: rawPayload,
        errorCode: failed.data.job.error.code,
        errorMessage: failed.data.job.error.message,
        retryable: failed.data.job.error.retryable,
      } satisfies SyncedDesignRequest;
    }

    throw buildMalformedProviderError(rawPayload);
  },
};
