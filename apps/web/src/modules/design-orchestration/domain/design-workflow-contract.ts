/**
 * Design Workflow Contract — phase-1.0
 *
 * This module defines the authoritative meaning of every design-phase
 * ContentStatus value, the events that drive each transition, and the
 * minimum data required before entering each state.
 *
 * It does NOT perform side-effects.  All transition assertions must
 * still go through assertContentStatusTransition() in phase-one-workflow.ts,
 * which is the single source of truth for allowed edges.
 *
 * Future design providers (Canva, Nano Banana, …) must conform to the
 * DesignExecutionProvider interface defined in design-provider.ts and
 * must map their own internal states onto this contract's state vocabulary.
 */

import { ContentStatus } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Design phase state definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subset of ContentStatus values that belong to the design phase.
 * Ordered from earliest to latest in the happy path.
 */
export const DESIGN_PHASE_STATES = [
  ContentStatus.READY_FOR_DESIGN,
  ContentStatus.IN_DESIGN,
  ContentStatus.DESIGN_REQUESTED,      // legacy compat — maps to IN_DESIGN intent
  ContentStatus.DESIGN_IN_PROGRESS,    // legacy compat — maps to IN_DESIGN intent
  ContentStatus.DESIGN_READY,
  ContentStatus.DESIGN_APPROVED,
  ContentStatus.DESIGN_FAILED,
] as const satisfies readonly ContentStatus[];

export type DesignPhaseState = (typeof DESIGN_PHASE_STATES)[number];

/**
 * Human-readable description of each design state.
 *
 * READY_FOR_DESIGN   – Copy is final and all required metadata is present.
 *                      Item is waiting for a design run to be triggered.
 *                      Entered from: WAITING_FOR_COPY (copy confirmed)
 *                        or CHANGES_REQUESTED (re-routed back to design start)
 *
 * IN_DESIGN          – A design execution request has been submitted to a
 *                      provider and is actively being processed (new path).
 *                      Entered from: READY_FOR_DESIGN (trigger), DESIGN_FAILED (retry)
 *
 * DESIGN_REQUESTED   – Legacy alias for the "submitted" stage.
 *                      Kept for backward compatibility with existing DB rows.
 *                      New code should prefer IN_DESIGN.
 *
 * DESIGN_IN_PROGRESS – Legacy alias for the "running" stage.
 *                      Kept for backward compatibility.
 *                      New code should prefer IN_DESIGN.
 *
 * DESIGN_READY       – Provider returned a completed asset.
 *                      Item is awaiting human review / approval.
 *                      Entered from: IN_DESIGN / DESIGN_IN_PROGRESS (sync success)
 *
 * DESIGN_APPROVED    – Human reviewer has approved the completed design.
 *                      Item may proceed to translation or final review.
 *                      Entered from: DESIGN_READY (human approval action)
 *
 * DESIGN_FAILED      – Provider reported a failure or the system timed out.
 *                      Item can be retried (→ IN_DESIGN) or escalated.
 *                      Entered from: any active design state on error.
 *                      Terminal sub-types: retryable vs non-retryable (see below).
 */
