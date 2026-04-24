/**
 * Canva Template Catalog — phase-1.0
 *
 * Provides display metadata for Canva templates that the operator
 * sees in the design wizard.  The real source of truth for which
 * templates are active for a given item is ProfileTemplateMapping.
 *
 * Each template's `id` must match a ProfileTemplateMapping.externalTemplateId
 * value so that the initiation action can resolve the correct mapping row.
 *
 * Phase-1 note: real thumbnails come from the Canva brand template API
 * (GET /v1/brand-templates/{id}/dataset).  Until that integration is live,
 * `thumbnailUrl` is null and the UI shows a placeholder.
 */

export type CanvaTemplateField = {
  /** Dataset field key as Canva expects it (e.g. "TITLE", "BODY"). */
  key: string;
  /** Human-readable label shown to the operator (e.g. "Headline"). */
  label: string;
  /** Which content field to pre-populate this template field from. */
  defaultSource: "title" | "copy";
  /** Soft character limit shown as a warning in the UI. */
  characterLimit?: number;
};

export type CanvaTemplate = {
  /** Must match ProfileTemplateMapping.externalTemplateId. */
  id: string;
  /** 1-based display number for the operator. */
  number: number;
  displayName: string;
  description: string;
  /** Real thumbnail from Canva API; null until the API integration is live. */
  thumbnailUrl: string | null;
  fields: CanvaTemplateField[];
};

/**
 * Mock catalog for the Shawn Static (English) template family.
 * Template IDs correspond to the seed's ProfileTemplateMapping records.
 *
 * When the real Canva brand template API is connected, this catalog
 * can be replaced with a live fetch.  The wizard UI only requires the
 * CanvaTemplate shape — the data source is interchangeable.
 */
export const CANVA_SHAWN_STATIC_TEMPLATES: CanvaTemplate[] = [
  {
    id: "shawn-static-en-01",
    number: 1,
    displayName: "Standard Post",
    description:
      "Clean layout with a headline at the top and body copy below. Best for announcements and thought leadership.",
    thumbnailUrl: null,
    fields: [
      { key: "TITLE", label: "Headline", defaultSource: "title", characterLimit: 80 },
      { key: "BODY", label: "Body copy", defaultSource: "copy", characterLimit: 400 },
    ],
  },
  {
    id: "shawn-static-en-02",
    number: 2,
    displayName: "Bold Pull Quote",
    description:
      "Large pull quote center stage. Strong visual impact — best for a single key message.",
    thumbnailUrl: null,
    fields: [
      { key: "TITLE", label: "Pull quote", defaultSource: "copy", characterLimit: 120 },
      { key: "BODY", label: "Attribution / context", defaultSource: "title", characterLimit: 80 },
    ],
  },
  {
    id: "shawn-static-en-03",
    number: 3,
    displayName: "Two-Column Split",
    description:
      "Left headline, right body — professional and structured. Works well for list-style content.",
    thumbnailUrl: null,
    fields: [
      { key: "TITLE", label: "Left headline", defaultSource: "title", characterLimit: 60 },
      { key: "BODY", label: "Right body", defaultSource: "copy", characterLimit: 300 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Catalog helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getCanvaTemplateById(id: string): CanvaTemplate | null {
  return CANVA_SHAWN_STATIC_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function getDefaultCanvaTemplate(): CanvaTemplate {
  return CANVA_SHAWN_STATIC_TEMPLATES[0];
}

/**
 * Given an externalTemplateId from a ProfileTemplateMapping row, returns
 * the enriched template catalog entry or a minimal fallback shape so the
 * wizard always has something to display.
 */
export function resolveCanvaTemplateMeta(externalTemplateId: string): CanvaTemplate {
  return (
    getCanvaTemplateById(externalTemplateId) ?? {
      id: externalTemplateId,
      number: 1,
      displayName: externalTemplateId,
      description: "Template — field definitions not yet in catalog.",
      thumbnailUrl: null,
      fields: [
        { key: "TITLE", label: "Headline", defaultSource: "title" },
        { key: "BODY", label: "Body copy", defaultSource: "copy" },
      ],
    }
  );
}

/**
 * Builds the default field mapping values for a template given the item's
 * title and copy.  Returns { [fieldKey]: string } ready for the wizard form.
 */
export function buildDefaultFieldValues(
  template: CanvaTemplate,
  title: string,
  copy: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of template.fields) {
    out[field.key] = field.defaultSource === "title" ? title : copy;
  }
  return out;
}
