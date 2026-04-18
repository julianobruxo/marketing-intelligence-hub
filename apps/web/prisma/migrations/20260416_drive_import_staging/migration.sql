-- CreateEnum
CREATE TYPE "DriveImportBatchStatus" AS ENUM ('STAGED', 'PARTIALLY_SENT', 'SENT_TO_QUEUE', 'NEEDS_REIMPORT_DECISION', 'FAILED');

-- CreateEnum
CREATE TYPE "DriveSpreadsheetState" AS ENUM ('STAGED', 'PARTIALLY_SENT', 'SENT_TO_QUEUE', 'NEEDS_REIMPORT_DECISION');

-- CreateEnum
CREATE TYPE "DriveSpreadsheetRowState" AS ENUM ('STAGED', 'QUEUE_PENDING', 'QUEUED', 'UPDATED', 'REPLACED', 'KEPT_AS_IS', 'DUPLICATE', 'CONFLICT', 'SKIPPED', 'REJECTED', 'PUBLISHED_COMPLETE');

-- CreateEnum
CREATE TYPE "DriveConflictConfidence" AS ENUM ('HIGH_CONFIDENCE_DUPLICATE', 'POSSIBLE_DUPLICATE', 'NO_MEANINGFUL_MATCH');

-- CreateEnum
CREATE TYPE "DriveReimportStrategy" AS ENUM ('UPDATE', 'REPLACE', 'KEEP_AS_IS');

-- AlterTable
ALTER TABLE "ContentItem"
    ADD COLUMN "translationCopy" TEXT,
    ADD COLUMN "translationRequestedAt" TIMESTAMP(3),
    ADD COLUMN "translationGeneratedAt" TIMESTAMP(3),
    ADD COLUMN "preferredDesignProvider" "DesignProvider",
    ADD COLUMN "autopostEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SpreadsheetImportBatch" (
    "id" TEXT NOT NULL,
    "importedById" TEXT,
    "driveFileId" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "spreadsheetName" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "sourceGroup" TEXT NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3),
    "reimportStrategy" "DriveReimportStrategy" NOT NULL DEFAULT 'UPDATE',
    "status" "DriveImportBatchStatus" NOT NULL DEFAULT 'STAGED',
    "scanFingerprint" TEXT NOT NULL,
    "sourceContext" JSONB NOT NULL,
    "pipelineSignals" JSONB NOT NULL,
    "validWorksheetCount" INTEGER NOT NULL DEFAULT 0,
    "detectedRowCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedRowCount" INTEGER NOT NULL DEFAULT 0,
    "importedRowCount" INTEGER NOT NULL DEFAULT 0,
    "updatedRowCount" INTEGER NOT NULL DEFAULT 0,
    "replacedRowCount" INTEGER NOT NULL DEFAULT 0,
    "keptRowCount" INTEGER NOT NULL DEFAULT 0,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "alreadyPublishedRowCount" INTEGER NOT NULL DEFAULT 0,
    "stagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpreadsheetImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpreadsheetImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "worksheetName" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "rowVersion" TEXT,
    "rowKind" TEXT NOT NULL DEFAULT 'DATA',
    "rowStatus" "DriveSpreadsheetRowState" NOT NULL DEFAULT 'STAGED',
    "conflictConfidence" "DriveConflictConfidence" NOT NULL DEFAULT 'NO_MEANINGFUL_MATCH',
    "conflictAction" "DriveReimportStrategy",
    "existingContentItemId" TEXT,
    "contentItemId" TEXT,
    "title" TEXT NOT NULL,
    "idea" TEXT,
    "copy" TEXT NOT NULL,
    "translationDraft" TEXT,
    "plannedDate" TEXT,
    "publishedFlag" TEXT,
    "publishedPostUrl" TEXT,
    "sourceAssetLink" TEXT,
    "translationRequired" BOOLEAN NOT NULL DEFAULT false,
    "autoPostEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preferredDesignProvider" "DesignProvider",
    "matchSignals" JSONB NOT NULL,
    "rowPayload" JSONB NOT NULL,
    "normalizedPayload" JSONB,
    "conflictSuggestion" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpreadsheetImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpreadsheetImportBatch_spreadsheetId_idx" ON "SpreadsheetImportBatch"("spreadsheetId");

-- CreateIndex
CREATE INDEX "SpreadsheetImportBatch_status_stagedAt_idx" ON "SpreadsheetImportBatch"("status", "stagedAt");

-- CreateIndex
CREATE INDEX "SpreadsheetImportRow_batchId_rowStatus_idx" ON "SpreadsheetImportRow"("batchId", "rowStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SpreadsheetImportRow_batchId_rowId_key" ON "SpreadsheetImportRow"("batchId", "rowId");

-- AddForeignKey
ALTER TABLE "SpreadsheetImportBatch" ADD CONSTRAINT "SpreadsheetImportBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpreadsheetImportRow" ADD CONSTRAINT "SpreadsheetImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SpreadsheetImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
