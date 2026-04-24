import { z } from "zod";

export const operationalContentStatusSchema = z.enum([
  "BLOCKED",
  "WAITING_FOR_COPY",
  "LATE",
  "READY_FOR_DESIGN",
  "READY_TO_PUBLISH",
  "POSTED",
  "PUBLISHED",
]);

export type OperationalContentStatus = z.infer<typeof operationalContentStatusSchema>;

export const workflowBlockReasonSchema = z.enum(["MISSING_TITLE", "MISSING_COPY"]);

export type WorkflowBlockReason = z.infer<typeof workflowBlockReasonSchema>;

type OperationalStatusInput = {
  planning?: {
    title?: string;
    copyEnglish?: string;
    contentDeadline?: string;
    sourceAssetLink?: string;
  };
  sourceMetadata?: {
    publishedFlag?: string | boolean;
  };
};

export type ContentRoutingDecision = {
  operationalStatus: OperationalContentStatus;
  blockReason?: WorkflowBlockReason;
};

function normalizeBooleanish(value: string | boolean | undefined | null) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === "yes" ||
    normalized === "true" ||
    normalized === "published" ||
    normalized === "done" ||
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "live"
  );
}

export function hasRealCopy(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.trim().length > 0;
}

export function hasImageLink(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.startsWith("http") || trimmed.startsWith("https");
}

function toStatusValue(value: unknown): OperationalContentStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = operationalContentStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function inferContentRouting(input: OperationalStatusInput): ContentRoutingDecision {
  if (
    normalizeBooleanish(input.sourceMetadata?.publishedFlag)
  ) {
    return { operationalStatus: "POSTED" };
  }

  const title = input.planning?.title?.trim() ?? "";
  if (title.length === 0) {
    return { operationalStatus: "BLOCKED", blockReason: "MISSING_TITLE" };
  }

  const copy = input.planning?.copyEnglish?.trim() ?? "";
  if (!hasRealCopy(copy)) {
    return { operationalStatus: "BLOCKED", blockReason: "MISSING_COPY" };
  }

  if (hasImageLink(input.planning?.sourceAssetLink)) {
    return { operationalStatus: "READY_TO_PUBLISH" };
  }

  return { operationalStatus: "READY_FOR_DESIGN" };
}

export function inferContentOperationalStatus(input: OperationalStatusInput): OperationalContentStatus {
  return inferContentRouting(input).operationalStatus;
}

export function readOperationalStatusFromPlanningSnapshot(
  planningSnapshot: unknown,
): OperationalContentStatus | null {
  if (!planningSnapshot || typeof planningSnapshot !== "object") {
    return null;
  }

  const snapshot = planningSnapshot as Record<string, unknown>;
  const workflow = snapshot.workflow;
  if (workflow && typeof workflow === "object") {
    const workflowRecord = workflow as Record<string, unknown>;
    const explicitStatus = toStatusValue(workflowRecord.operationalStatus);
    if (explicitStatus) {
      return explicitStatus;
    }
  }

  const planning = snapshot.planning && typeof snapshot.planning === "object"
    ? (snapshot.planning as Record<string, unknown>)
    : null;
  const normalization = snapshot.normalization && typeof snapshot.normalization === "object"
    ? (snapshot.normalization as Record<string, unknown>)
    : null;
  const titleDerivation =
    normalization?.titleDerivation && typeof normalization.titleDerivation === "object"
      ? (normalization.titleDerivation as Record<string, unknown>)
      : null;
  const sourceMetadata = snapshot.sourceMetadata && typeof snapshot.sourceMetadata === "object"
    ? (snapshot.sourceMetadata as Record<string, unknown>)
    : null;

  return inferContentOperationalStatus({
    planning: planning
      ? {
          title:
            typeof titleDerivation?.title === "string"
              ? titleDerivation.title
              : typeof planning.campaignLabel === "string"
                ? planning.campaignLabel
                : undefined,
          copyEnglish: typeof planning.copyEnglish === "string" ? planning.copyEnglish : undefined,
          contentDeadline: typeof planning.contentDeadline === "string" ? planning.contentDeadline : undefined,
          sourceAssetLink:
            typeof planning.sourceAssetLink === "string" ? planning.sourceAssetLink : undefined,
        }
      : undefined,
    sourceMetadata: sourceMetadata
      ? {
        publishedFlag: sourceMetadata.publishedFlag as string | boolean | undefined,
        }
      : undefined,
  });
}
