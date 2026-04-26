"use server";

import { ContentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { getPrisma } from "@/shared/lib/prisma";
import { assertContentStatusTransition } from "@/modules/workflow/domain/phase-one-workflow";
import { resolveLinkedInTarget, extractOwnerFromSpreadsheetName } from "../domain/linkedin-targets";
import { resolvePublishCopy } from "../domain/resolve-publish-copy";
import { resolvePublishAsset } from "../domain/resolve-publish-asset";
import { MockLinkedInPublisher } from "./linkedin-publisher";

export type ConfirmMockPostResult =
  | { ok: true; publishAttemptId: string }
  | { ok: false; error: string };

export async function confirmMockLinkedInPostAction(
  contentItemId: string,
): Promise<ConfirmMockPostResult> {
  try {
    const session = await requireSession();
    const db = getPrisma();

    const item = await db.contentItem.findFirst({
      where: { id: contentItemId, deletedAt: null },
      include: {
        assets: { where: { deletedAt: null } },
        sourceLinks: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!item) return { ok: false, error: "Content item not found." };

    const isFromNewFlow = item.currentStatus === ContentStatus.READY_TO_POST;
    const isFromLegacy = item.currentStatus === ContentStatus.READY_TO_PUBLISH;
    if (!isFromNewFlow && !isFromLegacy) {
      return {
        ok: false,
        error: `Item is not in a postable state (current: ${item.currentStatus}).`,
      };
    }

    // Resolve LinkedIn target
    const spreadsheetName = item.sourceLinks[0]
      ? (item.planningSnapshot as Record<string, unknown> | null)?.source
        ? ((item.planningSnapshot as Record<string, Record<string, unknown>>).source?.spreadsheetName as string | undefined) ?? null
        : null
      : null;
    const ownerName = extractOwnerFromSpreadsheetName(spreadsheetName);
    const target = resolveLinkedInTarget(ownerName);

    if (!target) {
      return {
        ok: false,
        error: `No LinkedIn target found for owner "${ownerName ?? "(unknown)"}". Add this person to the LinkedIn targets registry.`,
      };
    }

    // Resolve copy
    const copyResult = resolvePublishCopy(item);
    if (!copyResult.ok) {
      const msgs: Record<string, string> = {
        NO_LANGUAGE_SELECTED: "No publish language selected on this item.",
        TRANSLATION_NOT_APPROVED: `The ${copyResult.language} translation has not been approved yet.`,
        TRANSLATION_COPY_MISSING: `The ${copyResult.language} translation copy is missing.`,
      };
      return { ok: false, error: msgs[copyResult.reason] ?? "Copy resolution failed." };
    }

    // Resolve asset (optional — posts without asset are valid)
    const assetResult = resolvePublishAsset(item.assets);
    const assetType = assetResult.ok ? assetResult.assetType : null;
    const assetUrl = assetResult.ok ? assetResult.assetUrl : null;
    const assetSnapshot = assetResult.ok ? assetResult.assetSnapshot : null;

    // Run mock publisher
    const publisher = new MockLinkedInPublisher();
    const publishResult = await publisher.publish({
      targetOwnerName: target.ownerName,
      targetLabel: target.targetLabel,
      targetType: target.targetType,
      targetConnectionStatus: target.connectionStatus,
      selectedPublishLanguage: copyResult.language,
      copySnapshot: copyResult.copy,
      assetType,
      assetUrl,
      assetSnapshot,
    });

    if (!publishResult.ok) {
      return { ok: false, error: publishResult.errorMessage };
    }

    const nextStatus = isFromNewFlow ? ContentStatus.POSTED : ContentStatus.PUBLISHED_MANUALLY;

    assertContentStatusTransition({
      currentStatus: item.currentStatus,
      nextStatus,
      reason: "mock LinkedIn post confirmed",
    });

    const publishAttemptId = await db.$transaction(async (tx) => {
      const attempt = await tx.publishAttempt.create({
        data: {
          contentItemId: item.id,
          mode: "MOCK",
          status: "POSTED",
          targetOwnerName: target.ownerName,
          targetLabel: target.targetLabel,
          targetType: target.targetType,
          targetConnectionStatus: target.connectionStatus,
          selectedPublishLanguage: copyResult.language,
          copySnapshot: copyResult.copy,
          assetType: assetType ?? undefined,
          assetUrl: assetUrl ?? undefined,
          assetSnapshot: assetSnapshot !== null ? (assetSnapshot as Prisma.InputJsonValue) : Prisma.JsonNull,
          linkedinPostUrn: publishResult.linkedinPostUrn,
          linkedinPostUrl: publishResult.linkedinPostUrl,
          createdById: session.email,
          confirmedAt: new Date(),
          postedAt: new Date(),
        },
      });

      await tx.contentItem.update({
        where: { id: item.id },
        data: { currentStatus: nextStatus },
      });

      await tx.statusEvent.create({
        data: {
          contentItemId: item.id,
          fromStatus: item.currentStatus,
          toStatus: nextStatus,
          actorEmail: session.email,
          note: `Mock LinkedIn post confirmed by ${session.email}. Attempt ID: ${attempt.id}.`,
        },
      });

      return attempt.id;
    });

    revalidatePath(`/queue/${contentItemId}`);
    revalidatePath("/queue");

    return { ok: true, publishAttemptId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected error during mock publish.",
    };
  }
}
