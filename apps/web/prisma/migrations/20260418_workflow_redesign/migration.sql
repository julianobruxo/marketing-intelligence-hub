-- AlterEnum: add new ContentStatus values for official workflow redesign
-- Old values are retained for backwards compatibility with existing rows.

ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_COPY';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_DESIGN';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'IN_DESIGN';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'TRANSLATION_REQUESTED';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'TRANSLATION_READY';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_FINAL_REVIEW';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'READY_TO_POST';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'POSTED';
