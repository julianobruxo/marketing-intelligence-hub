/**
 * Design Input Contract — phase-1.0
 *
 * Defines the minimum data payload that must be present on a content item
 * before a design execution request can be safely submitted to any provider.
 *
 * This is the adapter boundary: both the application layer (run-canva-design-request.ts)
 * and all future provider adapters (Canva, Nano Banana, …) work against this shape.
 *
 * Rules:
 *   - Do not add fields that the current system does not plausibly supply.
 *   - Do not rely on fields that only exist in future integrations.
 *   - Keep the contract small enough that adding a new provider does not
 *     require changing this file.
 *
 * For fields that are "available if present" (optional), providers must
 * use them for routing / template selection if available, and fall back
 * gracefully if not.
 */

import { z } from "zod";
import { ContentProfile, ContentType, DesignProvider } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema — source of truth for validation at the application boundary
// ─────────────────────────────────────────────────────────────────────────────

export const designInputContractSchema = z.object({
  // ── Identity ──────────────────────────────────────────────────────────────

  /** Stable internal ID of the content item being designed. */
  contentItemId: z.string().min(1),

  /**
   * Canonical key — the stable external reference used to deduplicate
   * this item across re-imports.  Useful for idempotency at the provider layer.
   */
  canonicalKey: z.string().min(1),

  // ── Core content ─────────────────────────────────────────────────────────

  /**
   * The display title / headline of the post.
   * Mapped directly to the provider's "title" dataset field.
   */
  title: z.string().min(1),

  /**
   * Final approved copy — the primary body text to be embedded in the design.
   * This is the "copy" field from ContentItem, which is the output of
   * ingestion normalization and may be empty on WAITING_FOR_COPY items.
   * The readiness gate (isReadyForDesign) ensures this is non-empty
   * before a design request is allowed.
   */
  copy: z.string(),

  // ── Content classification ────────────────────────────────────────────────

  /**
   * Content format type.  Providers may use this to select template families
   * (e.g. STATIC_POST → single-frame Canva template; CAROUSEL → multi-slide).
   */
  contentType: z.nativeEnum(ContentType),

  /**
   * Persona / brand profile the content belongs to.
   * Used for template routing and brand-specific visual rules.
   */
  profile: z.nativeEnum(ContentProfile),

  // ── Locale / translation ──────────────────────────────────────────────────

  /**
   * Source locale of the copy field (e.g. "en", "pt-br").
   * Determines which language variant of a template to select.
   */
  sourceLocale: z.string().min(1),

  /**
   * Whether a translated variant must also be generated.
   * If true, providers that support multi-locale output should produce
   * both the source and target locale assets.
   */
  translationRequired: z.boolean().default(false),

  /**
   * Pre-existing translation copy, if already available at design time.
   * Providers may embed this directly into translated template slots.
   * Optional — providers must not fail if absent.
   */
  translationCopy: z.string().min(1).optional(),

  // ── Platform / destination ────────────────────────────────────────────────

  /**
   * The downstream publishing platform label, if known (e.g. "LinkedIn").
   * Providers may use this to select platform-optimised template dimensions.
   * Optional — providers must not fail if absent.
   */
  platformLabel: z.string().min(1).optional(),

  // ── Template routing ──────────────────────────────────────────────────────

  /**
   * The resolved external template ID from ProfileTemplateMapping.
   * This is what the provider uses to select and fill the right template.
   * Required for providers that use pre-defined templates (Canva).
   * Optional for providers that generate visuals from scratch (Nano Banana).
   */
  templateId: z.string().min(1).optional(),

  /**
   * The preferred design provider resolved for this content item.
   * Allows the dispatch layer to route to the correct adapter without
   * reading back from the database.
   */
  preferredDesignProvider: z.nativeEnum(DesignProvider).optional(),

  // ── Execution metadata ────────────────────────────────────────────────────

  /**
   * Monotonically increasing attempt counter.
   * Providers use this to generate idempotent external request IDs
   * and to avoid re-processing the same logical attempt.
   */
  attemptNumber: z.number().int().positive(),

  /**
   * The planning date for this content item, if available.
   * Not used by the provider directly, but useful for scheduling
   * and for audit trails in the design request payload.
   */
  plannedDate: z.string().min(1).optional(),
});

export type DesignInputContract = z.infer<typeof designInputContractSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Factory — builds and validates the contract from a raw content item
// ─────────────────────────────────────────────────────────────────────────────

type RawContentItemForDesign = {
  id: string;
  canonicalKey: string;
  title: string;
  copy: string;
  contentType: ContentType;
  profile: ContentProfile;
  sourceLocale: string;
  translationRequired: boolean;
  translationCopy?: string | null;
  preferredDesignProvider?: DesignProvider | null;
  planningSnapshot?: unknown;
};

/**
 * Builds a validated DesignInputContract from a ContentItem DB record.
 *
 * @param contentItem  — the Prisma ContentItem row (must already be loaded)
 * @param templateId   — resolved from ProfileTemplateMapping for this item
 * @param attemptNumber — the next attempt number for idempotency
 *
 * Throws if the resulting contract fails Zod validation, which would
 * indicate a gap in the readiness gate (a bug, not expected user input).
 */
export function buildDesignInputContract(input: {
  contentItem: RawContentItemForDesign;
  templateId?: string;
  attemptNumber: number;
}): DesignInputContract {
  const { contentItem, templateId, attemptNumber } = input;

  const planningSnapshot =
    contentItem.planningSnapshot &&
    typeof contentItem.planningSnapshot === "object"
      ? (contentItem.planningSnapshot as Record<string, unknown>)
      : null;

  const planning =
    planningSnapshot?.planning &&
    typeof planningSnapshot.planning === "object"
      ? (planningSnapshot.planning as Record<string, unknown>)
      : null;

  const platformLabel =
    typeof planning?.platformLabel === "string" && planning.platformLabel.trim().length > 0
      ? planning.platformLabel.trim()
      : undefined;

  const plannedDate =
    typeof planning?.plannedDate === "string" && planning.plannedDate.trim().length > 0
      ? planning.plannedDate.trim()
      : undefined;

  return designInputContractSchema.parse({
    contentItemId: contentItem.id,
    canonicalKey: contentItem.canonicalKey,
    title: contentItem.title,
    copy: contentItem.copy,
    contentType: contentItem.contentType,
    profile: contentItem.profile,
    sourceLocale: contentItem.sourceLocale,
    translationRequired: contentItem.translationRequired,
    translationCopy: contentItem.translationCopy ?? undefined,
    platformLabel,
    plannedDate,
    templateId: templateId ?? undefined,
    preferredDesignProvider: contentItem.preferredDesignProvider ?? undefined,
    attemptNumber,
  });
}
