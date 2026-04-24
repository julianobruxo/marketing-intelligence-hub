import { MAX_SYNC_FAILURES, type DesignSyncFailureRecord } from "./design-sync-config";

type SyncPayloadRecord = Record<string, unknown>;

function toRecord(payload: unknown): SyncPayloadRecord {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  return payload as SyncPayloadRecord;
}

function normalizeFailure(value: unknown): DesignSyncFailureRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const attempt = typeof record.attempt === "number" ? record.attempt : null;
  const errorCode = typeof record.errorCode === "string" ? record.errorCode : null;
  const errorMessage = typeof record.errorMessage === "string" ? record.errorMessage : null;
  const retryable = typeof record.retryable === "boolean" ? record.retryable : null;
  const recordedAt = typeof record.recordedAt === "string" ? record.recordedAt : null;
  const stage = typeof record.stage === "string" ? record.stage : null;

  if (
    attempt === null ||
    !errorCode ||
    !errorMessage ||
    retryable === null ||
    !recordedAt ||
    !stage
  ) {
    return null;
  }

  return {
    attempt,
    errorCode,
    errorMessage,
    retryable,
    recordedAt,
    stage,
  };
}

function normalizeFailureList(payload: SyncPayloadRecord): DesignSyncFailureRecord[] {
  const rawFailures = Array.isArray(payload.syncFailures) ? payload.syncFailures : [];
  const normalizedFailures = rawFailures
    .map((entry) => normalizeFailure(entry))
    .filter((entry): entry is DesignSyncFailureRecord => entry !== null);

  const lastSyncFailure = normalizeFailure(payload.lastSyncFailure);

  if (!lastSyncFailure) {
    return normalizedFailures;
  }

  if (normalizedFailures.length === 0) {
    return [lastSyncFailure];
  }

  const lastEntry = normalizedFailures[normalizedFailures.length - 1];
  if (
    lastEntry.attempt === lastSyncFailure.attempt &&
    lastEntry.errorCode === lastSyncFailure.errorCode &&
    lastEntry.errorMessage === lastSyncFailure.errorMessage &&
    lastEntry.retryable === lastSyncFailure.retryable &&
    lastEntry.recordedAt === lastSyncFailure.recordedAt &&
    lastEntry.stage === lastSyncFailure.stage
  ) {
    return normalizedFailures;
  }

  return [...normalizedFailures, lastSyncFailure];
}

export type DesignSyncState = {
  syncFailures: DesignSyncFailureRecord[];
  failureCount: number;
  maxSyncFailures: number;
  retryable: boolean | null;
  lastSyncStatus: string | null;
  latestFailure: DesignSyncFailureRecord | null;
};

export function getDesignSyncState(payload: unknown): DesignSyncState {
  const record = toRecord(payload);
  const syncFailures = normalizeFailureList(record);
  const latestFailure = syncFailures[syncFailures.length - 1] ?? null;
  const maxSyncFailures =
    typeof record.maxSyncFailures === "number" && Number.isFinite(record.maxSyncFailures)
      ? record.maxSyncFailures
      : MAX_SYNC_FAILURES;
  const retryable =
    typeof record.retryable === "boolean" ? record.retryable : latestFailure?.retryable ?? null;
  const lastSyncStatus = typeof record.lastSyncStatus === "string" ? record.lastSyncStatus : null;

  return {
    syncFailures,
    failureCount: syncFailures.length,
    maxSyncFailures,
    retryable,
    lastSyncStatus,
    latestFailure,
  };
}

export function getDesignSyncFailureCount(payload: unknown): number {
  return getDesignSyncState(payload).failureCount;
}

export function getDesignSyncRetryableFlag(payload: unknown): boolean | null {
  return getDesignSyncState(payload).retryable;
}

export function mergeDesignSyncPayload(
  previousPayload: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const record = toRecord(previousPayload);
  const state = getDesignSyncState(record);

  return {
    ...record,
    ...patch,
    syncFailures: state.syncFailures,
    failureCount: state.failureCount,
    maxSyncFailures: state.maxSyncFailures,
  };
}

export function appendDesignSyncFailure(
  previousPayload: unknown,
  failure: DesignSyncFailureRecord,
): Record<string, unknown> {
  const record = toRecord(previousPayload);
  const state = getDesignSyncState(record);
  const syncFailures = [...state.syncFailures, failure];

  return {
    ...record,
    syncFailures,
    failureCount: syncFailures.length,
    maxSyncFailures: state.maxSyncFailures,
    lastSyncFailure: failure,
    lastSyncStatus: "FAILED",
    retryable: failure.retryable,
    errorCode: failure.errorCode,
    errorMessage: failure.errorMessage,
  };
}
