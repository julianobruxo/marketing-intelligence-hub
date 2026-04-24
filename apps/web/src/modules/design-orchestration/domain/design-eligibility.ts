/**
 * Design Eligibility — phase-1.0
 *
 * Derives the operator-visible design readiness status for a content item.
 *
 * This is a VIEW concern, not a workflow enforcement layer.
 * It tells the operator WHY design cannot (or can) be triggered without
 * touching workflow state.  All actual state transitions are still guarded
 * by assertContentStatusTransition in phase-one-workflow.ts and by the
 * readiness gate in design-readiness-gate.ts.
 *
 * Architecture note:
 *   evaluateDesignEligibility() is the single source of truth for the
 *   operator-facing design readiness label.  Do not duplicate this logic
 *   in UI components, route handlers, or other view-model functions.
 *   Call this function instead.
 */

import { ContentStatus, ContentType } from "@prisma/client";
import { CANVA_SLICE_V1 } from "./canva-slice";
import { DESIGN_MAX_AUTO_RETRIES } from "./design-workflow-contract";

// ─────────────────────────────────────────────────────────────────────────────
// Derived eligibility status vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Operator-visible design eligibility state.
 *
 * ELIGIBLE            – All prerequisites are met.  Design can be triggered now.
 * IN_DESIGN           – A design request is actively executing (submitted or
 *                       in-progress).  No new trigger needed.
 * DESIGN_READY        – Provider returned a result.  Awaiting human approval.
 * DESIGN_APPROVED     – Design has been approved.  No further design action needed.
 * RETRY_AVAILABLE     – Last attempt failed; at least one retry is still allowed.
 * RETRY_EXHAUSTED     – All allowed attempts have been used.  Manual intervention
 *                       required before a new attempt can proceed.
 * OUT_OF_SCOPE        – Item is outside the current phase-1 design slice.
 *                       Design automation is not available for this item yet.
 * MISSING_PREREQUISITES – Required data (copy, title) is absent.
 * ACTIVE_REQUEST_EXISTS – A design request is already in flight.
 * DOWNSTREAM_COMPLETE – Item has moved past the design phase entirely.
 */
export type DesignEligibilityStatus =
  | "ELIGIBLE"
  | "IN_DESIGN"
  | "DESIGN_READY"
  | "DESIGN_APPROVED"
  | "RETRY_AVAILABLE"
  | "RETRY_EXHAUSTED"
  | "OUT_OF_SCOPE"
  | "MISSING_PREREQUISITES"
  | "ACTIVE_REQUEST_EXISTS"
  | "DOWNSTREAM_COMPLETE";

// ─────────────────────────────────────────────────────────────────────────────
// Out-of-scope reason codes (structured for programmatic use by UI / logging)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Machine-readable reason for why an item is outside the current design scope.
 *
 * UNSUPPORTED_CONTENT_TYPE    – contentType is not in the current phase-1 slice
 *                               (e.g. CAROUSEL; only STATIC_POST is supported).
 * UNSUPPORTED_LOCALE          – sourceLocale is not in the current phase-1 slice
 *                               (e.g. "pt-br"; only "en" is supported).
 * NO_ACTIVE_TEMPLATE_MAPPING  – No active ProfileTemplateMapping exists for
 *                               this item's profile / contentType / locale
 *                               combination.  This implicitly covers profile
 *                               mismatch (e.g. non-SHAWN profiles) because the
 *                               mapping table is the authoritative routing gate.
 */
export type OutOfScopeReason =
  | "UNSUPPORTED_CONTENT_TYPE"
  | "UNSUPPORTED_LOCALE"
  | "NO_ACTIVE_TEMPLATE_MAPPING";

// ─────────────────────────────────────────────────────────────────────────────
// Result and input types
// ─────────────────────────────────────────────────────────────────────────────

export type DesignEligibilityResult = {
  status: DesignEligibilityStatus;
  /** Human-readable explanations for the operator. May be empty for clear states. */
  reasons: string[];
  /** Structured codes when status === "OUT_OF_SCOPE". Empty for all other statuses. */
  outOfScopeReasons: OutOfScopeReason[];
};

