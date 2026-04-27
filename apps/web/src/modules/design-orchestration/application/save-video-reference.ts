"use server";

import { ContentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { getPrisma } from "@/shared/lib/prisma";
import { assertContentStatusTransition } from "@/modules/workflow/domain/phase-one-workflow";

// Statuses from which a video save should advance the item to DESIGN_READY.
// These are the states where the operator reaches Start Design → Video.
const ADVANCE_TO_DESIGN_READY_FROM = new Set<ContentStatus>([
  ContentStatus.READY_FOR_DESIGN,
  ContentStatus.CHANGES_REQUESTED,
  ContentStatus.DESIGN_FAILED,
  ContentStatus.CONTENT_APPROVED,
]);

export async function saveVideoReferenceAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();

    const contentItemId = formData.get("contentItemId");
    const videoUrl = formData.get("videoUrl");
    const accessConfirmed = formData.get("accessConfirmed") === "true";

    if (typeof contentItemId !== "string" || !contentItemId.trim())
      return { success: false, error: "contentItemId is required" };
    if (typeof videoUrl !== "string" || !videoUrl.trim())
      return { success: false, error: "videoUrl is required" };
    if (!videoUrl.trim().startsWith("https://drive.google.com/"))
      return { success: false, error: "Only Google Drive video links are accepted." };
    if (!accessConfirmed)
      return { success: false, error: "Zazmic-only access confirmation is required." };

    const db = getPrisma();

    const existingItem = await db.contentItem.findUniqueOrThrow({
      where: { id: contentItemId },
      select: { currentStatus: true },
    });

    // Replace any existing VIDEO asset — one video reference per item.
    await db.contentAsset.deleteMany({ where: { contentItemId, assetType: "VIDEO" } });
    await db.contentAsset.create({
      data: {
        contentItemId,
        assetType: "VIDEO",
        assetStatus: "READY",
        externalUrl: videoUrl.trim(),
        metadata: {
          accessRestrictionConfirmed: true,
          accessRestriction: "ZAZMIC_ONLY",
          confirmedAt: new Date().toISOString(),
          confirmedBy: session.email,
        },
      },
    });

    // Advance the item to DESIGN_READY if it is currently in a pre-design-ready state.
    // Items already at DESIGN_READY (changing the video link) stay in DESIGN_READY.
    if (ADVANCE_TO_DESIGN_READY_FROM.has(existingItem.currentStatus)) {
      assertContentStatusTransition({
        currentStatus: existingItem.currentStatus,
        nextStatus: ContentStatus.DESIGN_READY,
        reason: "video reference saved",
      });

      await db.contentItem.update({
        where: { id: contentItemId },
        data: { currentStatus: ContentStatus.DESIGN_READY },
      });

      await db.statusEvent.create({
        data: {
          contentItemId,
          fromStatus: existingItem.currentStatus,
          toStatus: ContentStatus.DESIGN_READY,
          actorEmail: session.email,
          note: `Video reference saved. Status advanced to DESIGN_READY for video asset review.`,
        },
      });
    }

    revalidatePath(`/queue/${contentItemId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save video reference",
    };
  }
}
