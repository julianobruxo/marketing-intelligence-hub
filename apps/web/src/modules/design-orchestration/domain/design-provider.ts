import { z } from "zod";

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

export type DesignRequestExecutionContext = {
  contentItemId: string;
  title: string;
  copy: string;
  templateId: string;
  attemptNumber: number;
  scenario: DesignSimulationScenario;
};

export type SubmittedDesignRequest = {
  externalRequestId: string;
  payload: unknown;
};

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
    };

export interface DesignExecutionProvider {
  submitRequest(input: DesignRequestExecutionContext): Promise<SubmittedDesignRequest>;
  syncRequest(input: {
    externalRequestId: string;
    requestPayload: unknown;
    resultPayload: unknown;
  }): Promise<SyncedDesignRequest>;
}
