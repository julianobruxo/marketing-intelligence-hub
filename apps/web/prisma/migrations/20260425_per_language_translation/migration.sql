-- Phase 1: per-language translation fields + publish language selection
-- Additive only — no existing columns removed or modified.

CREATE TYPE "PublishLanguage" AS ENUM ('ENG', 'PT_BR', 'FR');

ALTER TABLE "ContentItem"
  ADD COLUMN "translationPtBrCopy"        TEXT,
  ADD COLUMN "translationPtBrStatus"      "TranslationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "translationPtBrRequestedAt" TIMESTAMP(3),
  ADD COLUMN "translationPtBrGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "translationPtBrApprovedAt"  TIMESTAMP(3),
  ADD COLUMN "translationFrCopy"          TEXT,
  ADD COLUMN "translationFrStatus"        "TranslationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "translationFrRequestedAt"   TIMESTAMP(3),
  ADD COLUMN "translationFrGeneratedAt"   TIMESTAMP(3),
  ADD COLUMN "translationFrApprovedAt"    TIMESTAMP(3),
  ADD COLUMN "selectedPublishLanguage"    "PublishLanguage";
