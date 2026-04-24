"use server";

import { ContentStatus, DesignRequestStatus, NoteType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { getPrisma } from "@/shared/lib/prisma";
import { assertContentStatusTransition } from "@/modules/workflow/domain/phase-one-workflow";
import { getActorEmail } from "@/modules/workflow/application/get-actor-email";

export type ActionResult = {
  success: true;
} | {
  success: false;
  error: string;
};

function toJsonValue(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

export async function rejectDesignAction(input: {
  contentItemId: string;
  reason: string;
  feedback?: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = input.contentItemId.trim();
  const reason = input.reason.trim();
  const feedback = input.feedback?.trim() ?? "";

  if (!contentItemId || !reason) {
    return {
      success: false,
      error: "Reason is required.",
    };
  }

  const contentItem = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    include: {
      designRequests: {
        where: { deletedAt: null, status: DesignRequestStatus.READY },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });

  if (!contentItem) {
    return {
      success: false,
      error: "Content item not found.",
    };
  }

  if (contentItem.currentStatus !== ContentStatus.DESIGN_READY) {
    return {
      success: false,
      error: "Item is not in DESIGN_READY.",
    };
  }

  const designRequest = contentItem.designRequests[0];
  if (!designRequest) {
    return {
      success: false,
      error: "No ready design request found to reject.",
    };
  }

  const actor = await prisma.user.findUnique({
    where: { email: session.email },
    select: { id: true, email: true },
  });

  if (!actor) {
    return {
      success: false,
      error: "Unable to resolve actor account.",
    };
  }

  const actorEmail = await getActorEmail(session.email);
  const noteBody = feedback.length > 0 ? feedback : null;

  await prisma.$transaction(async (tx) => {
    assertContentStatusTransition({
      currentStatus: contentItem.currentStatus,
      nextStatus: ContentStatus.CHANGES_REQUESTED,
      reason: "rejecting a completed design",
    });

    const rejectionResultPayload = {
      designRequestId: designRequest.id,
      reason,
      feedback: noteBody,
      rejectedBy: actorEmail,
      rejectedAt: new Date().toISOString(),
      retryable: false,
      status: "REJECTED",
    };

    const statusUpdate = await tx.contentItem.updateMany({
      where: {
        id: contentItemId,
        currentStatus: ContentStatus.DESIGN_READY,
        deletedAt: null,
      },
      data: {
        currentStatus: ContentStatus.CHANGES_REQUESTED,
      },
    });

    if (statusUpdate.count === 0) {
      throw new Error("Item is no longer DESIGN_READY.");
    }

    const rejectedRequest = await tx.designRequest.updateMany({
      where: {
        id: designRequest.id,
        deletedAt: null,
        status: DesignRequestStatus.READY,
      },
      data: {
        status: DesignRequestStatus.REJECTED,
        errorCode: "DESIGN_REJECTED",
        errorMessage: reason,
        resultPayload: toJsonValue(rejectionResultPayload),
      },
    });

    if (rejectedRequest.count === 0) {
      throw new Error("Design request is no longer available for rejection.");
    }

    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus: ContentStatus.DESIGN_READY,
        toStatus: ContentStatus.CHANGES_REQUESTED,
        actorEmail,
        note: noteBody ? `Design rejected: ${reason} — ${feedback}` : `Design rejected: ${reason}.`,
      },
    });

    if (noteBody) {
      await tx.workflowNote.create({
        data: {
          contentItemId,
          authorId: actor.id,
          type: NoteType.REVISION,
          body: feedback,
        },
      });
    }
  });

  revalidatePath(`/queue/${contentItemId}`);
  revalidatePath("/queue");

  return { success: true };
}
