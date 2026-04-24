/**
 * Tests for the design initiation domain logic.
 *
 * Covers:
 *   1. Canva template catalog helpers
 *   2. Nano Banana preset catalog helpers and prompt resolution
 *   3. Design eligibility gate behavior for both providers
 *   4. Variation extraction from NB result payloads
 */

import { describe, it, expect } from "vitest";
import {
  CANVA_SHAWN_STATIC_TEMPLATES,
  getCanvaTemplateById,
  getDefaultCanvaTemplate,
  resolveCanvaTemplateMeta,
  buildDefaultFieldValues,
} from "../canva-templates";
import {
  NANO_BANANA_PRESETS,
  getNanaBananaPresetById,
  resolveNanaBananaPrompt,
} from "../nano-banana-presets";
import { evaluateDesignEligibility } from "../design-eligibility";
import { ContentStatus, ContentType } from "@prisma/client";

const EXPECTED_NB_PRESET_IDS = [
  "hook",
  "explainer",
  "authority",
  "threat",
  "resource",
  "map",
  "clickbait",
  "abstract",
];

// ──────────────────────────────────────────────────────────────────────────────
// 1. Canva template catalog
// ──────────────────────────────────────────────────────────────────────────────

describe("CANVA_SHAWN_STATIC_TEMPLATES", () => {
  it("has at least one template", () => {
    expect(CANVA_SHAWN_STATIC_TEMPLATES.length).toBeGreaterThanOrEqual(1);
  });

  it("all templates have unique ids and 1-based sequential numbers", () => {
    const ids = CANVA_SHAWN_STATIC_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    CANVA_SHAWN_STATIC_TEMPLATES.forEach((t, i) => {
      expect(t.number).toBe(i + 1);
    });
  });

  it("all templates have at least one field with a valid defaultSource", () => {
    for (const t of CANVA_SHAWN_STATIC_TEMPLATES) {
      expect(t.fields.length).toBeGreaterThanOrEqual(1);
      for (const f of t.fields) {
        expect(["title", "copy"]).toContain(f.defaultSource);
      }
    }
  });
});

describe("getCanvaTemplateById", () => {
  it("returns the matching template", () => {
    const first = CANVA_SHAWN_STATIC_TEMPLATES[0];
    const result = getCanvaTemplateById(first.id);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(first.id);
  });

  it("returns null for unknown id", () => {
    expect(getCanvaTemplateById("does-not-exist")).toBeNull();
  });
});

