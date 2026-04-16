-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('ADMIN', 'EDITOR', 'APPROVER', 'TRANSLATION_APPROVER');

-- CreateEnum
CREATE TYPE "UpstreamSystem" AS ENUM ('GOOGLE_SHEETS');

-- CreateEnum
CREATE TYPE "OrchestratorType" AS ENUM ('ZAPIER', 'N8N', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('PREVIEW', 'COMMIT');

-- CreateEnum
CREATE TYPE "ImportReceiptStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentProfile" AS ENUM ('YANN', 'YURI', 'ZAZMIC_JOBS');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('STATIC_POST', 'CAROUSEL');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('IMPORTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'CONTENT_APPROVED', 'DESIGN_IN_PROGRESS', 'DESIGN_READY', 'TRANSLATION_PENDING', 'TRANSLATION_APPROVED', 'READY_TO_PUBLISH', 'PUBLISHED_MANUALLY');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('COMMENT', 'REVISION');

-- CreateEnum
CREATE TYPE "ApprovalStage" AS ENUM ('PUBLISH', 'TRANSLATION');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "DesignProvider" AS ENUM ('CANVA', 'AI_VISUAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "DesignRequestStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STATIC_IMAGE', 'CAROUSEL_SLIDE', 'EXPORT_PACKAGE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('DRAFT', 'READY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('NOT_REQUIRED', 'REQUESTED', 'READY_FOR_APPROVAL', 'APPROVED');

-- CreateEnum
CREATE TYPE "WorksheetSelectionStrategy" AS ENUM ('EXPLICIT_WORKSHEET_ID', 'EXACT_WORKSHEET_NAME', 'MONTHLY_TAB_PATTERN');

-- CreateEnum
CREATE TYPE "TitleDerivationStrategy" AS ENUM ('EXPLICIT_MAPPED_FIELD', 'PROFILE_FALLBACK_FIELD', 'HEURISTIC_LAST_RESORT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AppRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "profile" "ContentProfile" NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "copy" TEXT NOT NULL,
    "sourceLocale" TEXT NOT NULL DEFAULT 'en',
    "translationStatus" "TranslationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "translationRequired" BOOLEAN NOT NULL DEFAULT false,
    "currentStatus" "ContentStatus" NOT NULL DEFAULT 'IMPORTED',
    "planningSnapshot" JSONB NOT NULL,
    "latestImportAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentSourceLink" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "upstreamSystem" "UpstreamSystem" NOT NULL,
    "sheetProfileKey" TEXT,
    "sheetProfileVersion" INTEGER,
    "spreadsheetId" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "worksheetName" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "rowVersion" TEXT,
    "lastFingerprint" TEXT,
    "pushbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportReceipt" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "mode" "ImportMode" NOT NULL DEFAULT 'COMMIT',
    "orchestrator" "OrchestratorType" NOT NULL,
    "upstreamSystem" "UpstreamSystem" NOT NULL,
    "sheetProfileKey" TEXT,
    "sheetProfileVersion" INTEGER,
    "status" "ImportReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
    "payloadVersion" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contentItemId" TEXT,
    "importedById" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ImportReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowNote" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "NoteType" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "stage" "ApprovalStage" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusEvent" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "fromStatus" "ContentStatus",
    "toStatus" "ContentStatus" NOT NULL,
    "actorEmail" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileTemplateMapping" (
    "id" TEXT NOT NULL,
    "profile" "ContentProfile" NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "designProvider" "DesignProvider" NOT NULL DEFAULT 'CANVA',
    "externalTemplateId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileTemplateMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignRequest" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "profileMappingId" TEXT,
    "designProvider" "DesignProvider" NOT NULL,
    "status" "DesignRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "externalRequestId" TEXT,
    "requestPayload" JSONB,
    "resultPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAsset" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "designRequestId" TEXT,
    "assetType" "AssetType" NOT NULL,
    "assetStatus" "AssetStatus" NOT NULL DEFAULT 'DRAFT',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "slideIndex" INTEGER,
    "externalUrl" TEXT,
    "storagePath" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_canonicalKey_key" ON "ContentItem"("canonicalKey");

-- CreateIndex
CREATE UNIQUE INDEX "ContentSourceLink_upstreamSystem_spreadsheetId_worksheetId__key" ON "ContentSourceLink"("upstreamSystem", "spreadsheetId", "worksheetId", "rowId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportReceipt_idempotencyKey_mode_key" ON "ImportReceipt"("idempotencyKey", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileTemplateMapping_profile_contentType_locale_designPro_key" ON "ProfileTemplateMapping"("profile", "contentType", "locale", "designProvider", "externalTemplateId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSourceLink" ADD CONSTRAINT "ContentSourceLink_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportReceipt" ADD CONSTRAINT "ImportReceipt_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportReceipt" ADD CONSTRAINT "ImportReceipt_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowNote" ADD CONSTRAINT "WorkflowNote_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowNote" ADD CONSTRAINT "WorkflowNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignRequest" ADD CONSTRAINT "DesignRequest_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignRequest" ADD CONSTRAINT "DesignRequest_profileMappingId_fkey" FOREIGN KEY ("profileMappingId") REFERENCES "ProfileTemplateMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_designRequestId_fkey" FOREIGN KEY ("designRequestId") REFERENCES "DesignRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
