import { z } from "zod";
import type {
  DesignExecutionProvider,
  DesignRequestExecutionContext,
  SyncedDesignRequest,
} from "../domain/design-provider";

const submitResponseSchema = z.object({
  job: z.object({
    id: z.string().min(1),
    status: z.literal("accepted"),
  }),
  meta: z.object({
    simulationScenario: z.string(),
    providerMode: z.literal("FAKE_CANVA"),
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
    providerMode: z.literal("FAKE_CANVA"),
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
    providerMode: z.literal("FAKE_CANVA"),
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
    }),
  }),
  meta: z.object({
    simulationScenario: z.string(),
    providerMode: z.literal("FAKE_CANVA"),
    syncCount: z.number().int().nonnegative(),
  }),
});

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getSyncCount(previousPayload: unknown) {
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
    `Fake Canva provider returned an unexpected payload: ${JSON.stringify(rawPayload)}`,
  );
  error.name = "FAKE_PROVIDER_MALFORMED_RESPONSE";
  return error;
}

function buildSubmitPayload(input: DesignRequestExecutionContext) {
  return {
    job: {
      id: `fake-canva-${input.contentItemId}-attempt-${input.attemptNumber}`,
      status: "accepted" as const,
    },
    meta: {
      simulationScenario: input.scenario,
      providerMode: "FAKE_CANVA" as const,
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
          code: "FAKE_PROVIDER_RENDER_FAILED",
          message:
            "The simulated Canva adapter failed while rendering the requested template data.",
        },
      },
      meta: {
        simulationScenario: input.scenario,
        providerMode: "FAKE_CANVA" as const,
        syncCount: input.syncCount + 1,
      },
    };
  }

  if (input.scenario === "MALFORMED_RESPONSE") {
    return {
      broken: true,
      meta: {
        simulationScenario: input.scenario,
        providerMode: "FAKE_CANVA" as const,
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
        providerMode: "FAKE_CANVA" as const,
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
        edit_url: `https://fake.canva.local/designs/${input.externalRequestId}/edit`,
        thumbnail_url: `https://fake.canva.local/designs/${input.externalRequestId}/thumbnail.png`,
      },
    },
    meta: {
      simulationScenario: input.scenario,
      providerMode: "FAKE_CANVA" as const,
      syncCount: input.syncCount + 1,
    },
  };
}

export const fakeCanvaProvider: DesignExecutionProvider = {
  async submitRequest(input) {
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

    const inProgress = syncInProgressSchema.safeParse(rawPayload);

    if (inProgress.success) {
      return {
        state: "IN_PROGRESS",
        payload: rawPayload,
      } satisfies SyncedDesignRequest;
    }

    const failed = syncFailedSchema.safeParse(rawPayload);

    if (failed.success) {
      return {
        state: "FAILED",
        payload: rawPayload,
        errorCode: failed.data.job.error.code,
        errorMessage: failed.data.job.error.message,
      } satisfies SyncedDesignRequest;
    }

    throw buildMalformedProviderError(rawPayload);
  },
};
