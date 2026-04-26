"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { getPrisma } from "@/shared/lib/prisma";

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
    await db.contentItem.findUniqueOrThrow({ where: { id: contentItemId } });

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

    revalidatePath(`/queue/${contentItemId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save video reference",
    };
  }
}
