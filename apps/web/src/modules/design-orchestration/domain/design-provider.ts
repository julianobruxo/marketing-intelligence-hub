/**
 * Design Execution Provider — adapter interface
 *
 * This file defines the contract that ALL design providers must satisfy:
 * - the mock provider (this package)
 * - future Canva adapter
 * - future Nano Banana adapter
 *
 * Providers receive a DesignInputContract (see design-input-contract.ts)
 * and return structured outputs that the application layer maps onto the
 * workflow state machine.
 *
 * Provider-specific configuration (API keys, endpoints, mode flags) lives
 * in the infrastructure layer, not here.
 */

import { z } from "zod";
import type { DesignInputContract } from "./design-input-contract";

// ─────────────────────────────────────────────────────────────────────────────
// Simulation / test utilities (mock provider only)
// ─────────────────────────────────────────────────────────────────────────────

export const designSimulationScenarioSchema = z.enum([
  "SUCCESS",
  "DELAYED_SUCCESS",
  "FAILURE",
  "MALFORMED_RESPONSE",
]);

export type DesignSimulationScenario = z.infer<typeof designSimulationScenarioSchema>;

export const DEFAULT_DESIGN_SIMULATION_SCENARIO: DesignSimulationScenario = "SUCCESS";

export function parseDesignSimulationScenario(value: FormDataEntryValue | null | undefined) {
  const parsed = designSimulationScenarioSchema.safeParse(value);

  if (!parsed.success) {
    return DEFAULT_DESIGN_SIMULATION_SCENARIO;
  }

  return parsed.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution context — passed to providers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use DesignInputContract directly.
 *
 * Kept for backward compatibility with code that was written against the
 * narrow original shape.  Will be removed once run-canva-design-request.ts
 * is updated to pass DesignInputContract through the adapter boundary.
 */
export type DesignRequestExecutionContext = {
  contentItemId: string;
  title: string;
  copy: string;
  templateId: string;
  attemptNumber: number;
  scenario: DesignSimulationScenario;
};

/**
 * Full execution context passed to providers that implement the current contract.
 * Providers must accept this shape from `submitRequest`.
 */
export type DesignProviderExecutionContext = DesignInputContract & {
  /**
   * Simulation scenario used by mock providers.
   * Real providers must ignore this field.
   */
  scenario: DesignSimulationScenario;

  /**
   * Provider-specific request payload assembled by the application layer.
   * Real adapters use this to read template IDs, field mappings, prompts, and
   * other execution metadata without re-deriving it from the database.
   */
  requestPayload: unknown;
};

// ─────────────────────────────────────────────────────────────────────────────
// Provider output types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returned by submitRequest — the provider has accepted the job.
 * The externalRequestId is used for subsequent syncRequest calls.
 */
export type SubmittedDesignRequest = {
  externalRequestId: string;
  payload: unknown;
};

/**
 * Returned by syncRequest — the current state of an in-flight job.
 */
export type SyncedDesignRequest =
  | {
      state: "IN_PROGRESS";
      payload: unknown;
    }
  | {
      state: "READY";
      payload: unknown;
      asset: {
        designId: string;
        editUrl: string;
        thumbnailUrl: string;
      };
    }
  | {
      state: "FAILED";
      payload: unknown;
      errorCode: string;
      errorMessage: string;
      /**
       * Whether this failure is safe to automatically retry.
       * Providers should set this to false for deterministic failures
       * (invalid template, rejected content) and true for transient ones
       * (rate-limit, timeout).
       */
      retryable?: boolean;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Adapter interface — all providers must implement this
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignExecutionProvider {
  /**
   * Submit a new design execution request to the provider.
   *
   * Implementations must be idempotent with respect to attemptNumber:
   * submitting the same attempt twice must not produce duplicate provider jobs.
   *
   * @throws on unrecoverable submit errors (network down, auth failure, etc.)
   *         The application layer will catch and record as DESIGN_FAILED.
   */
  submitRequest(
    input: DesignProviderExecutionContext,
  ): Promise<SubmittedDesignRequest>;

  /**
   * Poll the current state of a previously submitted job.
   *
   * @param input.externalRequestId  — ID returned by submitRequest
   * @param input.requestPayload     — the payload stored alongside the DesignRequest
   * @param input.resultPayload      — the last result payload (for sync-count tracking)
   *
   * @throws on unrecoverable sync errors.
   *         The application layer will catch and record as DESIGN_FAILED.
   */
  syncRequest(input: {
    externalRequestId: string;
    requestPayload: unknown;
    resultPayload: unknown;
  }): Promise<SyncedDesignRequest>;
}
