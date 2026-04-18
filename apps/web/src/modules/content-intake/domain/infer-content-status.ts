import { z } from "zod";

export const operationalContentStatusSchema = z.enum([
  "WAITING_FOR_COPY",
  "LATE",
  "READY_FOR_DESIGN",
  "PUBLISHED",
]);

export type OperationalContentStatus = z.infer<typeof operationalContentStatusSchema>;

type OperationalStatusInput = {
  planning?: {
    copyEnglish?: string;
    contentDeadline?: string;
  };
  sourceMetadata?: {
    publishedFlag?: string | boolean;
    publishedPostUrl?: string;
  };
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

function parseDateOnlyOrTimestamp(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }

    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toStatusValue(value: unknown): OperationalContentStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = operationalContentStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function inferContentOperationalStatus(input: OperationalStatusInput): OperationalContentStatus {
  if (
    normalizeBooleanish(input.sourceMetadata?.publishedFlag) ||
    Boolean(input.sourceMetadata?.publishedPostUrl)
  ) {
    return "PUBLISHED";
  }

  const copy = input.planning?.copyEnglish?.trim() ?? "";
  if (copy.length === 0) {
    return "WAITING_FOR_COPY";
  }

  const deadlineValue = input.planning?.contentDeadline?.trim() ?? "";
  if (deadlineValue.length > 0) {
    const deadline = parseDateOnlyOrTimestamp(deadlineValue);
    if (deadline && deadline.getTime() < startOfToday().getTime()) {
      return "LATE";
    }
  }

  return "READY_FOR_DESIGN";
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
  const sourceMetadata = snapshot.sourceMetadata && typeof snapshot.sourceMetadata === "object"
    ? (snapshot.sourceMetadata as Record<string, unknown>)
    : null;

  return inferContentOperationalStatus({
    planning: planning
      ? {
          copyEnglish: typeof planning.copyEnglish === "string" ? planning.copyEnglish : undefined,
          contentDeadline: typeof planning.contentDeadline === "string" ? planning.contentDeadline : undefined,
        }
      : undefined,
    sourceMetadata: sourceMetadata
      ? {
          publishedFlag: sourceMetadata.publishedFlag as string | boolean | undefined,
          publishedPostUrl:
            typeof sourceMetadata.publishedPostUrl === "string"
              ? sourceMetadata.publishedPostUrl
              : undefined,
        }
      : undefined,
  });
}
