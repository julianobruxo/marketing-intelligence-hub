"use server";

import { ApprovalDecision, ApprovalStage, ContentStatus, NoteType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { getPrisma } from "@/shared/lib/prisma";
import {
  assertContentStatusTransition,
  canRecordApprovalAction,
  resolveApprovalTransition,
} from "@/modules/workflow/domain/phase-one-workflow";

export async function addWorkflowNoteAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "");
  const type = String(formData.get("type") ?? "COMMENT") as NoteType;
  const body = String(formData.get("body") ?? "").trim();

  if (!contentItemId || !body) {
    return;
  }

  const actor = await prisma.user.findUnique({
    where: { email: session.email },
  });

  if (!actor) {
    return;
  }

  await prisma.workflowNote.create({
    data: {
      contentItemId,
      authorId: actor.id,
      type,
      body,
    },
  });

  revalidatePath(`/queue/${contentItemId}`);
}

export async function recordApprovalAction(formData: FormData) {
  return recordApprovalActionWithDecision(null, formData);
}

export async function recordApprovalActionWithDecision(
  decisionOverride: ApprovalDecision | null,
  formData: FormData,
) {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "");
  const stage = String(formData.get("stage") ?? "PUBLISH") as ApprovalStage;
  const decision = (decisionOverride ??
    (String(formData.get("decision") ?? "APPROVED") as ApprovalDecision)) as ApprovalDecision;
  const note = String(formData.get("note") ?? "").trim();

  if (!contentItemId) {
    return;
  }

  const isAuthorizedForStage =
    stage === ApprovalStage.PUBLISH
      ? session.roles.includes("APPROVER") || session.roles.includes("ADMIN")
      : session.roles.includes("TRANSLATION_APPROVER") || session.roles.includes("ADMIN");

  if (!isAuthorizedForStage) {
    return;
  }

  const actor = await prisma.user.findUnique({
    where: { email: session.email },
  });

  if (!actor) {
    return;
  }

  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    select: { currentStatus: true },
  });

  if (!contentItem) {
    return;
  }

  if (!canRecordApprovalAction({ currentStatus: contentItem.currentStatus, stage })) {
    return;
  }

  const nextStatus = resolveApprovalTransition({
    stage,
    decision,
    currentStatus: contentItem.currentStatus,
  });

  assertContentStatusTransition({
    currentStatus: contentItem.currentStatus,
    nextStatus,
    reason: `approval ${stage.toLowerCase()} ${decision.toLowerCase()}`,
  });

  await prisma.$transaction(async (tx) => {
    await tx.approvalRecord.create({
      data: {
        contentItemId,
        actorId: actor.id,
        stage,
        decision,
        note: note || null,
      },
    });

    await tx.contentItem.update({
      where: { id: contentItemId },
      data: {
        currentStatus: nextStatus,
      },
    });

    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus: contentItem.currentStatus,
        toStatus: nextStatus,
        actorEmail: session.email,
        note:
          note ||
          `${stage === ApprovalStage.PUBLISH ? "Publish" : "Translation"} ${decision.toLowerCase().replace("_", " ")}.`,
      },
    });
  });

  revalidatePath(`/queue/${contentItemId}`);
  revalidatePath("/queue");
}

export async function recordPostedAction(formData: FormData) {
  await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "");

  if (!contentItemId) return;

  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    select: { currentStatus: true },
  });

  if (!contentItem) return;

  const isFromNewFlow = contentItem.currentStatus === ContentStatus.READY_TO_POST;
  const isFromLegacy = contentItem.currentStatus === ContentStatus.READY_TO_PUBLISH;
  if (!isFromNewFlow && !isFromLegacy) return;

  const nextStatus = isFromNewFlow ? ContentStatus.POSTED : ContentStatus.PUBLISHED_MANUALLY;

  assertContentStatusTransition({
    currentStatus: contentItem.currentStatus,
    nextStatus,
    reason: "manual post on LinkedIn",
  });

  await prisma.$transaction(async (tx) => {
    await tx.contentItem.update({
      where: { id: contentItemId },
      data: { currentStatus: nextStatus },
    });
    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus: contentItem.currentStatus,
        toStatus: nextStatus,
        actorEmail: "system",
        note: "Manually recorded as posted on LinkedIn.",
      },
    });
  });

  revalidatePath(`/queue/${contentItemId}`);
  revalidatePath("/queue");
}
