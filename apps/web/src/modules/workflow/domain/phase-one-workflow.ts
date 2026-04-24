import { ApprovalDecision, ApprovalStage, ContentStatus } from "@prisma/client";

export const PHASE_ONE_WORKFLOW_VERSION = "phase-1.0";

const allowedTransitions: Record<ContentStatus, ContentStatus[]> = {
  // ── New intake ──────────────────────────────────────────────────────────
  [ContentStatus.BLOCKED]: [ContentStatus.READY_FOR_DESIGN],
  [ContentStatus.WAITING_FOR_COPY]: [ContentStatus.READY_FOR_DESIGN],
  [ContentStatus.READY_FOR_DESIGN]: [
    ContentStatus.IN_DESIGN,
    ContentStatus.DESIGN_REQUESTED, // legacy compat
    ContentStatus.DESIGN_FAILED,
  ],

  // ── New design ──────────────────────────────────────────────────────────
  [ContentStatus.IN_DESIGN]: [
    ContentStatus.READY_FOR_DESIGN,
    ContentStatus.DESIGN_READY,
    ContentStatus.DESIGN_FAILED,
    ContentStatus.DESIGN_IN_PROGRESS, // legacy compat
  ],

  // ── New translation ─────────────────────────────────────────────────────
  [ContentStatus.TRANSLATION_REQUESTED]: [
    ContentStatus.TRANSLATION_READY,
    ContentStatus.CHANGES_REQUESTED,
  ],
  [ContentStatus.TRANSLATION_READY]: [
    ContentStatus.TRANSLATION_APPROVED,
    ContentStatus.CHANGES_REQUESTED,
  ],

  // ── New review + post ───────────────────────────────────────────────────
  [ContentStatus.READY_FOR_FINAL_REVIEW]: [
    ContentStatus.READY_TO_POST,
    ContentStatus.CHANGES_REQUESTED,
  ],
  [ContentStatus.READY_TO_POST]: [ContentStatus.POSTED],
  [ContentStatus.POSTED]: [],

  // ── Shared / still-active ───────────────────────────────────────────────
  [ContentStatus.CHANGES_REQUESTED]: [
    ContentStatus.IN_REVIEW,         // legacy
    ContentStatus.CONTENT_APPROVED,  // legacy
    ContentStatus.READY_FOR_DESIGN,
    ContentStatus.IN_DESIGN,
    ContentStatus.READY_FOR_FINAL_REVIEW,
  ],
  [ContentStatus.DESIGN_FAILED]: [
    ContentStatus.DESIGN_REQUESTED,
    ContentStatus.IN_DESIGN,
    ContentStatus.READY_FOR_DESIGN,
  ],
  [ContentStatus.DESIGN_READY]: [ContentStatus.DESIGN_APPROVED, ContentStatus.CHANGES_REQUESTED],
  [ContentStatus.DESIGN_APPROVED]: [
    ContentStatus.READY_FOR_DESIGN,
    ContentStatus.TRANSLATION_REQUESTED,
    ContentStatus.TRANSLATION_PENDING, // legacy
    ContentStatus.READY_FOR_FINAL_REVIEW,
    ContentStatus.READY_TO_PUBLISH,    // legacy
  ],
  [ContentStatus.TRANSLATION_APPROVED]: [
    ContentStatus.READY_FOR_FINAL_REVIEW,
    ContentStatus.READY_TO_POST,
    ContentStatus.READY_TO_PUBLISH, // legacy
  ],

  // ── Legacy states (kept for existing data) ──────────────────────────────
  [ContentStatus.IMPORTED]: [
    ContentStatus.IN_REVIEW,
    ContentStatus.CHANGES_REQUESTED,
    ContentStatus.CONTENT_APPROVED,
    ContentStatus.BLOCKED,
    ContentStatus.WAITING_FOR_COPY,
    ContentStatus.READY_FOR_DESIGN,
  ],
  [ContentStatus.IN_REVIEW]: [
    ContentStatus.CHANGES_REQUESTED,
    ContentStatus.CONTENT_APPROVED,
    ContentStatus.READY_FOR_DESIGN,
    ContentStatus.BLOCKED,
    ContentStatus.WAITING_FOR_COPY,
  ],
  [ContentStatus.CONTENT_APPROVED]: [
    ContentStatus.DESIGN_REQUESTED,
    ContentStatus.IN_DESIGN,
    ContentStatus.READY_FOR_DESIGN,
    ContentStatus.CHANGES_REQUESTED,
    ContentStatus.CONTENT_APPROVED,
  ],
  [ContentStatus.DESIGN_REQUESTED]: [
    ContentStatus.DESIGN_IN_PROGRESS,
    ContentStatus.DESIGN_FAILED,
    ContentStatus.IN_DESIGN,
  ],
  [ContentStatus.DESIGN_IN_PROGRESS]: [
    ContentStatus.DESIGN_IN_PROGRESS,
    ContentStatus.DESIGN_READY,
    ContentStatus.DESIGN_FAILED,
    ContentStatus.IN_DESIGN,
  ],
  [ContentStatus.TRANSLATION_PENDING]: [
    ContentStatus.TRANSLATION_APPROVED,
    ContentStatus.TRANSLATION_REQUESTED,
    ContentStatus.CHANGES_REQUESTED,
  ],
  [ContentStatus.READY_TO_PUBLISH]: [
    ContentStatus.PUBLISHED_MANUALLY,
    ContentStatus.POSTED,
  ],
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
  currentStatus?: ContentStatus;
}): ContentStatus {
  if (input.stage === ApprovalStage.PUBLISH) {
    if (input.decision === ApprovalDecision.APPROVED) {
      // New: final review gate → ready to post
      if (input.currentStatus === ContentStatus.READY_FOR_FINAL_REVIEW) {
        return ContentStatus.READY_TO_POST;
      }
      // Legacy: content approval gate
      return ContentStatus.CONTENT_APPROVED;
    }
    return ContentStatus.CHANGES_REQUESTED;
  }

  // Translation stage
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
      // New: final review
      input.currentStatus === ContentStatus.READY_FOR_FINAL_REVIEW ||
      // Legacy: content approval
      input.currentStatus === ContentStatus.IMPORTED ||
      input.currentStatus === ContentStatus.IN_REVIEW ||
      input.currentStatus === ContentStatus.CHANGES_REQUESTED
    );
  }

  return (
    input.currentStatus === ContentStatus.TRANSLATION_PENDING ||
    input.currentStatus === ContentStatus.TRANSLATION_REQUESTED ||
    input.currentStatus === ContentStatus.TRANSLATION_READY
  );
}
