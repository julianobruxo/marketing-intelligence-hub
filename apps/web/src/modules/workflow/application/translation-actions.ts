"use server";

import { ApprovalDecision, ApprovalStage, ContentStatus, PublishLanguage, TranslationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { getPrisma } from "@/shared/lib/prisma";
import { assertContentStatusTransition } from "@/modules/workflow/domain/phase-one-workflow";

export type TranslationLanguage = "PT_BR" | "FR";

// ─── helpers ─────────────────────────────────────────────────────────────────

function langLabel(lang: TranslationLanguage) {
  return lang === "PT_BR" ? "PT-BR" : "French";
}

function perLangRequestedFields(lang: TranslationLanguage, now: Date) {
  return lang === "PT_BR"
    ? { translationPtBrStatus: TranslationStatus.REQUESTED, translationPtBrRequestedAt: now }
    : { translationFrStatus: TranslationStatus.REQUESTED, translationFrRequestedAt: now };
}

function perLangCopyFields(lang: TranslationLanguage, copy: string, now: Date) {
  return lang === "PT_BR"
    ? {
        translationPtBrCopy: copy,
        translationPtBrStatus: TranslationStatus.READY_FOR_APPROVAL,
        translationPtBrGeneratedAt: now,
      }
    : {
        translationFrCopy: copy,
        translationFrStatus: TranslationStatus.READY_FOR_APPROVAL,
        translationFrGeneratedAt: now,
      };
}

function perLangApprovedFields(lang: TranslationLanguage, now: Date) {
  return lang === "PT_BR"
    ? { translationPtBrStatus: TranslationStatus.APPROVED, translationPtBrApprovedAt: now }
    : { translationFrStatus: TranslationStatus.APPROVED, translationFrApprovedAt: now };
}

// ─── actions ─────────────────────────────────────────────────────────────────

/**
 * Triggered from DESIGN_APPROVED — requests translation for a specific language.
 * Transitions the item to TRANSLATION_REQUESTED and marks the per-language status
 * as REQUESTED.
 */
export async function requestTranslationAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "");
  const language = String(formData.get("language") ?? "") as TranslationLanguage;

  if (!contentItemId || !["PT_BR", "FR"].includes(language)) return;

  const item = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    select: { currentStatus: true },
  });

  if (!item || item.currentStatus !== ContentStatus.DESIGN_APPROVED) return;

  const nextStatus = ContentStatus.TRANSLATION_REQUESTED;
  assertContentStatusTransition({
    currentStatus: item.currentStatus,
    nextStatus,
    reason: `translation requested for ${langLabel(language)}`,
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.contentItem.update({
      where: { id: contentItemId },
      data: { currentStatus: nextStatus, ...perLangRequestedFields(language, now) },
    });
    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus: item.currentStatus,
        toStatus: nextStatus,
        actorEmail: session.email,
        note: `${langLabel(language)} translation requested.`,
      },
    });
  });

  revalidatePath(`/queue/${contentItemId}`);
  revalidatePath("/queue");
}

/**
 * Skips translation — transitions directly from DESIGN_APPROVED to
 * READY_FOR_FINAL_REVIEW. English copy will be used for publishing.
 */
export async function skipTranslationAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "");

  if (!contentItemId) return;

  const item = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    select: { currentStatus: true },
  });

  if (!item || item.currentStatus !== ContentStatus.DESIGN_APPROVED) return;

  const nextStatus = ContentStatus.READY_FOR_FINAL_REVIEW;
  assertContentStatusTransition({
    currentStatus: item.currentStatus,
    nextStatus,
    reason: "translation skipped",
  });

  await prisma.$transaction(async (tx) => {
    await tx.contentItem.update({
      where: { id: contentItemId },
      data: { currentStatus: nextStatus, selectedPublishLanguage: PublishLanguage.ENG },
    });
    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus: item.currentStatus,
        toStatus: nextStatus,
        actorEmail: session.email,
        note: "Translation skipped. Proceeding with English copy.",
      },
    });
  });

  revalidatePath(`/queue/${contentItemId}`);
  revalidatePath("/queue");
}

/**
 * Submits the translated copy for a specific language, advancing the item to
 * TRANSLATION_READY. Also valid when called from TRANSLATION_READY to update
 * the copy without a status change.
 */
