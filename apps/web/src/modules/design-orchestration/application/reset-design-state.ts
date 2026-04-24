"use server";

import { ContentStatus, DesignProvider, DesignRequestStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { assertContentStatusTransition } from "@/modules/workflow/domain/phase-one-workflow";
import { getActorEmail } from "@/modules/workflow/application/get-actor-email";
import { getPrisma } from "@/shared/lib/prisma";

const DESIGN_RESET_NOTE = "Design reset by operator";

function hasOperatorSelectedDesignVariation(...values: unknown[]) {
  return values.some((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.selectedVariationId === "string" && record.selectedVariationId.trim().length > 0) {
      return true;
    }

    const selectedVariation = record.selectedVariation;
    if (!selectedVariation || typeof selectedVariation !== "object" || Array.isArray(selectedVariation)) {
      return false;
    }

    const selectedVariationRecord = selectedVariation as Record<string, unknown>;
    return typeof selectedVariationRecord.id === "string" && selectedVariationRecord.id.trim().length > 0;
  });
}

function hasSelectedDesignAsset(input: {
  designProvider?: DesignProvider | null;
  latestAsset?: {
    externalUrl: string | null;
    storagePath: string | null;
    metadata: unknown;
  } | null;
  resultPayload?: unknown;
}) {
  if (!input.latestAsset) {
    return false;
  }

  if (
    input.designProvider === DesignProvider.GPT_IMAGE ||
    input.designProvider === DesignProvider.AI_VISUAL
  ) {
    return hasOperatorSelectedDesignVariation(input.latestAsset.metadata, input.resultPayload);
  }

  return Boolean(input.latestAsset.externalUrl || input.latestAsset.storagePath);
}

export async function resetDesignStateAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "").trim();

  if (!contentItemId) {
    return;
  }

  const contentItem = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    select: {
      currentStatus: true,
      designRequests: {
        where: { deletedAt: null },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          designProvider: true,
          resultPayload: true,
        },
      },
      assets: {
        where: { deletedAt: null },
        orderBy: [{ slideIndex: "asc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          externalUrl: true,
          storagePath: true,
          metadata: true,
        },
      },
    },
  });

  if (!contentItem) {
    return;
  }

  const latestDesignRequest = contentItem.designRequests[0] ?? null;
  const latestAsset = contentItem.assets[0] ?? null;
  const canResetApprovedWithoutAsset =
    contentItem.currentStatus === ContentStatus.DESIGN_APPROVED &&
    !hasSelectedDesignAsset({
      designProvider: latestDesignRequest?.designProvider,
      latestAsset,
      resultPayload: latestDesignRequest?.resultPayload,
    });

  if (
    contentItem.currentStatus !== ContentStatus.IN_DESIGN &&
    !canResetApprovedWithoutAsset
  ) {
    return;
  }

  const fromStatus = contentItem.currentStatus;

  assertContentStatusTransition({
    currentStatus: fromStatus,
    nextStatus: ContentStatus.READY_FOR_DESIGN,
    reason: "operator reset design state",
  });

  const actorEmail = await getActorEmail(session.email);

  await prisma.$transaction(async (tx) => {
    const statusUpdate = await tx.contentItem.updateMany({
      where: {
        id: contentItemId,
        currentStatus: fromStatus,
        deletedAt: null,
      },
      data: {
        currentStatus: ContentStatus.READY_FOR_DESIGN,
      },
    });

    if (statusUpdate.count === 0) {
      throw new Error("Item is no longer resettable.");
    }

    await tx.designRequest.updateMany({
      where: {
        contentItemId,
        deletedAt: null,
        status: {
          in: [
            DesignRequestStatus.REQUESTED,
            DesignRequestStatus.IN_PROGRESS,
            DesignRequestStatus.READY,
            DesignRequestStatus.APPROVED,
          ],
        },
      },
      data: {
        status: DesignRequestStatus.FAILED,
        errorCode: "DESIGN_RESET_BY_OPERATOR",
        errorMessage: DESIGN_RESET_NOTE,
      },
    });

    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus,
        toStatus: ContentStatus.READY_FOR_DESIGN,
        actorEmail,
        note: DESIGN_RESET_NOTE,
      },
    });
  });

  revalidatePath(`/queue/${contentItemId}`);
  revalidatePath("/queue");
}