export const DESIGN_STATE_DESCRIPTIONS: Record<DesignPhaseState, string> = {
  [ContentStatus.READY_FOR_DESIGN]:
    "Copy is final; item is queued for design execution.",
  [ContentStatus.IN_DESIGN]:
    "Design execution request has been submitted and is being processed by the provider.",
  [ContentStatus.DESIGN_REQUESTED]:
    "[Legacy] Submitted to provider — maps to IN_DESIGN intent. New records should use IN_DESIGN.",
  [ContentStatus.DESIGN_IN_PROGRESS]:
    "[Legacy] Provider is actively rendering — maps to IN_DESIGN intent. New records should use IN_DESIGN.",
  [ContentStatus.DESIGN_READY]:
    "Provider returned a completed asset; awaiting human review.",
  [ContentStatus.DESIGN_APPROVED]:
    "Design reviewed and approved; ready for downstream translation or final review.",
  [ContentStatus.DESIGN_FAILED]:
    "Design execution failed. Item may be retried or escalated depending on failure type.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Valid transitions (informational — enforcement is in phase-one-workflow.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Documents which transitions are explicitly valid within the design phase.
 *
 * IMPORTANT: These edges must match the allowedTransitions table in
 * phase-one-workflow.ts. If you add a new edge here, add it there too.
 */
export const DESIGN_VALID_TRANSITIONS: Partial<Record<DesignPhaseState, DesignPhaseState[]>> = {
  [ContentStatus.READY_FOR_DESIGN]: [
    ContentStatus.IN_DESIGN,
    ContentStatus.DESIGN_REQUESTED, // legacy compat
    ContentStatus.DESIGN_FAILED,
  ],
  [ContentStatus.IN_DESIGN]: [
    ContentStatus.READY_FOR_DESIGN,
    ContentStatus.DESIGN_READY,
    ContentStatus.DESIGN_FAILED,
    ContentStatus.DESIGN_IN_PROGRESS, // legacy compat
  ],
  [ContentStatus.DESIGN_REQUESTED]: [
    ContentStatus.DESIGN_IN_PROGRESS,
    ContentStatus.DESIGN_FAILED,
    ContentStatus.IN_DESIGN,
  ],
  [ContentStatus.DESIGN_IN_PROGRESS]: [
    ContentStatus.DESIGN_IN_PROGRESS, // self-loop for polling
    ContentStatus.DESIGN_READY,
    ContentStatus.DESIGN_FAILED,
    ContentStatus.IN_DESIGN,
  ],
  [ContentStatus.DESIGN_READY]: [
    ContentStatus.DESIGN_APPROVED,
    // CHANGES_REQUESTED is allowed from DESIGN_READY (handled by workflow, not design phase)
  ],
  [ContentStatus.DESIGN_APPROVED]: [
    ContentStatus.READY_FOR_DESIGN, // operator reset for invalid/orphan approved state
    // otherwise exits the design phase — downstream transitions handled by phase-one-workflow.ts
  ],
  [ContentStatus.DESIGN_FAILED]: [
    ContentStatus.DESIGN_REQUESTED,
    ContentStatus.IN_DESIGN,
    ContentStatus.READY_FOR_DESIGN,
  ],
};

/**
 * Transitions that are explicitly INVALID within the design phase.
 * Calling code must not attempt these; assertContentStatusTransition will throw.
 */
export const DESIGN_INVALID_TRANSITIONS: Partial<Record<DesignPhaseState, DesignPhaseState[]>> = {
  [ContentStatus.DESIGN_READY]: [
    // Cannot go back directly to an execution state without human rejection
    ContentStatus.IN_DESIGN,
    ContentStatus.DESIGN_REQUESTED,
    ContentStatus.DESIGN_IN_PROGRESS,
  ],
  [ContentStatus.DESIGN_APPROVED]: [
    // Cannot reopen an approved design without a full new request
    ContentStatus.IN_DESIGN,
    ContentStatus.DESIGN_REQUESTED,
    ContentStatus.DESIGN_READY,
    ContentStatus.DESIGN_FAILED,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Failure classification
// ─────────────────────────────────────────────────────────────────────────────

export type DesignFailureKind =
  /**
   * Transient error — safe to retry automatically (e.g. network timeout,
   * provider rate-limit, temporary unavailability).
   */
  | "RETRYABLE"
  /**
   * Provider returned a deterministic failure (e.g. invalid template ID,
   * rejected content, malformed request).  Manual intervention required
   * before a new attempt makes sense.
   */
  | "TERMINAL"
  /**
   * Provider returned an unexpected / malformed response that cannot be
   * parsed. Treat as TERMINAL until the provider contract is understood.
   */
  | "MALFORMED_RESPONSE";

/**
 * Maximum automatic retry count before escalating to TERMINAL.
 * Enforced by the application layer, not the domain.
 */
export const DESIGN_MAX_AUTO_RETRIES = 3;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Minimum data required before entering each design state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Describes the minimum data that must be present on a content item
 * before it may enter the given design state.  Used by the readiness
 * gate (see: isReadyForDesign) and by the DesignInputContract builder.
 */
export const DESIGN_STATE_PREREQUISITES = {
  /**
   * READY_FOR_DESIGN prerequisites:
   * - copy exists and is non-empty (the primary copy field)
   * - item is not already published or posted
   * - item is not blocked in an active design request
   */
  [ContentStatus.READY_FOR_DESIGN]: {
    requiresCopy: true,
    requiresTitle: true,
    mustNotBePublished: true,
    mustNotBeActiveDesign: true,
  },

  /**
   * IN_DESIGN prerequisites:
   * - all READY_FOR_DESIGN prerequisites hold
   * - a profile-to-template mapping must exist for the item's profile/type/locale
   * - no other active (REQUESTED | IN_PROGRESS) design request exists
   */
  [ContentStatus.IN_DESIGN]: {
    requiresCopy: true,
    requiresTitle: true,
    requiresProfileTemplateMapping: true,
    mustNotHaveActiveRequest: true,
  },

  /**
   * DESIGN_READY prerequisites:
   * - provider returned a successful result payload
   * - at least one ContentAsset of type STATIC_IMAGE | EXPORT_PACKAGE is READY
   */
  [ContentStatus.DESIGN_READY]: {
    requiresAsset: true,
  },

  /**
   * DESIGN_APPROVED prerequisites:
   * - currentStatus is DESIGN_READY
   * - an authorized reviewer performed the approval action
   */
  [ContentStatus.DESIGN_APPROVED]: {
    requiresDesignReadyStatus: true,
    requiresHumanApproval: true,
  },

  /**
   * DESIGN_FAILED has no prerequisites — it can be entered from any
   * active design state when the provider reports an error.
   */
  [ContentStatus.DESIGN_FAILED]: {},
} as const;
