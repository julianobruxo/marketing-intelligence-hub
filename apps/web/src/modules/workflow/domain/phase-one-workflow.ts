import { ApprovalDecision, ApprovalStage, ContentStatus } from "@prisma/client";

export const PHASE_ONE_WORKFLOW_VERSION = "phase-1.0";

const allowedTransitions: Record<ContentStatus, ContentStatus[]> = {
  [ContentStatus.IMPORTED]: [ContentStatus.IN_REVIEW, ContentStatus.CHANGES_REQUESTED, ContentStatus.CONTENT_APPROVED],
  [ContentStatus.IN_REVIEW]: [ContentStatus.CHANGES_REQUESTED, ContentStatus.CONTENT_APPROVED],
  [ContentStatus.CHANGES_REQUESTED]: [ContentStatus.IN_REVIEW, ContentStatus.CONTENT_APPROVED],
  [ContentStatus.CONTENT_APPROVED]: [
    ContentStatus.DESIGN_REQUESTED,
    ContentStatus.CHANGES_REQUESTED,
    ContentStatus.CONTENT_APPROVED,
  ],
  [ContentStatus.DESIGN_REQUESTED]: [ContentStatus.DESIGN_IN_PROGRESS, ContentStatus.DESIGN_FAILED],
  [ContentStatus.DESIGN_IN_PROGRESS]: [
    ContentStatus.DESIGN_IN_PROGRESS,
    ContentStatus.DESIGN_READY,
    ContentStatus.DESIGN_FAILED,
  ],
  [ContentStatus.DESIGN_FAILED]: [ContentStatus.DESIGN_REQUESTED],
  [ContentStatus.DESIGN_READY]: [ContentStatus.DESIGN_APPROVED, ContentStatus.CHANGES_REQUESTED],
  [ContentStatus.DESIGN_APPROVED]: [
    ContentStatus.TRANSLATION_PENDING,
    ContentStatus.READY_TO_PUBLISH,
  ],
  [ContentStatus.TRANSLATION_PENDING]: [
    ContentStatus.TRANSLATION_APPROVED,
    ContentStatus.CHANGES_REQUESTED,
  ],
  [ContentStatus.TRANSLATION_APPROVED]: [
    ContentStatus.READY_TO_PUBLISH,
    ContentStatus.PUBLISHED_MANUALLY,
  ],
  [ContentStatus.READY_TO_PUBLISH]: [ContentStatus.PUBLISHED_MANUALLY],
  [ContentStatus.PUBLISHED_MANUALLY]: [],
};

export function getAllowedNextContentStatuses(currentStatus: ContentStatus) {
  return allowedTransitions[currentStatus];
}

export function canTransitionContentStatus(
  currentStatus: ContentStatus,
  nextStatus: ContentStatus,
) {
  return allowedTransitions[currentStatus].includes(nextStatus);
}

export function assertContentStatusTransition(input: {
  currentStatus: ContentStatus;
  nextStatus: ContentStatus;
  reason: string;
}) {
  if (canTransitionContentStatus(input.currentStatus, input.nextStatus)) {
    return;
  }

  const allowed = allowedTransitions[input.currentStatus].map((status) => status.toLowerCase());
  throw new Error(
    `Invalid phase-1 transition from ${input.currentStatus} to ${input.nextStatus}. Allowed next states: ${allowed.length > 0 ? allowed.join(", ") : "none"}. Reason: ${input.reason}`,
  );
}

export function resolveApprovalTransition(input: {
  stage: ApprovalStage;
  decision: ApprovalDecision;
}) {
  if (input.stage === ApprovalStage.PUBLISH) {
    return input.decision === ApprovalDecision.APPROVED
      ? ContentStatus.CONTENT_APPROVED
      : ContentStatus.CHANGES_REQUESTED;
  }

  return input.decision === ApprovalDecision.APPROVED
    ? ContentStatus.TRANSLATION_APPROVED
    : ContentStatus.TRANSLATION_PENDING;
}

export function canRecordApprovalAction(input: {
  currentStatus: ContentStatus;
  stage: ApprovalStage;
}) {
  if (input.stage === ApprovalStage.PUBLISH) {
    return (
      input.currentStatus === ContentStatus.IMPORTED ||
      input.currentStatus === ContentStatus.IN_REVIEW ||
      input.currentStatus === ContentStatus.CHANGES_REQUESTED ||
      input.currentStatus === ContentStatus.TRANSLATION_APPROVED
    );
  }

  return (
    input.currentStatus === ContentStatus.CONTENT_APPROVED ||
    input.currentStatus === ContentStatus.TRANSLATION_PENDING
  );
}
