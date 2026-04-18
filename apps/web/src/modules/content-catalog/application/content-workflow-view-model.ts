import {
  ApprovalDecision,
  ApprovalStage,
  ContentStatus,
  DesignProvider,
  DesignRequestStatus,
  ImportMode,
  ImportReceiptStatus,
  NoteType,
} from "@prisma/client";
import { CANVA_SLICE_V1, isSliceOneCanvaEligible } from "@/modules/design-orchestration/domain/canva-slice";
import { readOperationalStatusFromPlanningSnapshot } from "@/modules/content-intake/domain/infer-content-status";
import type { ActiveTemplateMapping, ContentItemDetail, QueueContentItem } from "./content-queries";

export type QueueLane = "NEEDS_ACTION" | "IN_PROGRESS" | "FAILED" | "BLOCKED" | "READY";

export type QueueLaneSection = {
  lane: QueueLane;
  label: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  count: number;
  items: Array<
    QueueContentItem & {
      lane: QueueLane;
      nextActionLabel: string;
      waitingOn: string;
      blocker: string | null;
      reason: string;
      tone: "sky" | "amber" | "rose" | "emerald" | "slate";
    }
  >;
};

export type ContentTimelineEntry = {
  id: string;
  kind: "IMPORT" | "STATUS" | "NOTE" | "APPROVAL" | "DESIGN";
  occurredAt: Date;
  title: string;
  description: string;
  meta: string;
  tone: "sky" | "amber" | "rose" | "emerald" | "slate";
};

export type ApprovalCheckpoint = {
  stage: ApprovalStage;
  label: string;
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "NOT_REQUIRED";
  summary: string;
  actor: string;
  note: string | null;
  occurredAt: Date | null;
  tone: "sky" | "amber" | "rose" | "emerald" | "slate";
};

export type OperationalSummary = {
  headline: string;
  nextStep: string;
  afterThisStep: string;
  waitingOn: string;
  blocker: string | null;
  readinessSignal: string;
  tone: "sky" | "amber" | "rose" | "emerald" | "slate";
};

export type QueueFocusMetrics = {
  actionNowCount: number;
  blockedCount: number;
  failedCount: number;
  movingCount: number;
};

export type TemplateRoutingSummary = {
  headline: string;
  status: "MATCHED" | "AVAILABLE" | "MISSING" | "OUT_OF_SCOPE";
  summary: string;
  tone: "sky" | "amber" | "rose" | "emerald" | "slate";
  activeRouteLabel: string;
  mappings: Array<{
    id: string;
    displayName: string;
    providerLabel: string;
    externalTemplateId: string;
    locale: string;
    isSliceRoute: boolean;
  }>;
};

export type DesignAttemptView = {
  id: string;
  attemptNumber: number;
  statusLabel: string;
  headline: string;
  summary: string;
  recoveryHint: string;
  simulationScenario: string;
  templateLabel: string;
  externalRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: Date;
  tone: "sky" | "amber" | "rose" | "emerald" | "slate";
};

export type IntegrationReadinessEntry = {
  id: string;
  label: string;
  status: "READY" | "PENDING" | "OUT_OF_SCOPE";
  summary: string;
  detail: string;
  tone: "sky" | "amber" | "rose" | "emerald" | "slate";
};

type Tone = ContentTimelineEntry["tone"];

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function getLatestApprovalByStage(
  item: Pick<ContentItemDetail, "approvals">,
  stage: ApprovalStage,
) {
  return item.approvals.find((approval) => approval.stage === stage) ?? null;
}

function getScenarioLabel(request: ContentItemDetail["designRequests"][number]) {
  const requestPayload =
    request.requestPayload && typeof request.requestPayload === "object"
      ? (request.requestPayload as Record<string, unknown>)
      : null;
  const execution =
    requestPayload?.execution && typeof requestPayload.execution === "object"
      ? (requestPayload.execution as Record<string, unknown>)
      : null;

  return typeof execution?.simulationScenario === "string"
    ? execution.simulationScenario.toLowerCase().replaceAll("_", " ")
    : "default";
}

function getOperationalStatus(item: Pick<ContentItemDetail, "planningSnapshot">) {
  return readOperationalStatusFromPlanningSnapshot(item.planningSnapshot);
}

function buildOperationalLaneDetail(operationalStatus: ReturnType<typeof getOperationalStatus>) {
  switch (operationalStatus) {
    case "WAITING_FOR_COPY":
      return {
        lane: "BLOCKED" as const,
        nextActionLabel: "Collect the missing copy",
        waitingOn: "Copywriter",
        blocker: "The row is real, but the LinkedIn copy is not present yet.",
        reason: "The spreadsheet row is a valid operational item, but it still needs copy before design can start.",
        tone: "amber" as const,
      };
    case "LATE":
      return {
        lane: "FAILED" as const,
        nextActionLabel: "Continue process",
        waitingOn: "Internal operator",
        blocker: null,
        reason: "The row is still operationally valid, but the deadline has passed and it should be handled urgently.",
        tone: "rose" as const,
      };
    case "READY_FOR_DESIGN":
      return {
        lane: "NEEDS_ACTION" as const,
        nextActionLabel: "Send this item to design",
        waitingOn: "Internal operator",
        blocker: null,
        reason: "The row has the required planning signals and is ready for the design handoff.",
        tone: "sky" as const,
      };
    case "PUBLISHED":
      return {
        lane: "READY" as const,
        nextActionLabel: "No further action needed",
        waitingOn: "No further action",
        blocker: null,
        reason: "The source sheet already marks this row as published, so the item is treated as concluded.",
        tone: "emerald" as const,
      };
    default:
      return null;
  }
}

