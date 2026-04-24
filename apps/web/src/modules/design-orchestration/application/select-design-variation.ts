"use server";

import { ContentStatus, DesignRequestStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { getPrisma } from "@/shared/lib/prisma";

function toJsonValue(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

/**
 * Selects one variation from a completed Nano Banana design request.
 *
 * The ContentItem must be in DESIGN_READY state.
 * The selected variation's thumbnailUrl replaces the current ContentAsset
 * externalUrl, and the selection is recorded in the asset's metadata and
 * in the DesignRequest resultPayload.
 *
 * No status transition occurs — the item stays in DESIGN_READY awaiting
 * the operator's final approval.
 *
 * FormData fields:
 *   contentItemId     — required
 *   variationId       — the variation object id (e.g. "nb-...-v2")
 *   variationLabel    — human label (e.g. "Variation 2")
 *   thumbnailUrl      — URL to use as the new asset externalUrl
 *   editUrl           — URL for the edit link stored in metadata
 */
export async function selectDesignVariationAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();

  const contentItemId = String(formData.get("contentItemId") ?? "");
  const variationId = String(formData.get("variationId") ?? "");
  const variationLabel = String(formData.get("variationLabel") ?? "");
  const thumbnailUrl = String(formData.get("thumbnailUrl") ?? "");
  const editUrl = String(formData.get("editUrl") ?? "");

  if (!contentItemId || !variationId || !thumbnailUrl) return;

  const contentItem = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    include: {
      designRequests: {
        where: { deletedAt: null, status: DesignRequestStatus.READY },
        orderBy: [{ attemptNumber: "desc" }],
        take: 1,
      },
      assets: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!contentItem) return;
  if (contentItem.currentStatus !== ContentStatus.DESIGN_READY) return;

  const latestRequest = contentItem.designRequests[0];
  if (!latestRequest) return;

  const latestAsset = contentItem.assets[0];

  await prisma.$transaction(async (tx) => {
    // Update the ContentAsset to point to the selected variation
    if (latestAsset) {
      await tx.contentAsset.update({
        where: { id: latestAsset.id },
        data: {
          externalUrl: thumbnailUrl,
          metadata: toJsonValue({
            ...(latestAsset.metadata && typeof latestAsset.metadata === "object"
              ? (latestAsset.metadata as Record<string, unknown>)
              : {}),
            selectedVariationId: variationId,
            selectedVariationLabel: variationLabel,
            editUrl,
          }),
        },
      });
    }

    // Record the selection in the DesignRequest resultPayload
    const existingResult =
      latestRequest.resultPayload && typeof latestRequest.resultPayload === "object"
        ? (latestRequest.resultPayload as Record<string, unknown>)
        : {};

    await tx.designRequest.update({
      where: { id: latestRequest.id },
      data: {
        resultPayload: toJsonValue({
          ...existingResult,
          selectedVariation: {
            id: variationId,
            label: variationLabel,
            thumbnailUrl,
            editUrl,
            selectedBy: session.email,
          },
        }),
      },
    });

    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus: ContentStatus.DESIGN_READY,
        toStatus: ContentStatus.DESIGN_READY,
        actorEmail: session.email,
        note: `${variationLabel || variationId} selected as the approved variation.`,
      },
    });
  });

  revalidatePath(`/queue/${contentItemId}`);
}
