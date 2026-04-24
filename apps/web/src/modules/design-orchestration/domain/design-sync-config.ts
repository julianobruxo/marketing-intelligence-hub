export const MAX_SYNC_FAILURES = 5;
export const SYNC_FAILURE_IS_RETRYABLE_WINDOW = 5;

export type DesignSyncFailureRecord = {
  attempt: number;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  recordedAt: string;
  stage: string;
};