function buildApprovalCheckpoint(
  item: Pick<ContentItemDetail, "translationRequired" | "approvals">,
  stage: ApprovalStage,
): ApprovalCheckpoint {
  const approval = getLatestApprovalByStage(item, stage);
  const isTranslation = stage === ApprovalStage.TRANSLATION;

  if (isTranslation && !item.translationRequired) {
    return {
      stage,
      label: "Translation approval",
      status: "NOT_REQUIRED",
      summary: "No translation approval is needed for this item.",
      actor: "No translation approver needed",
      note: null,
      occurredAt: null,
      tone: "slate",
    };
  }

  if (!approval) {
    return {
      stage,
      label: isTranslation ? "Translation approval" : "Publish approval",
      status: "PENDING",
      summary: isTranslation
        ? "A translation decision still needs to be recorded."
        : "A final publish decision still needs to be recorded.",
      actor: isTranslation ? "Waiting on translation approver" : "Waiting on publish approver",
      note: null,
      occurredAt: null,
      tone: "amber",
    };
  }

  if (approval.decision === ApprovalDecision.APPROVED) {
    return {
      stage,
      label: isTranslation ? "Translation approval" : "Publish approval",
      status: "APPROVED",
      summary: isTranslation
        ? "The translation checkpoint is approved."
        : "The publish checkpoint is approved.",
      actor: approval.actor.name ?? approval.actor.email,
      note: approval.note,
      occurredAt: approval.createdAt,
      tone: "emerald",
    };
  }

  return {
    stage,
    label: isTranslation ? "Translation approval" : "Publish approval",
    status: "CHANGES_REQUESTED",
    summary: isTranslation
      ? "Translation changes were requested before approval."
      : "Content changes were requested before publish approval.",
    actor: approval.actor.name ?? approval.actor.email,
    note: approval.note,
    occurredAt: approval.createdAt,
    tone: "rose",
  };
}

function buildQueueLaneDetails(item: QueueContentItem) {
  const latestDesignRequest = item.designRequests[0];
  const latestStatusEvent = item.statusEvents[0];
  const latestAsset = item.assets[0];
  const latestDesignFailure =
    latestDesignRequest?.status === DesignRequestStatus.FAILED
      ? latestDesignRequest.errorMessage ?? latestDesignRequest.errorCode ?? "Design provider failure."
      : null;
  const operationalStatus = getOperationalStatus(item);

  if (
    item.currentStatus === ContentStatus.IMPORTED ||
    item.currentStatus === ContentStatus.IN_REVIEW ||
    item.currentStatus === ContentStatus.PUBLISHED_MANUALLY
  ) {
    const operationalLane = buildOperationalLaneDetail(operationalStatus);
    if (operationalLane) {
      return operationalLane;
    }
  }

  switch (item.currentStatus) {
    case ContentStatus.IMPORTED:
    case ContentStatus.IN_REVIEW:
      return {
        lane: "NEEDS_ACTION" as const,
        nextActionLabel: "Review content and prepare approval",
        waitingOn: "Internal editor",
        blocker: null,
        reason: "Planning data is imported, but the content item still needs editorial review.",
        tone: "sky" as const,
      };
    case ContentStatus.CONTENT_APPROVED:
      if (item.queueMappingAvailability === "MISSING") {
        return {
          lane: "BLOCKED" as const,
          nextActionLabel: "Resolve template route before design",
          waitingOn: "Internal operator",
          blocker: "No active template mapping is available for this profile, content type, and locale.",
          reason:
            "Content is approved, but the design path cannot start until a routing decision or template mapping is in place.",
          tone: "amber" as const,
        };
      }

      return {
        lane: "NEEDS_ACTION" as const,
        nextActionLabel: "Start the design attempt",
        waitingOn: "Internal operator",
        blocker: null,
        reason: item.queueActiveRouteLabel
          ? `Content is approved and routed through ${item.queueActiveRouteLabel}.`
          : "Content is approved and ready for the next design handoff.",
        tone: "sky" as const,
      };
    case ContentStatus.DESIGN_READY:
      return {
        lane: "NEEDS_ACTION" as const,
        nextActionLabel: "Review and approve the generated design",
        waitingOn: "Design approver",
        blocker: latestAsset?.externalUrl ? null : "The design is ready, but no linked asset URL is stored yet.",
        reason: latestAsset?.externalUrl
          ? "A design result is ready, linked back to the item, and needs a human decision before publishing prep."
          : "A design result is ready and needs a human decision before publishing prep.",
        tone: "sky" as const,
      };
    case ContentStatus.DESIGN_REQUESTED:
    case ContentStatus.DESIGN_IN_PROGRESS:
      return {
        lane: "IN_PROGRESS" as const,
        nextActionLabel: "Refresh design status",
        waitingOn: "Design provider",
        blocker: null,
        reason: "A provider handoff is active and still awaiting resolution.",
        tone: "amber" as const,
      };
    case ContentStatus.DESIGN_FAILED:
      return {
        lane: "FAILED" as const,
        nextActionLabel: "Inspect failure and retry",
        waitingOn: "Internal operator",
        blocker: latestDesignFailure,
        reason:
          latestStatusEvent?.note ??
          "The last design attempt failed and needs human intervention before it can continue.",
        tone: "rose" as const,
      };
    case ContentStatus.CHANGES_REQUESTED:
      return {
        lane: "BLOCKED" as const,
        nextActionLabel: "Revise content and resubmit",
        waitingOn: "Internal editor",
        blocker:
          latestStatusEvent?.note ?? "Approval feedback still needs to be addressed.",
        reason: "The content cannot move forward until requested copy or metadata changes are made.",
        tone: "amber" as const,
      };
    case ContentStatus.TRANSLATION_PENDING:
      return {
        lane: "BLOCKED" as const,
        nextActionLabel: "Resolve translation approval",
        waitingOn: "Translation approver",
        blocker:
          latestStatusEvent?.note ?? "Portuguese translation still needs a decision.",
        reason: "The localized path is paused until the translation checkpoint is resolved.",
        tone: "amber" as const,
      };
    case ContentStatus.DESIGN_APPROVED:
      return {
        lane: "NEEDS_ACTION" as const,
        nextActionLabel: item.translationRequired
          ? "Advance the translation checkpoint"
          : "Prepare the publishing handoff",
        waitingOn: "Internal operator",
        blocker: null,
        reason: item.translationRequired
          ? "Design approval is recorded, and the localized path still needs to be moved into translation review."
          : "Design approval is recorded, and the item can now move into publishing preparation.",
        tone: "sky" as const,
      };
    case ContentStatus.TRANSLATION_APPROVED:
    case ContentStatus.READY_TO_PUBLISH:
    case ContentStatus.PUBLISHED_MANUALLY:
      return {
        lane: "READY" as const,
        nextActionLabel:
          item.currentStatus === ContentStatus.PUBLISHED_MANUALLY
            ? "Publishing fallback completed"
            : "Prepare the next handoff",
        waitingOn:
          item.currentStatus === ContentStatus.PUBLISHED_MANUALLY ? "No further action" : "Internal operator",
        blocker: null,
        reason:
          item.currentStatus === ContentStatus.PUBLISHED_MANUALLY
            ? "The manual LinkedIn fallback was already completed for this item."
            : "The item has cleared its current checkpoint and is ready for the downstream step.",
        tone: "emerald" as const,
      };
    default:
      return {
        lane: "BLOCKED" as const,
        nextActionLabel: "Review workflow state",
        waitingOn: "Internal operator",
        blocker: "This workflow state needs interpretation before the item can progress.",
        reason: "The item is in a state that needs manual interpretation before it can move on.",
        tone: "slate" as const,
      };
  }
}