export type DesignEligibilityInput = {
  currentStatus: ContentStatus;
  copy: string;
  title: string;
  contentType: ContentType;
  sourceLocale: string;
  /** True if any DesignRequest for this item has status REQUESTED or IN_PROGRESS. */
  hasActiveDesignRequest: boolean;
  /**
   * The highest attemptNumber seen across all DesignRequests for this item.
   * Used to determine whether retries are still available.
   * 0 means no attempts have been made yet.
   */
  latestAttemptNumber: number;
  /**
   * Whether an active ProfileTemplateMapping exists for this item's
   * profile / contentType / locale combination.
   * Corresponds to queueMappingAvailability === "AVAILABLE" on QueueContentItem,
   * or activeTemplateMappings.length > 0 on ContentItemDetail.
   */
  hasMappingAvailable: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal sets — avoid repetition in the function body
// ─────────────────────────────────────────────────────────────────────────────

const DESIGN_ACTIVE_STATUSES = new Set<ContentStatus>([
  ContentStatus.IN_DESIGN,
  ContentStatus.DESIGN_REQUESTED,    // legacy alias
  ContentStatus.DESIGN_IN_PROGRESS,  // legacy alias
]);

const DESIGN_DOWNSTREAM_STATUSES = new Set<ContentStatus>([
  ContentStatus.TRANSLATION_REQUESTED,
  ContentStatus.TRANSLATION_READY,
  ContentStatus.TRANSLATION_PENDING,
  ContentStatus.TRANSLATION_APPROVED,
  ContentStatus.READY_FOR_FINAL_REVIEW,
  ContentStatus.READY_TO_POST,
  ContentStatus.READY_TO_PUBLISH,
  ContentStatus.POSTED,
  ContentStatus.PUBLISHED_MANUALLY,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the item's latest attempt number has reached or exceeded the
 * maximum allowed design attempts (DESIGN_MAX_AUTO_RETRIES).
 *
 * This is the single source of truth for retry exhaustion.  Use it in both the
 * application layer (to block execution) and the view model (to surface the
 * exhausted state to the operator).
 */
export function isRetryExhausted(latestAttemptNumber: number): boolean {
  return latestAttemptNumber >= DESIGN_MAX_AUTO_RETRIES;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives the operator-visible design eligibility status from the item's
 * current state and context.
 *
 * Evaluation order matters:
 *   1. Downstream / complete states (design is irrelevant)
 *   2. Currently executing states
 *   3. Awaiting approval
 *   4. Approved
 *   5. Failed — check retry availability
 *   6. Pre-design eligible states — check slice scope, mapping, prerequisites
 *   7. Everything else — treat as missing prerequisites (status gate not cleared)
 */
export function evaluateDesignEligibility(
  input: DesignEligibilityInput,
): DesignEligibilityResult {
  const {
    currentStatus,
    copy,
    title,
    contentType,
    sourceLocale,
    hasActiveDesignRequest,
    latestAttemptNumber,
    hasMappingAvailable,
  } = input;

  // ── 1. Downstream — design is complete or not applicable ──────────────────
  if (DESIGN_DOWNSTREAM_STATUSES.has(currentStatus)) {
    return {
      status: "DOWNSTREAM_COMPLETE",
      reasons: [],
      outOfScopeReasons: [],
    };
  }

  // ── 2. Currently executing ────────────────────────────────────────────────
  if (DESIGN_ACTIVE_STATUSES.has(currentStatus)) {
    return {
      status: "IN_DESIGN",
      reasons: ["A design execution request is currently active."],
      outOfScopeReasons: [],
    };
  }

  // ── 3. Awaiting approval ──────────────────────────────────────────────────
  if (currentStatus === ContentStatus.DESIGN_READY) {
    return {
      status: "DESIGN_READY",
      reasons: ["Provider returned a completed result.  A human review decision is required."],
      outOfScopeReasons: [],
    };
  }

  // ── 4. Approved ───────────────────────────────────────────────────────────
  if (currentStatus === ContentStatus.DESIGN_APPROVED) {
    return {
      status: "DESIGN_APPROVED",
      reasons: [],
      outOfScopeReasons: [],
    };
  }

  // ── 5. Failed — check retry availability ─────────────────────────────────
  if (currentStatus === ContentStatus.DESIGN_FAILED) {
    if (isRetryExhausted(latestAttemptNumber)) {
      return {
        status: "RETRY_EXHAUSTED",
        reasons: [
          `All ${DESIGN_MAX_AUTO_RETRIES} allowed design attempts have been exhausted.`,
          "Manual intervention is required before a new attempt can proceed.",
          "Consider updating the copy or title to create a new content fingerprint.",
        ],
        outOfScopeReasons: [],
      };
    }

    const remaining = DESIGN_MAX_AUTO_RETRIES - latestAttemptNumber;
    return {
      status: "RETRY_AVAILABLE",
      reasons: [
        `Design attempt ${latestAttemptNumber} failed.  ${remaining} attempt(s) remaining before the retry limit is reached.`,
      ],
      outOfScopeReasons: [],
    };
  }

  // ── 6. Pre-design eligible states — evaluate full scope + prerequisites ───
  //
  // At this point currentStatus is one of:
  //   READY_FOR_DESIGN, CONTENT_APPROVED (legacy), WAITING_FOR_COPY,
  //   IMPORTED, IN_REVIEW, CHANGES_REQUESTED, or an unrecognised status.
  //
  // We check slice scope first (hard out-of-scope before soft prerequisites)
  // because an item with missing copy that is also out-of-scope should show
  // "out of scope" — the copy problem is secondary.

  const outOfScopeReasons: OutOfScopeReason[] = [];
  const outOfScopeMessages: string[] = [];

  // Slice check 1: contentType must match CANVA_SLICE_V1.contentType
  if (contentType !== CANVA_SLICE_V1.contentType) {
    outOfScopeReasons.push("UNSUPPORTED_CONTENT_TYPE");
    outOfScopeMessages.push(
      `Content type '${contentType}' is not supported in the current design phase. ` +
        `Only '${CANVA_SLICE_V1.contentType}' is supported (phase-1 slice).`,
    );
  }

  // Slice check 2: sourceLocale must match CANVA_SLICE_V1.locale
  if (sourceLocale.toLowerCase() !== CANVA_SLICE_V1.locale) {
    outOfScopeReasons.push("UNSUPPORTED_LOCALE");
    outOfScopeMessages.push(
      `Source locale '${sourceLocale}' is not supported in the current design phase. ` +
        `Only '${CANVA_SLICE_V1.locale}' is supported (phase-1 slice).`,
    );
  }

  if (outOfScopeReasons.length > 0) {
    return {
      status: "OUT_OF_SCOPE",
      reasons: outOfScopeMessages,
      outOfScopeReasons,
    };
  }

  // Mapping check: no active ProfileTemplateMapping for this profile/type/locale
  if (!hasMappingAvailable) {
    return {
      status: "OUT_OF_SCOPE",
      reasons: [
        "No active template mapping is configured for this item's profile, content type, and locale combination. " +
          "The design route must be set up before automation can proceed.",
      ],
      outOfScopeReasons: ["NO_ACTIVE_TEMPLATE_MAPPING"],
    };
  }

  // Prerequisites: copy and title must be non-empty
  const missingReasons: string[] = [];

  if (!copy || copy.trim().length === 0) {
    missingReasons.push("Copy is empty.  Final approved copy is required before design can run.");
  }

  if (!title || title.trim().length === 0) {
    missingReasons.push("Title is empty.  A title is required for template filling.");
  }

  if (missingReasons.length > 0) {
    return {
      status: "MISSING_PREREQUISITES",
      reasons: missingReasons,
      outOfScopeReasons: [],
    };
  }

  // Active request guard: a request is already in flight
  if (hasActiveDesignRequest) {
    return {
      status: "ACTIVE_REQUEST_EXISTS",
      reasons: [
        "An active design request is already being processed.  " +
          "Wait for it to complete or fail before submitting a new one.",
      ],
      outOfScopeReasons: [],
    };
  }

  // ── 7. All gates passed ───────────────────────────────────────────────────
  return {
    status: "ELIGIBLE",
    reasons: [],
    outOfScopeReasons: [],
  };
}
