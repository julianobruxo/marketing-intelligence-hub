import { z } from "zod";
import type {
  DesignExecutionProvider,
  DesignProviderExecutionContext,
  SubmittedDesignRequest,
  SyncedDesignRequest,
} from "../domain/design-provider";
import {
  CanvaApiError,
  CanvaTransportError,
  checkAutofillJob,
  submitAutofill,
  type CanvaAutofillJobSummary,
} from "./canva-client";

const canvaRequestPayloadSchema = z
  .object({
    templateId: z.string().min(1).optional(),
    fieldMappings: z.record(z.string(), z.string()).optional(),
    data: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error instanceof CanvaApiError
        ? { status: error.status, code: error.code }
        : error instanceof CanvaTransportError
          ? { cause: String(error.causeError) }
          : {}),
    };
  }

  return { message: String(error) };
}

function buildRequestValidationError(message: string) {
  const error = new Error(message);
  error.name = "CANVA_REQUEST_VALIDATION_ERROR";
  return error;
}

function parseRequestPayload(requestPayload: unknown) {
  const parsed = canvaRequestPayloadSchema.safeParse(requestPayload);

  if (!parsed.success) {
    throw buildRequestValidationError(`Canva request payload is invalid: ${parsed.error.message}`);
  }

  const templateId = parsed.data.templateId?.trim();
  const fieldMappings = parsed.data.fieldMappings ?? parsed.data.data;

  if (!templateId) {
    throw buildRequestValidationError("Canva requestPayload.templateId is required.");
  }

  if (!fieldMappings || Object.keys(fieldMappings).length === 0) {
    throw buildRequestValidationError(
      "Canva requestPayload.fieldMappings must contain at least one field.",
    );
  }

  return {
    templateId,
    fieldMappings,
  };
}

function isTerminalCanvaError(error: CanvaApiError) {
  if (error.status === 401 || error.status === 403 || error.status === 404) {
    return true;
  }

  const normalized = `${error.code ?? ""} ${error.message}`.toLowerCase();
  return /(invalid|not found|permission|forbidden|unsupported|rejected|bad request|missing)/.test(
    normalized,
  );
}

function isRetryableCanvaFailure(summary: CanvaAutofillJobSummary) {
  if (summary.status !== "FAILED") {
    return false;
  }

  const normalized = `${summary.errorCode} ${summary.errorMessage}`.toLowerCase();
  if (/(invalid|not found|permission|forbidden|unsupported|rejected|bad request|missing)/.test(normalized)) {
    return false;
  }

  return true;
}

function buildSuccessPayload(summary: Extract<CanvaAutofillJobSummary, { status: "SUCCESS" }>) {
  return {
    job: {
      id: summary.jobId,
      status: "success" as const,
      result: {
        type: "create_design" as const,
        design: {
          url: summary.designUrl,
          thumbnail: summary.thumbnailUrl ? { url: summary.thumbnailUrl } : null,
        },
      },
    },
    variations: [
      {
        id: "primary",
        url: summary.designUrl,
        thumbnailUrl: summary.thumbnailUrl,
        selected: true,
      },
    ],
  };
}

function buildFailurePayload(summary: Extract<CanvaAutofillJobSummary, { status: "FAILED" }>) {
  return {
    job: {
      id: summary.jobId,
      status: "failed" as const,
      error: {
        code: summary.errorCode,
        message: summary.errorMessage,
      },
    },
  };
}

function logCanvaProviderError(stage: string, context: Record<string, unknown>, error: unknown) {
  console.error("[canva-provider]", {
    stage,
    ...context,
    error: serializeError(error),
  });
}

export const canvaProvider: DesignExecutionProvider = {
  async submitRequest(input: DesignProviderExecutionContext): Promise<SubmittedDesignRequest> {
    const requestPayload = parseRequestPayload(input.requestPayload);

    try {
      const submitted = await submitAutofill({
        templateId: requestPayload.templateId,
        fieldMappings: requestPayload.fieldMappings,
      });

      return {
        externalRequestId: submitted.job.id,
        payload: {
          job: submitted.job,
          templateId: requestPayload.templateId,
        },
      };
    } catch (error) {
      logCanvaProviderError(
        "submitRequest",
        {
          contentItemId: input.contentItemId,
          templateId: requestPayload.templateId,
        },
        error,
      );

      if (error instanceof CanvaTransportError) {
        throw new Error(`Canva submit failed due to a network error: ${error.message}`);
      }

      if (error instanceof CanvaApiError) {
        if (isTerminalCanvaError(error)) {
          const businessError = new Error(error.message);
          businessError.name =
            error.code === "not_found" ? "CANVA_TEMPLATE_INVALID" : error.code ?? "CANVA_API_ERROR";
          throw businessError;
        }

        const retryableError = new Error(error.message);
        retryableError.name = error.code ?? "CANVA_RETRYABLE_ERROR";
        throw retryableError;
      }

      throw new Error(
        `Canva submit failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },

  async syncRequest(input) {
    try {
      const jobStatus = await checkAutofillJob(input.externalRequestId);

      if (jobStatus.status === "IN_PROGRESS") {
        return {
          state: "IN_PROGRESS",
          payload: {
            job: {
              id: jobStatus.jobId,
              status: "in_progress" as const,
            },
          },
        } satisfies SyncedDesignRequest;
      }

      if (jobStatus.status === "FAILED") {
        return {
          state: "FAILED",
          payload: buildFailurePayload(jobStatus),
          errorCode: jobStatus.errorCode,
          errorMessage: jobStatus.errorMessage,
          retryable: isRetryableCanvaFailure(jobStatus),
        } satisfies SyncedDesignRequest;
      }

      const payload = buildSuccessPayload(jobStatus);

      return {
        state: "READY",
        payload,
        asset: {
          designId: "primary",
          editUrl: jobStatus.designUrl,
          thumbnailUrl: jobStatus.thumbnailUrl ?? jobStatus.designUrl,
        },
      } satisfies SyncedDesignRequest;
    } catch (error) {
      logCanvaProviderError(
        "syncRequest",
        {
          externalRequestId: input.externalRequestId,
        },
        error,
      );

      if (error instanceof CanvaTransportError) {
        return {
          state: "FAILED",
          payload: {
            job: {
              id: input.externalRequestId,
              status: "failed" as const,
              error: {
                code: "CANVA_NETWORK_ERROR",
                message: error.message,
              },
            },
          },
          errorCode: "CANVA_NETWORK_ERROR",
          errorMessage: error.message,
          retryable: true,
        } satisfies SyncedDesignRequest;
      }

      if (error instanceof CanvaApiError) {
        return {
          state: "FAILED",
          payload: {
            job: {
              id: input.externalRequestId,
              status: "failed" as const,
              error: {
                code: error.code ?? "CANVA_API_ERROR",
                message: error.message,
              },
            },
          },
          errorCode: error.code ?? "CANVA_API_ERROR",
          errorMessage: error.message,
          retryable: !isTerminalCanvaError(error),
        } satisfies SyncedDesignRequest;
      }

      const message =
        error instanceof Error ? error.message : "Unknown Canva sync failure occurred.";

      return {
        state: "FAILED",
        payload: {
          job: {
            id: input.externalRequestId,
            status: "failed" as const,
            error: {
              code: "CANVA_SYNC_FAILED",
              message,
            },
          },
        },
        errorCode: "CANVA_SYNC_FAILED",
        errorMessage: message,
        retryable: true,
      } satisfies SyncedDesignRequest;
    }
  },
};