function buildTemplateMappingEntry(mapping: ActiveTemplateMapping) {
  const isSliceRoute =
    mapping.designProvider === DesignProvider.CANVA &&
    mapping.displayName === CANVA_SLICE_V1.templateFamily;

  return {
    id: mapping.id,
    displayName: mapping.displayName,
    providerLabel: formatLabel(mapping.designProvider),
    externalTemplateId: mapping.externalTemplateId,
    locale: mapping.locale,
    isSliceRoute,
  };
}

function getQueuePriority(item: QueueLaneSection["items"][number]) {
  switch (item.currentStatus) {
    case ContentStatus.DESIGN_READY:
      return 0;
    case ContentStatus.CONTENT_APPROVED:
      return item.queueMappingAvailability === "MISSING" ? 7 : 1;
    case ContentStatus.DESIGN_APPROVED:
      return 2;
    case ContentStatus.IN_REVIEW:
      return 3;
    case ContentStatus.IMPORTED:
      return 4;
    case ContentStatus.DESIGN_IN_PROGRESS:
      return 5;
    case ContentStatus.DESIGN_REQUESTED:
      return 6;
    case ContentStatus.DESIGN_FAILED:
      return 0;
    case ContentStatus.CHANGES_REQUESTED:
      return 1;
    case ContentStatus.TRANSLATION_PENDING:
      return 2;
    case ContentStatus.READY_TO_PUBLISH:
      return 0;
    case ContentStatus.TRANSLATION_APPROVED:
      return 1;
    case ContentStatus.PUBLISHED_MANUALLY:
      return 2;
    default:
      return 9;
  }
}