describe("resolveCanvaTemplateMeta", () => {
  it("returns catalog entry for a known template id", () => {
    const known = CANVA_SHAWN_STATIC_TEMPLATES[0];
    const result = resolveCanvaTemplateMeta(known.id);
    expect(result.id).toBe(known.id);
    expect(result.displayName).toBe(known.displayName);
  });

  it("returns a fallback shape for an unknown template id", () => {
    const result = resolveCanvaTemplateMeta("custom-template-xyz");
    expect(result.id).toBe("custom-template-xyz");
    expect(result.fields.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildDefaultFieldValues", () => {
  it("maps title-source fields to the item title", () => {
    const template = getDefaultCanvaTemplate();
    const title = "My Title";
    const copy = "My copy text";
    const values = buildDefaultFieldValues(template, title, copy);

    for (const field of template.fields) {
      if (field.defaultSource === "title") {
        expect(values[field.key]).toBe(title);
      } else {
        expect(values[field.key]).toBe(copy);
      }
    }
  });

  it("returns an entry for every field in the template", () => {
    const template = getDefaultCanvaTemplate();
    const values = buildDefaultFieldValues(template, "T", "C");
    for (const field of template.fields) {
      expect(Object.prototype.hasOwnProperty.call(values, field.key)).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Nano Banana preset catalog
// ──────────────────────────────────────────────────────────────────────────────

describe("NANO_BANANA_PRESETS", () => {
  it("has exactly eight presets", () => {
    expect(NANO_BANANA_PRESETS).toHaveLength(8);
  });

  it("presets are ordered as the approved catalog", () => {
    expect(NANO_BANANA_PRESETS.map((p) => p.id)).toEqual(EXPECTED_NB_PRESET_IDS);
  });

  it("all preset ids are unique", () => {
    const ids = NANO_BANANA_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all presets have non-empty label, description, and prompt", () => {
    for (const p of NANO_BANANA_PRESETS) {
      expect(p.label.trim().length).toBeGreaterThan(0);
      expect(p.description.trim().length).toBeGreaterThan(0);
      expect(p.prompt.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("getNanaBananaPresetById", () => {
  it("returns the preset for a known id", () => {
    const result = getNanaBananaPresetById("hook");
    expect(result?.id).toBe("hook");
    expect(result?.label).toBe("The Hook");
  });

  it("supports legacy preset ids for existing saved payloads", () => {
    const result = getNanaBananaPresetById("the_hook");
    expect(result?.id).toBe("hook");
  });

  it("returns null for unknown id", () => {
    expect(getNanaBananaPresetById("nonexistent")).toBeNull();
  });
});

describe("resolveNanaBananaPrompt", () => {
  const baseInput = {
    title: "How AI is changing marketing",
    copy: "Artificial intelligence is reshaping how brands connect with their audiences.",
  };

  it("appends the custom prompt as additional instructions", () => {
    const customPrompt = "A completely custom instruction for the design.";
    const result = resolveNanaBananaPrompt({
      ...baseInput,
      presetId: null,
      customPrompt,
    });
    expect(result).toContain("Create a scroll-stopping LinkedIn visual");
    expect(result).toContain("Post context:");
    expect(result).toContain("Additional user instructions:");
    expect(result).toContain(customPrompt);
    expect(result).not.toBe(customPrompt);
  });

  it("keeps the selected preset when customPrompt is set", () => {
    const custom = "Make it feel like a digest cover.";
    const result = resolveNanaBananaPrompt({
      ...baseInput,
      presetId: "hook",
      customPrompt: custom,
    });
    expect(result).toContain("Create a scroll-stopping LinkedIn visual");
    expect(result).toContain(custom);
  });

  it("resolves a known preset by id and adds compact card context", () => {
    const preset = getNanaBananaPresetById("hook");
    expect(preset).not.toBeNull();
    const result = resolveNanaBananaPrompt({
      ...baseInput,
      presetId: preset?.id ?? null,
      customPrompt: null,
    });
    expect(result).toContain(baseInput.title);
    expect(result).toContain("Post context:");
    expect(result).toContain("Brand context: premium Zazmic-style LinkedIn B2B tech visual");
    expect(result.length).toBeGreaterThan(10);
  });

  it("resolves The Map preset by id", () => {
    const result = resolveNanaBananaPrompt({
      ...baseInput,
      presetId: "map",
      customPrompt: null,
    });

    expect(result).toContain(baseInput.title);
    expect(result).toContain("strategic ecosystem-map");
  });

  it("falls back to default preset when presetId is null and no custom prompt", () => {
    const result = resolveNanaBananaPrompt({
      ...baseInput,
      presetId: null,
      customPrompt: null,
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("Create a scroll-stopping LinkedIn visual");
    expect(result).toContain(baseInput.title);
  });

  it("does not blindly dump very long raw copy", () => {
    const longCopy = "x".repeat(500);
    const result = resolveNanaBananaPrompt({
      title: "T",
      copy: longCopy,
      presetId: null,
      customPrompt: null,
    });
    expect(result).not.toContain(longCopy);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Design eligibility gate — both providers use the same gate
// ──────────────────────────────────────────────────────────────────────────────

const ELIGIBLE_BASE = {
  copy: "Final approved copy.",
  title: "Strong title",
  contentType: ContentType.STATIC_POST,
  sourceLocale: "en",
  hasActiveDesignRequest: false,
  latestAttemptNumber: 0,
  hasMappingAvailable: true,
};

describe("evaluateDesignEligibility — READY_FOR_DESIGN (entry point)", () => {
  it("returns ELIGIBLE when all prerequisites are met", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.READY_FOR_DESIGN,
    });
    expect(result.status).toBe("ELIGIBLE");
    expect(result.reasons).toHaveLength(0);
  });

  it("returns MISSING_PREREQUISITES when copy is empty", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.READY_FOR_DESIGN,
      copy: "",
    });
    expect(result.status).toBe("MISSING_PREREQUISITES");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("returns MISSING_PREREQUISITES when title is empty", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.READY_FOR_DESIGN,
      title: "  ",
    });
    expect(result.status).toBe("MISSING_PREREQUISITES");
  });

  it("returns OUT_OF_SCOPE for unsupported locale", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.READY_FOR_DESIGN,
      sourceLocale: "pt-br",
    });
    expect(result.status).toBe("OUT_OF_SCOPE");
    expect(result.outOfScopeReasons).toContain("UNSUPPORTED_LOCALE");
  });

  it("returns OUT_OF_SCOPE for unsupported content type", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.READY_FOR_DESIGN,
      contentType: ContentType.CAROUSEL,
    });
    expect(result.status).toBe("OUT_OF_SCOPE");
    expect(result.outOfScopeReasons).toContain("UNSUPPORTED_CONTENT_TYPE");
  });

  it("returns OUT_OF_SCOPE when no template mapping available", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.READY_FOR_DESIGN,
      hasMappingAvailable: false,
    });
    expect(result.status).toBe("OUT_OF_SCOPE");
    expect(result.outOfScopeReasons).toContain("NO_ACTIVE_TEMPLATE_MAPPING");
  });

  it("returns ACTIVE_REQUEST_EXISTS when a request is already in flight", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.READY_FOR_DESIGN,
      hasActiveDesignRequest: true,
    });
    expect(result.status).toBe("ACTIVE_REQUEST_EXISTS");
  });
});

describe("evaluateDesignEligibility — retry states", () => {
  it("returns RETRY_AVAILABLE after DESIGN_FAILED with attempts remaining", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.DESIGN_FAILED,
      latestAttemptNumber: 1,
    });
    expect(result.status).toBe("RETRY_AVAILABLE");
  });

  it("returns RETRY_EXHAUSTED when max attempts are reached", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.DESIGN_FAILED,
      latestAttemptNumber: 3,
    });
    expect(result.status).toBe("RETRY_EXHAUSTED");
  });

  it("returns IN_DESIGN while a request is executing", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.IN_DESIGN,
    });
    expect(result.status).toBe("IN_DESIGN");
  });

  it("returns DESIGN_READY when provider result is available", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.DESIGN_READY,
    });
    expect(result.status).toBe("DESIGN_READY");
  });

  it("returns DESIGN_APPROVED after human approval", () => {
    const result = evaluateDesignEligibility({
      ...ELIGIBLE_BASE,
      currentStatus: ContentStatus.DESIGN_APPROVED,
    });
    expect(result.status).toBe("DESIGN_APPROVED");
  });

  it("returns DOWNSTREAM_COMPLETE for post-design statuses", () => {
    const downstreamStatuses = [
      ContentStatus.READY_FOR_FINAL_REVIEW,
      ContentStatus.READY_TO_POST,
      ContentStatus.POSTED,
      ContentStatus.PUBLISHED_MANUALLY,
    ];
    for (const status of downstreamStatuses) {
      const result = evaluateDesignEligibility({
        ...ELIGIBLE_BASE,
        currentStatus: status,
      });
      expect(result.status).toBe("DOWNSTREAM_COMPLETE");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. NB result payload variation extraction (unit test of helper logic)
// ──────────────────────────────────────────────────────────────────────────────

describe("extractNanaBananaVariations — payload parsing", () => {
  // The helper lives in the UI component but we can test the logic inline here
  // by duplicating the extraction logic as a pure function
  function extractVariations(resultPayload: unknown) {
    if (!resultPayload || typeof resultPayload !== "object") return [];
    const payload = resultPayload as Record<string, unknown>;
    const nb = payload.nanoBanana;
    if (!nb || typeof nb !== "object") return [];
    const nbData = nb as Record<string, unknown>;
    if (!Array.isArray(nbData.variations)) return [];
    return nbData.variations.filter(
      (v): v is { id: string; thumbnailUrl: string; editUrl: string; label: string } =>
        !!v &&
        typeof v === "object" &&
        typeof v.id === "string" &&
        typeof v.thumbnailUrl === "string" &&
        typeof v.editUrl === "string",
    );
  }

  it("extracts all variations from a well-formed NB result payload", () => {
    const payload = {
      job: { id: "nb-test-1", status: "success" },
      nanoBanana: {
        variations: [
          { id: "v1", thumbnailUrl: "https://example.com/v1.png", editUrl: "https://example.com/v1/edit", label: "Variation 1" },
          { id: "v2", thumbnailUrl: "https://example.com/v2.png", editUrl: "https://example.com/v2/edit", label: "Variation 2" },
          { id: "v3", thumbnailUrl: "https://example.com/v3.png", editUrl: "https://example.com/v3/edit", label: "Variation 3" },
        ],
        selectedVariationId: "v1",
      },
    };
    const result = extractVariations(payload);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("v1");
    expect(result[2].id).toBe("v3");
  });

  it("returns empty array for Canva-shaped payloads (no nanoBanana key)", () => {
    const canvaPayload = {
      job: { id: "canva-test-1", status: "success" },
      meta: { providerMode: "MOCK" },
    };
    expect(extractVariations(canvaPayload)).toHaveLength(0);
  });

  it("returns empty array for null payload", () => {
    expect(extractVariations(null)).toHaveLength(0);
    expect(extractVariations(undefined)).toHaveLength(0);
  });

  it("skips variation entries with missing required fields", () => {
    const payload = {
      nanoBanana: {
        variations: [
          { id: "v1", thumbnailUrl: "https://example.com/v1.png", editUrl: "https://example.com/v1/edit" },
          { id: "v2" }, // missing thumbnailUrl and editUrl
          null,
        ],
      },
    };
    const result = extractVariations(payload);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("v1");
  });
});
