-- Add explicit design rejection state for operator-driven design feedback.

ALTER TYPE "DesignRequestStatus" ADD VALUE 'REJECTED';
