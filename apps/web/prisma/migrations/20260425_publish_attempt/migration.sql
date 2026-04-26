-- Add PublishAttemptMode and PublishAttemptStatus enums, then add PublishAttempt table.
-- This model stores mock and future real LinkedIn publish attempts for full auditability.

CREATE TYPE "PublishAttemptMode" AS ENUM ('MOCK', 'LINKEDIN_API');

CREATE TYPE "PublishAttemptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'POSTED', 'FAILED');

CREATE TABLE "PublishAttempt" (
    "id"                      TEXT NOT NULL,
    "contentItemId"           TEXT NOT NULL,
    "mode"                    "PublishAttemptMode" NOT NULL,
    "status"                  "PublishAttemptStatus" NOT NULL,
    "targetOwnerName"         TEXT NOT NULL,
    "targetLabel"             TEXT NOT NULL,
    "targetType"              TEXT NOT NULL,
    "targetConnectionStatus"  TEXT NOT NULL,
    "selectedPublishLanguage" "PublishLanguage" NOT NULL,
    "copySnapshot"            TEXT NOT NULL,
    "assetType"               "AssetType",
    "assetUrl"                TEXT,
    "assetSnapshot"           JSONB,
    "linkedinPostUrn"         TEXT,
    "linkedinPostUrl"         TEXT,
    "createdById"             TEXT,
    "confirmedAt"             TIMESTAMP(3),
    "postedAt"                TIMESTAMP(3),
    "errorMessage"            TEXT,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublishAttempt_contentItemId_idx" ON "PublishAttempt"("contentItemId");

CREATE INDEX "PublishAttempt_mode_status_idx" ON "PublishAttempt"("mode", "status");

ALTER TABLE "PublishAttempt"
    ADD CONSTRAINT "PublishAttempt_contentItemId_fkey"
    FOREIGN KEY ("contentItemId")
    REFERENCES "ContentItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