export async function submitTranslationCopyAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "");
  const language = String(formData.get("language") ?? "") as TranslationLanguage;
  const copy = String(formData.get("copy") ?? "").trim();

  if (!contentItemId || !["PT_BR", "FR"].includes(language) || !copy) return;

  const item = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    select: { currentStatus: true },
  });

  if (!item) return;

  const allowedFrom: ContentStatus[] = [ContentStatus.TRANSLATION_REQUESTED, ContentStatus.TRANSLATION_READY];
  if (!allowedFrom.includes(item.currentStatus)) return;

  const nextStatus = ContentStatus.TRANSLATION_READY;
  const now = new Date();
  const statusChanging = item.currentStatus !== nextStatus;

  await prisma.$transaction(async (tx) => {
    await tx.contentItem.update({
      where: { id: contentItemId },
      data: { currentStatus: nextStatus, ...perLangCopyFields(language, copy, now) },
    });
    if (statusChanging) {
      await tx.statusEvent.create({
        data: {
          contentItemId,
          fromStatus: item.currentStatus,
          toStatus: nextStatus,
          actorEmail: session.email,
          note: `${langLabel(language)} translation copy submitted for review.`,
        },
      });
    }
  });

  revalidatePath(`/queue/${contentItemId}`);
}

/**
 * Approves the per-language translation and transitions to TRANSLATION_APPROVED.
 * Requires the TRANSLATION_APPROVER or ADMIN role.
 */
export async function approveTranslationLanguageAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "");
  const language = String(formData.get("language") ?? "") as TranslationLanguage;

  if (!contentItemId || !["PT_BR", "FR"].includes(language)) return;

  if (!session.roles.includes("TRANSLATION_APPROVER") && !session.roles.includes("ADMIN")) return;

  const actor = await prisma.user.findUnique({ where: { email: session.email } });
  if (!actor) return;

  const item = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    select: { currentStatus: true },
  });

  if (!item || item.currentStatus !== ContentStatus.TRANSLATION_READY) return;

  const nextStatus = ContentStatus.TRANSLATION_APPROVED;
  assertContentStatusTransition({
    currentStatus: item.currentStatus,
    nextStatus,
    reason: `${langLabel(language)} translation approved`,
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.contentItem.update({
      where: { id: contentItemId },
      data: { currentStatus: nextStatus, ...perLangApprovedFields(language, now) },
    });
    await tx.approvalRecord.create({
      data: {
        contentItemId,
        actorId: actor.id,
        stage: ApprovalStage.TRANSLATION,
        decision: ApprovalDecision.APPROVED,
        note: `${langLabel(language)} translation approved.`,
      },
    });
    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus: item.currentStatus,
        toStatus: nextStatus,
        actorEmail: session.email,
        note: `${langLabel(language)} translation approved.`,
      },
    });
  });

  revalidatePath(`/queue/${contentItemId}`);
  revalidatePath("/queue");
}

/**
 * Sets the publish language and advances from TRANSLATION_APPROVED to
 * READY_FOR_FINAL_REVIEW. Validates that the selected translated language
 * is fully approved before allowing that selection.
 */
export async function selectPublishLanguageAndProceedAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "");
  const language = String(formData.get("language") ?? "") as keyof typeof PublishLanguage;

  if (!contentItemId || !["ENG", "PT_BR", "FR"].includes(language)) return;

  const item = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    select: {
      currentStatus: true,
      translationPtBrStatus: true,
      translationFrStatus: true,
    },
  });

  if (!item || item.currentStatus !== ContentStatus.TRANSLATION_APPROVED) return;

  // Validate: translated language must be fully approved before it can be selected.
  if (language === "PT_BR" && item.translationPtBrStatus !== TranslationStatus.APPROVED) return;
  if (language === "FR" && item.translationFrStatus !== TranslationStatus.APPROVED) return;

  const nextStatus = ContentStatus.READY_FOR_FINAL_REVIEW;
  assertContentStatusTransition({
    currentStatus: item.currentStatus,
    nextStatus,
    reason: `publish language selected: ${language}`,
  });

  await prisma.$transaction(async (tx) => {
    await tx.contentItem.update({
      where: { id: contentItemId },
      data: {
        currentStatus: nextStatus,
        selectedPublishLanguage: language as PublishLanguage,
      },
    });
    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus: item.currentStatus,
        toStatus: nextStatus,
        actorEmail: session.email,
        note: `Publish language set to ${language}. Proceeding to final review.`,
      },
    });
  });

  revalidatePath(`/queue/${contentItemId}`);
  revalidatePath("/queue");
}