export function buildContentTimeline(item: ContentItemDetail): ContentTimelineEntry[] {
  const importEntries: ContentTimelineEntry[] = item.importReceipts.map((receipt) => ({
    id: `import-${receipt.id}`,
    kind: "IMPORT" as const,
    occurredAt: receipt.receivedAt,
    title: `${formatLabel(receipt.mode)} import ${formatLabel(receipt.status)}`,
    description:
      receipt.status === ImportReceiptStatus.FAILED || receipt.status === ImportReceiptStatus.REJECTED
        ? receipt.errorMessage ?? "The import did not complete successfully."
        : receipt.contentItemId
          ? "The import was persisted against the canonical content item."
          : "The receipt was stored without creating or updating a canonical item.",
    meta: `${formatLabel(receipt.orchestrator)} / payload v${receipt.payloadVersion}`,
    tone:
      receipt.status === ImportReceiptStatus.FAILED || receipt.status === ImportReceiptStatus.REJECTED
        ? "rose"
        : receipt.mode === ImportMode.PREVIEW
          ? "sky"
          : "emerald",
  }));

  const statusEntries: ContentTimelineEntry[] = item.statusEvents.map((event) => ({
    id: `status-${event.id}`,
    kind: "STATUS" as const,
    occurredAt: event.createdAt,
    title: event.fromStatus
      ? `${formatLabel(event.fromStatus)} to ${formatLabel(event.toStatus)}`
      : `${formatLabel(event.toStatus)} recorded`,
    description: event.note ?? "A workflow state transition was recorded for this content item.",
    meta: event.actorEmail ?? "System workflow event",
    tone:
      event.toStatus === ContentStatus.DESIGN_FAILED || event.toStatus === ContentStatus.CHANGES_REQUESTED
        ? "rose"
        : event.toStatus === ContentStatus.DESIGN_READY ||
            event.toStatus === ContentStatus.DESIGN_APPROVED ||
            event.toStatus === ContentStatus.READY_TO_PUBLISH ||
            event.toStatus === ContentStatus.PUBLISHED_MANUALLY
          ? "emerald"
          : event.toStatus === ContentStatus.DESIGN_REQUESTED ||
              event.toStatus === ContentStatus.DESIGN_IN_PROGRESS ||
              event.toStatus === ContentStatus.TRANSLATION_PENDING
            ? "amber"
            : "sky",
  }));

  const noteEntries: ContentTimelineEntry[] = item.notes.map((note) => ({
    id: `note-${note.id}`,
    kind: "NOTE" as const,
    occurredAt: note.createdAt,
    title: note.type === NoteType.REVISION ? "Revision note added" : "Comment added",
    description: note.body,
    meta: note.author.name ?? note.author.email,
    tone: (note.type === NoteType.REVISION ? "amber" : "slate") as Tone,
  }));

  const approvalEntries: ContentTimelineEntry[] = item.approvals.map((approval) => ({
    id: `approval-${approval.id}`,
    kind: "APPROVAL" as const,
    occurredAt: approval.createdAt,
    title: `${formatLabel(approval.stage)} ${formatLabel(approval.decision)}`,
    description:
      approval.note ??
      (approval.decision === ApprovalDecision.APPROVED
        ? "Approval was recorded for this checkpoint."
        : "Changes were requested before the checkpoint could move forward."),
    meta: approval.actor.name ?? approval.actor.email,
    tone: (approval.decision === ApprovalDecision.APPROVED ? "emerald" : "rose") as Tone,
  }));

  const designEntries: ContentTimelineEntry[] = item.designRequests.map((request) => ({
    id: `design-${request.id}`,
    kind: "DESIGN" as const,
    occurredAt: request.updatedAt,
    title: `Design attempt ${request.attemptNumber} ${formatLabel(request.status)}`,
    description:
      request.status === DesignRequestStatus.FAILED
        ? request.errorMessage ?? "The provider reported a failure for this design attempt."
        : request.profileMapping
          ? `Mapped through ${request.profileMapping.displayName}.`
          : "The design attempt was recorded without a retained mapping snapshot.",
    meta:
      request.externalRequestId ??
      (request.profileMapping
        ? `${request.profileMapping.displayName} / ${formatLabel(request.designProvider)}`
        : formatLabel(request.designProvider)),
    tone:
      request.status === DesignRequestStatus.FAILED
        ? "rose"
        : request.status === DesignRequestStatus.REQUESTED ||
            request.status === DesignRequestStatus.IN_PROGRESS
          ? "amber"
          : request.status === DesignRequestStatus.READY ||
              request.status === DesignRequestStatus.APPROVED ||
              request.status === DesignRequestStatus.COMPLETED
            ? "emerald"
            : "sky",
  }));

  return [...importEntries, ...statusEntries, ...noteEntries, ...approvalEntries, ...designEntries].sort(
    (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
  );
}

export function buildQueueSections(items: QueueContentItem[]): QueueLaneSection[] {
  const decoratedItems = items.map((item) => ({
    ...item,
    ...buildQueueLaneDetails(item),
  }));

  const laneOrder: QueueLane[] = [
    "NEEDS_ACTION",
    "IN_PROGRESS",
    "FAILED",
    "BLOCKED",
    "READY",
  ];

  const laneCopy: Record<QueueLane, Omit<QueueLaneSection, "count" | "items">> = {
    NEEDS_ACTION: {
      lane: "NEEDS_ACTION",
      label: "Needs action now",
      description: "Items that should move next through review, design, or approval.",
      emptyTitle: "Nothing needs action right now",
      emptyDescription:
        "The immediate work queue is clear. Review the in-progress and ready lanes for the next handoff.",
    },
    IN_PROGRESS: {
      lane: "IN_PROGRESS",
      label: "In progress",
      description: "Items with an active handoff or provider attempt already underway.",
      emptyTitle: "No active handoffs are running",
      emptyDescription: "Nothing is currently waiting on a provider or active downstream process.",
    },
    FAILED: {
      lane: "FAILED",
      label: "Attention",
      description: "Items that need urgent operator attention because they are overdue or hit a workflow failure.",
      emptyTitle: "Nothing urgent needs attention",
      emptyDescription: "There are no overdue items or workflow failures needing intervention right now.",
    },
    BLOCKED: {
      lane: "BLOCKED",
      label: "Blocked",
      description: "Items waiting on revisions, translation, or another unresolved dependency.",
      emptyTitle: "No items are blocked",
      emptyDescription: "No content items are currently stuck behind revisions or unresolved approvals.",
    },
    READY: {
      lane: "READY",
      label: "Ready",
      description: "Items that have cleared the current checkpoint and are ready for the next handoff.",
      emptyTitle: "No completed handoffs are waiting",
      emptyDescription: "Nothing is sitting in a ready state waiting for the next operational step.",
    },
  };

  return laneOrder.map((lane) => {
    const sectionItems = decoratedItems
      .filter((item) => item.lane === lane)
      .sort((left, right) => {
        const priorityDelta = getQueuePriority(left) - getQueuePriority(right);

        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        const leftSignalAt =
          left.statusEvents[0]?.createdAt ??
          left.designRequests[0]?.updatedAt ??
          left.importReceipts[0]?.receivedAt ??
          left.latestImportAt ??
          left.updatedAt;
        const rightSignalAt =
          right.statusEvents[0]?.createdAt ??
          right.designRequests[0]?.updatedAt ??
          right.importReceipts[0]?.receivedAt ??
          right.latestImportAt ??
          right.updatedAt;

        return rightSignalAt.getTime() - leftSignalAt.getTime();
      });

    return {
      ...laneCopy[lane],
      count: sectionItems.length,
      items: sectionItems,
    };
  });
}

export function buildQueueFocusMetrics(sections: QueueLaneSection[]): QueueFocusMetrics {
  return {
    actionNowCount: sections.find((section) => section.lane === "NEEDS_ACTION")?.count ?? 0,
    blockedCount: sections.find((section) => section.lane === "BLOCKED")?.count ?? 0,
    failedCount: sections.find((section) => section.lane === "FAILED")?.count ?? 0,
    movingCount: sections.find((section) => section.lane === "IN_PROGRESS")?.count ?? 0,
  };
}

export function buildApprovalCheckpoints(
  item: Pick<ContentItemDetail, "translationRequired" | "approvals">,
) {
  return [
    buildApprovalCheckpoint(item, ApprovalStage.PUBLISH),
    buildApprovalCheckpoint(item, ApprovalStage.TRANSLATION),
  ];
}

export function buildOperationalSummary(item: ContentItemDetail): OperationalSummary {
  const [publishCheckpoint, translationCheckpoint] = buildApprovalCheckpoints(item);
  const latestDesignRequest = item.designRequests[0];
  const latestAsset = item.assets[item.assets.length - 1];
  const operationalStatus = getOperationalStatus(item);

  if (
    item.currentStatus === ContentStatus.IMPORTED ||
    item.currentStatus === ContentStatus.IN_REVIEW ||
    item.currentStatus === ContentStatus.PUBLISHED_MANUALLY
  ) {
    switch (operationalStatus) {
      case "WAITING_FOR_COPY":
        return {
          headline: "The row is valid, but copy is still missing",
          nextStep: "Wait for the spreadsheet copy to be completed before sending this item to design.",
          afterThisStep: "Once copy exists, the item can move into the design handoff.",
          waitingOn: "Copywriter",
          blocker: "The spreadsheet row is operationally valid, but it is waiting on copy.",
          readinessSignal: "The item is still actionable, but not yet ready for design.",
          tone: "amber",
        };
      case "LATE":
        return {
          headline: "The item is overdue",
          nextStep: "Continue the current process and decide the fastest way to move the item forward.",
          afterThisStep: "Once the next step is resumed, the item can keep moving through the normal workflow.",
          waitingOn: "Internal operator",
          blocker: null,
          readinessSignal: "This row needs urgent attention, but it is not blocked by the missed deadline alone.",
          tone: "rose",
        };
      case "READY_FOR_DESIGN":
        return {
          headline: "The row is ready for design",
          nextStep: "Send the item to design once the copy owner confirms it is ready.",
          afterThisStep: "The item can move into the regular design and approval path.",
          waitingOn: "Internal operator",
          blocker: null,
          readinessSignal: "The row has enough planning signal to begin the design stage.",
          tone: "emerald",
        };
      case "PUBLISHED":
        return {
          headline: "The source sheet already marks this row as published",
          nextStep: "Keep it read-only and use it as a completed operational reference.",
          afterThisStep: "No further phase-one action is required for this row.",
          waitingOn: "No further action",
          blocker: null,
          readinessSignal: "The row is already concluded in the source sheet.",
          tone: "emerald",
        };
    }
  }

  if (item.currentStatus === ContentStatus.CONTENT_APPROVED && item.activeTemplateMappings.length === 0) {
    return {
      headline: "Approved content is waiting on template routing",
      nextStep: "Activate or assign a template mapping before starting the design attempt.",
      afterThisStep: "Once a route exists, the item can move into the design handoff from this view.",
      waitingOn: "Internal operator",
      blocker: "No active template mapping matches the current profile, content type, and locale.",
      readinessSignal: "The routing section below will show the first usable path once it exists.",
      tone: "amber",
    };
  }

  if (item.currentStatus === ContentStatus.DESIGN_FAILED) {
    return {
      headline: "Design attempt failed",
      nextStep: "Inspect the stored provider error, adjust if needed, and trigger a retry.",
      afterThisStep: "A successful retry will move the item back into the active design path.",
      waitingOn: "Internal operator",
      blocker:
        latestDesignRequest?.errorMessage ??
        latestDesignRequest?.errorCode ??
        "The last provider attempt failed.",
      readinessSignal: "A retry can be started from this detail view.",
      tone: "rose",
    };
  }

  if (
    item.currentStatus === ContentStatus.DESIGN_REQUESTED ||
    item.currentStatus === ContentStatus.DESIGN_IN_PROGRESS
  ) {
    return {
      headline: "Design handoff is active",
      nextStep: "Refresh the design attempt until it resolves to ready or failed.",
      afterThisStep: "Once the provider resolves successfully, the design can be reviewed and approved here.",
      waitingOn: "Design provider",
      blocker: null,
      readinessSignal: "The design is not ready yet. The handoff is still active.",
      tone: "amber",
    };
  }

  if (item.currentStatus === ContentStatus.DESIGN_READY) {
    return {
      headline: "Design result is ready for review",
      nextStep: "Review the generated asset and record the design approval decision.",
      afterThisStep: "After design approval, the item can move toward publishing preparation.",
      waitingOn: "Design approver",
      blocker: latestAsset?.externalUrl ? null : "The design resolved to ready, but the latest asset link is missing.",
      readinessSignal: latestAsset?.externalUrl
        ? "A design asset is linked back to the canonical content item."
        : "The design request is ready, but the output link still needs verification.",
      tone: "sky",
    };
  }

  if (publishCheckpoint.status === "CHANGES_REQUESTED") {
    return {
      headline: "Publish approval is blocked on content changes",
      nextStep: "Update the content and resubmit for publish approval.",
      afterThisStep: "Once publish approval is cleared, the design path can continue.",
      waitingOn: "Internal editor",
      blocker: publishCheckpoint.note ?? "Publish approval feedback still needs to be addressed.",
      readinessSignal: "The item cannot move downstream until the publish checkpoint is cleared.",
      tone: "amber",
    };
  }

  if (translationCheckpoint.status === "CHANGES_REQUESTED") {
    return {
      headline: "Translation approval is blocked on changes",
      nextStep: "Revise the Portuguese translation and request approval again.",
      afterThisStep: "Once translation approval is cleared, the localized path can continue.",
      waitingOn: "Translation editor",
      blocker: translationCheckpoint.note ?? "Translation feedback still needs to be addressed.",
      readinessSignal: "The localized version is still blocked.",
      tone: "amber",
    };
  }

  if (item.currentStatus === ContentStatus.CONTENT_APPROVED) {
    return {
      headline: "Content is approved and ready for design",
      nextStep: "Start the design attempt for the approved content item.",
      afterThisStep: "The item will move into an active design handoff until the result is ready or failed.",
      waitingOn: "Internal operator",
      blocker: null,
      readinessSignal: "Publish approval is in place and the design path can begin.",
      tone: "sky",
    };
  }

  if (item.currentStatus === ContentStatus.IMPORTED || item.currentStatus === ContentStatus.IN_REVIEW) {
    return {
      headline: "Editorial review is the next checkpoint",
      nextStep: "Review the imported planning data, refine the content, and request publish approval.",
      afterThisStep: "Once publish approval is recorded, the design path becomes available.",
      waitingOn: "Internal editor",
      blocker: null,
      readinessSignal: "The item is still in the review part of the pipeline.",
      tone: "sky",
    };
  }

  if (item.currentStatus === ContentStatus.TRANSLATION_PENDING) {
    return {
      headline: "Translation decision is still pending",
      nextStep: "Record the translation approval decision or request translation changes.",
      afterThisStep: "Once translation approval is recorded, the localized path can move forward.",
      waitingOn: "Translation approver",
      blocker: translationCheckpoint.note,
      readinessSignal: "The localized path is not cleared yet.",
      tone: "amber",
    };
  }

  if (item.currentStatus === ContentStatus.TRANSLATION_APPROVED) {
    return {
      headline: "Translation checkpoint is cleared",
      nextStep: "Prepare the localized assets or advance the item toward publish readiness.",
      afterThisStep: "The localized content can now move into the next internal handoff.",
      waitingOn: "Internal operator",
      blocker: null,
      readinessSignal: "Translation approval is recorded and visible below.",
      tone: "emerald",
    };
  }

  if (item.currentStatus === ContentStatus.DESIGN_APPROVED) {
    return {
      headline: item.translationRequired
        ? "Design approval is complete and the localized path still needs to advance"
        : "Design approval is complete and the item can move into publishing prep",
      nextStep: item.translationRequired
        ? "Move the item into translation review or record the next localization handoff."
        : "Prepare the final package and move the item toward publish readiness.",
      afterThisStep: item.translationRequired
        ? "Once translation is cleared, the localized version can move toward publish readiness."
        : "The next phase is packaging and publishing readiness.",
      waitingOn: "Internal operator",
      blocker: null,
      readinessSignal: latestAsset?.externalUrl
        ? "The approved design output is already linked to this item."
        : "The workflow is approved, but the latest design output should still be verified below.",
      tone: "emerald",
    };
  }

  if (item.currentStatus === ContentStatus.WAITING_FOR_COPY) {
    return {
      headline: "Waiting for copy",
      nextStep: "The item cannot advance until copy is added to the spreadsheet.",
      afterThisStep: "Once copy exists, the item moves directly into design.",
      waitingOn: "Copywriter",
      blocker: "No copy found in the source spreadsheet row.",
      readinessSignal: "The item is valid but blocked until copy arrives.",
      tone: "amber",
    };
  }

  if (item.currentStatus === ContentStatus.READY_FOR_DESIGN) {
    return {
      headline: "Ready for design",
      nextStep: "Start the design handoff for this content item.",
      afterThisStep: "The item enters the active design production cycle.",
      waitingOn: "Internal operator",
      blocker: null,
      readinessSignal: "Copy is present and the item can begin the design stage.",
      tone: "emerald",
    };
  }

  if (item.currentStatus === ContentStatus.IN_DESIGN) {
    return {
      headline: "Design is in production",
      nextStep: "Sync the design status until it resolves to ready or failed.",
      afterThisStep: "Once the design resolves, it can be reviewed and approved here.",
      waitingOn: "Design provider",
      blocker: null,
      readinessSignal: "The design handoff is active.",
      tone: "amber",
    };
  }

  if (item.currentStatus === ContentStatus.TRANSLATION_REQUESTED) {
    return {
      headline: "Translation has been requested",
      nextStep: "Wait for the AI translation to be generated.",
      afterThisStep: "Once generated, the translation will appear here for human review.",
      waitingOn: "Translation AI",
      blocker: null,
      readinessSignal: "Translation is queued and will be ready soon.",
      tone: "amber",
    };
  }

  if (item.currentStatus === ContentStatus.TRANSLATION_READY) {
    return {
      headline: "AI translation is ready for review",
      nextStep: "Review and edit the generated translation, then approve it.",
      afterThisStep: "Once approved, the item advances to final review.",
      waitingOn: "Translation reviewer",
      blocker: null,
      readinessSignal: "The AI-generated translation is available below.",
      tone: "sky",
    };
  }

  if (item.currentStatus === ContentStatus.READY_FOR_FINAL_REVIEW) {
    return {
      headline: "Ready for final review",
      nextStep: "Review the complete package — copy, design, and translation — then approve for posting.",
      afterThisStep: "Once approved, the item is ready to POST on LinkedIn.",
      waitingOn: "Internal approver",
      blocker: null,
      readinessSignal: "All upstream steps are complete. Final review is the last gate.",
      tone: "emerald",
    };
  }

  if (item.currentStatus === ContentStatus.READY_TO_POST) {
    return {
      headline: "Ready to POST on LinkedIn",
      nextStep: "Execute the final post on LinkedIn.",
      afterThisStep: "After posting, this item will be marked as POSTED and the workflow is complete.",
      waitingOn: "Internal operator",
      blocker: null,
      readinessSignal: "All approvals are in place. Ready to post.",
      tone: "sky",
    };
  }

  if (
    item.currentStatus === ContentStatus.POSTED ||
    item.currentStatus === ContentStatus.PUBLISHED_MANUALLY
  ) {
    return {
      headline: "Posted on LinkedIn",
      nextStep: "No further action required.",
      afterThisStep: "This item is complete.",
      waitingOn: "No further action",
      blocker: null,
      readinessSignal: "The item has been posted and the workflow is complete.",
      tone: "emerald",
    };
  }

  if (item.currentStatus === ContentStatus.READY_TO_PUBLISH) {
    return {
      headline: "Ready to POST on LinkedIn",
      nextStep: "Execute the final post on LinkedIn.",
      afterThisStep: "After posting, this item will be marked as complete.",
      waitingOn: "Internal operator",
      blocker: null,
      readinessSignal: "All approvals are in place.",
      tone: "sky",
    };
  }

  return {
    headline: "This item needs manual interpretation",
    nextStep: "Review the status history and decide the next operational checkpoint.",
    afterThisStep: "Use the activity timeline below to determine the cleanest next move.",
    waitingOn: "Internal operator",
    blocker: "The current state does not map cleanly to one next step yet.",
    readinessSignal: "The timeline below contains the clearest signal for this item.",
    tone: "slate",
  };
}

export function buildTemplateRoutingSummary(item: ContentItemDetail): TemplateRoutingSummary {
  const eligibleForSliceOne = isSliceOneCanvaEligible({
    profile: item.profile,
    contentType: item.contentType,
    sourceLocale: item.sourceLocale,
  });
  const latestRequestMapping = item.designRequests[0]?.profileMapping ?? null;
  const activeMappings = item.activeTemplateMappings.map(buildTemplateMappingEntry);
  const hasAnyMapping = activeMappings.length > 0;
  const activeRouteLabel = latestRequestMapping
    ? `${latestRequestMapping.displayName} / ${formatLabel(latestRequestMapping.designProvider)}`
    : hasAnyMapping
      ? `${activeMappings[0].displayName} / ${activeMappings[0].providerLabel}`
      : "No active mapping";

  if (eligibleForSliceOne && latestRequestMapping) {
    return {
      headline: "This content item is routed through a matched template mapping",
      status: "MATCHED",
      summary: "The active design route is explicit and already linked to the latest design attempt.",
      tone: "emerald",
      activeRouteLabel,
      mappings: activeMappings,
    };
  }

  if (eligibleForSliceOne && hasAnyMapping) {
    return {
      headline: "A design route is available for this item",
      status: "AVAILABLE",
      summary: "The current profile, content type, and locale already have an active template mapping ready to use.",
      tone: "sky",
      activeRouteLabel,
      mappings: activeMappings,
    };
  }

  if (!eligibleForSliceOne && hasAnyMapping) {
    return {
      headline: "A template mapping exists, but this item is outside the current slice path",
      status: "OUT_OF_SCOPE",
      summary:
        "Mappings are present for this route, but this item is not using an active template path yet.",
      tone: "amber",
      activeRouteLabel,
      mappings: activeMappings,
    };
  }

  return {
    headline: "No active template mapping is available yet",
    status: "MISSING",
    summary:
      "This item does not currently have an active template route for its profile, content type, and locale combination.",
    tone: "rose",
    activeRouteLabel,
    mappings: [],
  };
}

export function buildDesignAttemptHistory(item: ContentItemDetail): DesignAttemptView[] {
  return item.designRequests.map((request) => {
    const scenario = getScenarioLabel(request);
    const mappingLabel = request.profileMapping
      ? `${request.profileMapping.displayName} / ${formatLabel(request.profileMapping.designProvider)}`
      : "No mapping recorded";

    if (request.status === DesignRequestStatus.FAILED) {
      return {
        id: request.id,
        attemptNumber: request.attemptNumber,
        statusLabel: formatLabel(request.status),
        headline: `Attempt ${request.attemptNumber} failed`,
        summary: request.errorMessage ?? "The provider returned a failure state for this attempt.",
        recoveryHint: "Review the stored provider detail, then retry only after the cause is understood.",
        simulationScenario: scenario,
        templateLabel: mappingLabel,
        externalRequestId: request.externalRequestId ?? null,
        errorCode: request.errorCode ?? null,
        errorMessage: request.errorMessage ?? null,
        updatedAt: request.updatedAt,
        tone: "rose",
      };
    }

    if (
      request.status === DesignRequestStatus.IN_PROGRESS ||
      request.status === DesignRequestStatus.REQUESTED
    ) {
      return {
        id: request.id,
        attemptNumber: request.attemptNumber,
        statusLabel: formatLabel(request.status),
        headline: `Attempt ${request.attemptNumber} is still active`,
        summary: "The provider handoff is still running and has not resolved to ready or failed yet.",
        recoveryHint: "Use the refresh action before creating another attempt.",
        simulationScenario: scenario,
        templateLabel: mappingLabel,
        externalRequestId: request.externalRequestId ?? null,
        errorCode: request.errorCode ?? null,
        errorMessage: request.errorMessage ?? null,
        updatedAt: request.updatedAt,
        tone: "amber",
      };
    }

    if (
      request.status === DesignRequestStatus.READY ||
      request.status === DesignRequestStatus.APPROVED ||
      request.status === DesignRequestStatus.COMPLETED
    ) {
      return {
        id: request.id,
        attemptNumber: request.attemptNumber,
        statusLabel: formatLabel(request.status),
        headline:
          request.status === DesignRequestStatus.APPROVED
            ? `Attempt ${request.attemptNumber} was approved`
            : `Attempt ${request.attemptNumber} resolved successfully`,
        summary: "The generated result is linked back to the content item and available for the next checkpoint.",
        recoveryHint: "No recovery action is needed unless a new revision cycle starts.",
        simulationScenario: scenario,
        templateLabel: mappingLabel,
        externalRequestId: request.externalRequestId ?? null,
        errorCode: request.errorCode ?? null,
        errorMessage: request.errorMessage ?? null,
        updatedAt: request.updatedAt,
        tone: request.status === DesignRequestStatus.APPROVED ? "emerald" : "sky",
      };
    }

    return {
      id: request.id,
      attemptNumber: request.attemptNumber,
      statusLabel: formatLabel(request.status),
      headline: `Attempt ${request.attemptNumber}`,
      summary: "This design attempt is recorded for traceability.",
      recoveryHint: "Review the attempt details if another action is needed.",
      simulationScenario: scenario,
      templateLabel: mappingLabel,
      externalRequestId: request.externalRequestId ?? null,
      errorCode: request.errorCode ?? null,
      errorMessage: request.errorMessage ?? null,
      updatedAt: request.updatedAt,
      tone: "slate",
    };
  });
}

export function buildIntegrationReadinessEntries(item: ContentItemDetail): IntegrationReadinessEntry[] {
  const hasSourceLink = item.sourceLinks.length > 0;
  const hasImportTrace = item.importReceipts.length > 0;
  const routing = buildTemplateRoutingSummary(item);
  const latestDesignRequest = item.designRequests[0];

  return [
    {
      id: "sheets",
      label: "Sheets normalization boundary",
      status: hasSourceLink && hasImportTrace ? "READY" : "PENDING",
      summary: hasSourceLink && hasImportTrace
        ? "Source row linkage and import receipts are present for this item."
        : "Source linkage or import trace is incomplete.",
      detail: hasSourceLink
        ? "The app can trace this content item back to the normalized Sheets row."
        : "A source row link has not been recorded yet.",
      tone: hasSourceLink && hasImportTrace ? "emerald" : "amber",
    },
    {
      id: "orchestration",
      label: "Import trace",
      status: hasImportTrace ? "READY" : "PENDING",
      summary: hasImportTrace
        ? "The item has a persisted import receipt for traceability."
        : "No import receipt is attached to this item yet.",
      detail: "This keeps the spreadsheet-to-app handoff visible without exposing technical orchestration details.",
      tone: hasImportTrace ? "sky" : "amber",
    },
    {
      id: "design",
      label: "Visual route",
      status: routing.status === "MISSING" ? "PENDING" : "READY",
      summary:
        latestDesignRequest?.requestPayload &&
        typeof latestDesignRequest.requestPayload === "object" &&
        "execution" in (latestDesignRequest.requestPayload as Record<string, unknown>)
          ? "A visual request is already recorded for this item."
          : "The visual route is ready when this item reaches the design step.",
      detail:
        routing.status === "MISSING"
          ? "A template route still needs to be defined for this item before a design handoff can be used."
          : `Current route: ${routing.activeRouteLabel}.`,
      tone: routing.status === "MISSING" ? "amber" : "emerald",
    },
    {
      id: "publishing",
      label: "LinkedIn publishing preparation",
      status: "OUT_OF_SCOPE",
      summary: "Publishing remains architecturally represented but intentionally non-live in this phase.",
      detail: "The product keeps the manual fallback and future API path visible without depending on credentials today.",
      tone: "slate",
    },
  ];
}

export function getApprovalSummary(item: QueueContentItem) {
  if (item.currentStatus === ContentStatus.CHANGES_REQUESTED) {
    return "Approval changes requested";
  }

  if (item.currentStatus === ContentStatus.TRANSLATION_PENDING) {
    return item.translationRequired ? "Translation approval pending" : "Approval pending";
  }

  if (item.currentStatus === ContentStatus.TRANSLATION_APPROVED) {
    return item.translationRequired ? "Translation approved" : "Approval recorded";
  }

  if (
    item.currentStatus === ContentStatus.READY_TO_PUBLISH ||
    item.currentStatus === ContentStatus.PUBLISHED_MANUALLY
  ) {
    return "Publish approval cleared";
  }

  if (
    item.currentStatus === ContentStatus.CONTENT_APPROVED ||
    item.currentStatus === ContentStatus.DESIGN_REQUESTED ||
    item.currentStatus === ContentStatus.DESIGN_IN_PROGRESS ||
    item.currentStatus === ContentStatus.DESIGN_FAILED ||
    item.currentStatus === ContentStatus.DESIGN_READY
  ) {
    return "Publish approval pending";
  }

  return item.translationRequired ? "Translation still in workflow" : "Review still in workflow";
}

export function getDesignSummary(item: QueueContentItem) {
  const designRequest = item.designRequests[0];

  if (!designRequest) {
    if (item.queueMappingAvailability === "AVAILABLE" && item.queueActiveRouteLabel) {
      return `Route ready / ${item.queueActiveRouteLabel}`;
    }

    if (item.queueMappingAvailability === "MISSING") {
      return "No active route";
    }

    return null;
  }

  const label = `Attempt ${designRequest.attemptNumber} / ${formatLabel(designRequest.status)}`;

  if (designRequest.status === DesignRequestStatus.FAILED && designRequest.errorCode) {
    return `${label} / ${designRequest.errorCode}`;
  }

  return label;
}

export function getShortActionPhrase(item: QueueContentItem): string {
  const operationalStatus = getOperationalStatus(item);

  if (
    item.currentStatus === ContentStatus.IMPORTED ||
    item.currentStatus === ContentStatus.IN_REVIEW ||
    item.currentStatus === ContentStatus.PUBLISHED_MANUALLY
  ) {
    switch (operationalStatus) {
      case "WAITING_FOR_COPY":
        return "Awaiting Copy";
      case "LATE":
        return "Continue";
      case "READY_FOR_DESIGN":
        return "Send to Design";
      case "PUBLISHED":
        return "Complete";
    }
  }

  switch (item.currentStatus) {
    case ContentStatus.WAITING_FOR_COPY:
      return "Awaiting Copy";
    case ContentStatus.READY_FOR_DESIGN:
      return "Start Design";
    case ContentStatus.IN_DESIGN:
      return "Sync Design";
    case ContentStatus.TRANSLATION_REQUESTED:
      return "Await Translation";
    case ContentStatus.TRANSLATION_READY:
      return "Review Translation";
    case ContentStatus.READY_FOR_FINAL_REVIEW:
      return "Final Review";
    case ContentStatus.READY_TO_POST:
      return "POST on LI";
    case ContentStatus.POSTED:
      return "Complete";
    case ContentStatus.IMPORTED:
    case ContentStatus.IN_REVIEW:
      return "Review";
    case ContentStatus.CONTENT_APPROVED:
      if (item.queueMappingAvailability === "MISSING") {
        return "Missing Template";
      }
      return "Start Design";
    case ContentStatus.DESIGN_REQUESTED:
    case ContentStatus.DESIGN_IN_PROGRESS:
      return "Sync Design";
    case ContentStatus.DESIGN_READY:
      return "Approve Design";
    case ContentStatus.DESIGN_FAILED:
      return "Retry Design";
    case ContentStatus.CHANGES_REQUESTED:
      return "Revise";
    case ContentStatus.DESIGN_APPROVED:
      return item.translationRequired ? "Start Translation" : "Final Review";
    case ContentStatus.TRANSLATION_PENDING:
      return "Check Translation";
    case ContentStatus.TRANSLATION_APPROVED:
      return "Final Review";
    case ContentStatus.READY_TO_PUBLISH:
    case ContentStatus.READY_TO_POST:
      return "POST on LI";
    case ContentStatus.PUBLISHED_MANUALLY:
    case ContentStatus.POSTED:
      return "Complete";
    default:
      return "Review";
  }
}

export function getTranslationCheckpoint(item: QueueContentItem) {
  if (!item.translationRequired) {
    return "Translation not required";
  }

  if (item.currentStatus === ContentStatus.TRANSLATION_PENDING) {
    return "Translation approval pending";
  }

  if (item.currentStatus === ContentStatus.TRANSLATION_APPROVED) {
    return "Translation approved";
  }

  if (
    item.currentStatus === ContentStatus.READY_TO_PUBLISH ||
    item.currentStatus === ContentStatus.PUBLISHED_MANUALLY
  ) {
    return "Translation approved";
  }

  if (item.currentStatus === ContentStatus.CONTENT_APPROVED) {
    return "Translation still to be opened";
  }

  if (
    item.currentStatus === ContentStatus.DESIGN_REQUESTED ||
    item.currentStatus === ContentStatus.DESIGN_IN_PROGRESS ||
    item.currentStatus === ContentStatus.DESIGN_FAILED ||
    item.currentStatus === ContentStatus.DESIGN_READY
  ) {
    return "Translation still in workflow";
  }

  return "Translation approval pending";
}
