import type { PublishLanguage, TranslationStatus } from "@prisma/client";

export type PublishCopyResult = {
  ok: true;
  language: PublishLanguage;
  copy: string;
};

export type PublishCopyError = {
  ok: false;
  reason:
    | "NO_LANGUAGE_SELECTED"
    | "TRANSLATION_NOT_APPROVED"
    | "TRANSLATION_COPY_MISSING";
  language: PublishLanguage | null;
};

type CopySource = {
  selectedPublishLanguage: PublishLanguage | null;
  copy: string;
  translationPtBrCopy: string | null;
  translationPtBrStatus: TranslationStatus;
  translationFrCopy: string | null;
  translationFrStatus: TranslationStatus;
};

export function resolvePublishCopy(item: CopySource): PublishCopyResult | PublishCopyError {
  const lang = item.selectedPublishLanguage;

  if (!lang) {
    return { ok: false, reason: "NO_LANGUAGE_SELECTED", language: null };
  }

  if (lang === "ENG") {
    return { ok: true, language: "ENG", copy: item.copy };
  }

  if (lang === "PT_BR") {
    if (item.translationPtBrStatus !== "APPROVED") {
      return { ok: false, reason: "TRANSLATION_NOT_APPROVED", language: "PT_BR" };
    }
    if (!item.translationPtBrCopy) {
      return { ok: false, reason: "TRANSLATION_COPY_MISSING", language: "PT_BR" };
    }
    return { ok: true, language: "PT_BR", copy: item.translationPtBrCopy };
  }

  if (lang === "FR") {
    if (item.translationFrStatus !== "APPROVED") {
      return { ok: false, reason: "TRANSLATION_NOT_APPROVED", language: "FR" };
    }
    if (!item.translationFrCopy) {
      return { ok: false, reason: "TRANSLATION_COPY_MISSING", language: "FR" };
    }
    return { ok: true, language: "FR", copy: item.translationFrCopy };
  }

  return { ok: false, reason: "NO_LANGUAGE_SELECTED", language: null };
}
