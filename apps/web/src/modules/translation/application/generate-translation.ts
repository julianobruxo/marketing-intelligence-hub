export type TranslationDraftInput = {
  sourceText: string;
  sourceLocale?: string;
  targetLocale?: string;
};

export function generateMockTranslationDraft(input: TranslationDraftInput) {
  const normalizedSource = input.sourceText.trim().replace(/\s+/g, " ");

  if (!normalizedSource) {
    return "";
  }

  const targetLocale = input.targetLocale?.trim().toLowerCase() || "pt-br";

  if ((input.sourceLocale ?? "en").trim().toLowerCase() === targetLocale) {
    return normalizedSource;
  }

  return `[${targetLocale.toUpperCase()}] ${normalizedSource}`;
}
