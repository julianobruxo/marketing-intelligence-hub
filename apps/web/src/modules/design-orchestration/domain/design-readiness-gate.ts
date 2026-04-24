/**
 * Design Readiness Gate — phase-1.0
 *
 * Defines the gating rules that determine whether a content item is
 * eligible to enter the design phase (i.e. transition to READY_FOR_DESIGN
 * or trigger a design execution request).
 *
 * Rules are expressed as pure functions with no side-effects and no
 * database access.  They operate on data already loaded by the caller.
 *
 * Architecture note:
 *   This module is the single source of truth for design eligibility.
 *   Do not duplicate these checks in UI components, route handlers, or
 *   the application use case.  Call these functions instead.
 */

import { ContentStatus, ContentType } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Types — minimal shape required to evaluate readiness
// ─────────────────────────────────────────────────────────────────────────────

export type DesignReadinessInput = {
  currentStatus: ContentStatus;
  copy: string;
  title: string;
  contentType: ContentType;
  sourceLocale: string;
  /** Whether any design request is currently REQUESTED or IN_PROGRESS. */
  hasActiveDesignRequest: boolean;
};

export type DesignReadinessResult =
  | { eligible: true }
  | { eligible: false; reasons: string[] };

// ─────────────────────────────────────────────────────────────────────────────
// Statuses from which design execution may be triggered
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The set of ContentStatus values from which a new design request may be
 * triggered or retried.
 *
 * Legacy path:  CONTENT_APPROVED  (existing data)
 * New path:     READY_FOR_DESIGN, IN_DESIGN (re-trigger after state reset)
 * Retry path:   DESIGN_FAILED, CHANGES_REQUESTED (design rejection feedback)
 */
const DESIGN_TRIGGER_ELIGIBLE_STATUSES = new Set<ContentStatus>([
  ContentStatus.CONTENT_APPROVED,     // legacy — kept for existing records
  ContentStatus.READY_FOR_DESIGN,     // new canonical entry point
  ContentStatus.DESIGN_FAILED,        // retry allowed
  ContentStatus.CHANGES_REQUESTED,    // design rejection / revision loop
]);

/**
 * Statuses that represent a terminal or post-design state where triggering
 * design would be destructive or nonsensical.
 */
const DESIGN_TRIGGER_BLOCKED_STATUSES = new Set<ContentStatus>([
  ContentStatus.BLOCKED,
  ContentStatus.DESIGN_READY,
  ContentStatus.DESIGN_APPROVED,
  ContentStatus.TRANSLATION_APPROVED,
  ContentStatus.READY_FOR_FINAL_REVIEW,
  ContentStatus.READY_TO_POST,
  ContentStatus.POSTED,
  ContentStatus.READY_TO_PUBLISH,
  ContentStatus.PUBLISHED_MANUALLY,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Gate functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the item's current status is one from which a design
 * execution may be triggered (including retries from DESIGN_FAILED).
 */
export function canTriggerDesignFromStatus(status: ContentStatus): boolean {
  return DESIGN_TRIGGER_ELIGIBLE_STATUSES.has(status);
}

/**
 * Returns true if the item's current status is in a terminal or post-design
 * state where triggering design would be incorrect.
 */
export function isDesignTriggerBlocked(status: ContentStatus): boolean {
  return DESIGN_TRIGGER_BLOCKED_STATUSES.has(status);
}

/**
 * Evaluates whether a content item is genuinely eligible for design execution.
 *
 * Returns `{ eligible: true }` if all gates pass.
 * Returns `{ eligible: false, reasons: string[] }` with human-readable
 * explanations for each failing gate.
 *
 * Callers should use this before submitting a design request; the
 * application use case (run-canva-design-request.ts) does so via the
 * status check, but this function provides the richer reason set needed
 * for UI feedback and auditability.
 */
export function evaluateDesignReadiness(
  input: DesignReadinessInput,
): DesignReadinessResult {
  const reasons: string[] = [];

  // Gate 1: status must be in the eligible set
  if (!canTriggerDesignFromStatus(input.currentStatus)) {
    reasons.push(
      `Status '${input.currentStatus}' is not eligible for design trigger. ` +
        `Eligible statuses: ${[...DESIGN_TRIGGER_ELIGIBLE_STATUSES].join(", ")}.`,
    );
  }

  // Gate 2: copy must be non-empty
  if (!input.copy || input.copy.trim().length === 0) {
    reasons.push("Copy is empty. The item must have final approved copy before design can run.");
  }

  // Gate 3: title must be non-empty
  if (!input.title || input.title.trim().length === 0) {
    reasons.push("Title is empty. A title is required for template filling.");
  }

  // Gate 4: no active design request in flight
  if (input.hasActiveDesignRequest) {
    reasons.push(
      "An active design request (REQUESTED or IN_PROGRESS) already exists. " +
        "Wait for it to complete or fail before triggering a new one.",
    );
  }

  if (reasons.length > 0) {
    return { eligible: false, reasons };
  }

  return { eligible: true };
}

/**
 * Convenience predicate — returns true only if all gates pass.
 * Use evaluateDesignReadiness() when you need failure reasons.
 */
export function isReadyForDesign(input: DesignReadinessInput): boolean {
  return evaluateDesignReadiness(input).eligible;
}
