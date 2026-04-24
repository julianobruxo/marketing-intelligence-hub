-- Security hardening: encrypted Google tokens and soft-delete columns.

ALTER TABLE "GoogleConnection"
ADD COLUMN "accessTokenEncrypted" TEXT,
ADD COLUMN "refreshTokenEncrypted" TEXT,
ADD COLUMN "encryptionVersion" INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN "GoogleConnection"."accessToken" IS 'Deprecated: use accessTokenEncrypted.';
COMMENT ON COLUMN "GoogleConnection"."refreshToken" IS 'Deprecated: use refreshTokenEncrypted.';

ALTER TABLE "ContentItem"
ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "DesignRequest"
ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "ContentAsset"
ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "StatusEvent"
ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "WorkflowNote"
ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "ApprovalRecord"
ADD COLUMN "deletedAt" TIMESTAMP(3);
