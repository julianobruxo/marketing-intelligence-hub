-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContentStatus" ADD VALUE 'DESIGN_REQUESTED';
ALTER TYPE "ContentStatus" ADD VALUE 'DESIGN_FAILED';
ALTER TYPE "ContentStatus" ADD VALUE 'DESIGN_APPROVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DesignRequestStatus" ADD VALUE 'READY';
ALTER TYPE "DesignRequestStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "DesignRequest" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "requestFingerprint" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DesignRequest_contentItemId_requestFingerprint_attemptNumbe_key" ON "DesignRequest"("contentItemId", "requestFingerprint", "attemptNumber");
