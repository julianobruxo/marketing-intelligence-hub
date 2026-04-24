export type DesignPresetId =
  | "hook"
  | "explainer"
  | "authority"
  | "threat"
  | "resource"
  | "map"
  | "clickbait"
  | "abstract";

export type DesignPreset = {
  id: DesignPresetId;
  label: string;
  description: string;
  prompt: string;
};

const LEGACY_PRESET_ID_MAP: Record<string, DesignPresetId> = {
  the_hook: "hook",
  the_explainer: "explainer",
  the_authority: "authority",
  the_threat: "threat",
  the_resource: "resource",
  the_map: "map",
  the_clickbait: "clickbait",
  the_abstract: "abstract",
};

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "hook",
    label: "The Hook",
    description: "Scroll-stopping central tension.",
    prompt: `Create a scroll-stopping LinkedIn visual for a B2B tech audience built around one strong central idea.

Objective:
Turn the post into a bold, immediate visual hook that makes people stop scrolling and understand the core tension fast.

Visual role in the feed:
This image should interrupt the feed with a clear headline-led idea and one dominant supporting visual concept.

Style and brand direction:
Premium enterprise-tech editorial style for Nano Banana Pro / gemini-3-pro-image-preview, generated from scratch, modern, sharp, high-contrast, dark-background-first, subtle Zazmic-style branding, red/coral accent energy, polished and credible.

Composition guidance:
Use one dominant focal point. Strong hierarchy. Large headline area. Minimal clutter. Use a symbolic concept, layered UI fragments, signal lines, contrast blocks, warning accents, or one striking visual metaphor if it helps communicate the theme.

Text treatment:
Allow structured on-image text, but keep it controlled. Prefer one strong headline, one short supporting line, and only a few short labels if needed. Avoid dense paragraphs.

What to emphasize:
Clarity, tension, memorability, thought leadership, immediate comprehension.

What to avoid:
Generic stock visuals, random abstract filler, childish design, overloaded dashboards, messy layouts, too many colors, weak hierarchy.`,
  },
  {
    id: "explainer",
    label: "The Explainer",
    description: "Frameworks, steps, and structured clarity.",
    prompt: `Create a clear, high-value LinkedIn explainer visual for a B2B tech audience that makes a complex idea easy to understand quickly.

Objective:
Translate the post into a structured visual explanation that reduces confusion and teaches fast.

Visual role in the feed:
This image should help the viewer grasp a framework, concept, workflow, system, or business logic in seconds.

Style and brand direction:
Premium editorial infographic style for Nano Banana Pro / gemini-3-pro-image-preview, generated from scratch, modern enterprise-tech aesthetic, dark-background-first, high contrast, subtle Zazmic-style branding, red/coral accents with restrained secondary colors, polished and useful.

Composition guidance:
Use a clean system layout such as blocks, steps, grouped sections, labeled cards, columns, matrices, comparisons, or simple connectors. Every visual element should support explanation.

Text treatment:
High-text controlled. Use concise headlines, section labels, category names, short descriptors, and structured explanatory fragments. Avoid paragraphs and tiny unreadable copy.

What to emphasize:
Fast understanding, hierarchy, logic, usefulness, clarity, strategic framing.

What to avoid:
Decoration without function, visual noise, fake dashboards, dense prose, unclear grouping, cluttered diagrams.`,
  },
  {
    id: "authority",
    label: "The Authority",
    description: "Credibility-first expert analysis.",
    prompt: `Create a credibility-first LinkedIn visual for a B2B tech audience that feels like expert analysis turned into a premium social graphic.

Objective:
Make the post feel authoritative, evidence-aware, and professionally grounded.

Visual role in the feed:
This image should signal expertise, analysis, benchmarking, informed opinion, or strategic proof.

Style and brand direction:
Executive-friendly and precise for Nano Banana Pro / gemini-3-pro-image-preview, generated from scratch, clean, premium, modern, dark-tech editorial aesthetic, subtle Zazmic-style branding, red/coral highlight accents used with restraint, polished and high-trust.

Composition guidance:
Center the layout around a scorecard, benchmark board, comparison device, structured metrics panel, analyst-style visual summary, or disciplined data-led composition.

Text treatment:
High-text controlled. Allow structured comparison text, labels, short metric names, column/row concepts, and concise proof elements. Avoid dense walls of text.

What to emphasize:
Credibility, precision, calm confidence, expert framing, analytical clarity.

What to avoid:
Overhype, sensationalism, sloppy layout, noisy decoration, unreadable data, exaggerated clickbait energy.`,
  },
  {
    id: "threat",
    label: "The Threat",
    description: "Risk, exposure, and serious urgency.",
    prompt: `Create a high-stakes LinkedIn visual for a B2B tech audience that communicates risk, exposure, or hidden system danger with sophistication.

Objective:
Turn the post into a premium threat-oriented visual that communicates urgency without looking cheap or cliche.

Visual role in the feed:
This image should make a hidden risk, attack surface, governance gap, or failure mode feel real and important.

Style and brand direction:
Dark, premium, sharp, serious, cyber-aware enterprise-tech editorial aesthetic for Nano Banana Pro / gemini-3-pro-image-preview, generated from scratch, subtle Zazmic-style branding, strong contrast, restrained red/coral warning energy, credible and controlled.

Composition guidance:
Show hidden risk inside trusted systems. Use compromised-looking cards, dependency chains, governance gaps, warning indicators, layered interfaces, invisible pathways, access lines, breach logic, or system tension.

Text treatment:
High-text controlled. Use short labels, warning phrases, concise category text, or framework fragments. Avoid dense explanatory paragraphs.

What to emphasize:
Risk tension, clarity, seriousness, system exposure, strategic concern.

What to avoid:
Cheesy hacker tropes, skull cliches, green code rain, melodrama, panic aesthetics, generic cyber visuals.`,
  },
  {
    id: "resource",
    label: "The Resource",
    description: "Guide, checklist, playbook, or report.",
    prompt: `Create a premium LinkedIn visual for a B2B tech audience that makes the post feel like a tangible, high-value downloadable resource or save-worthy guide.

Objective:
Make the content feel productized, practical, and worth clicking, commenting for, saving, or requesting.

Visual role in the feed:
This image should present the content like a real asset: guide, checklist, framework, playbook, report, or structured carousel-style resource.

Style and brand direction:
Premium lead-magnet aesthetic for Nano Banana Pro / gemini-3-pro-image-preview, generated from scratch, polished, professional, dark-background-first, subtle Zazmic-style branding, red/coral accents, high contrast, editorial but conversion-aware.

Composition guidance:
Use a hero asset presentation such as a guide cover, stacked pages, deck fragments, booklet mockup, framed cards, CTA area, or visual resource packaging.

Text treatment:
High-text controlled. Use strong title text, concise benefit framing, and short structured preview labels. Avoid long explanatory copy.

What to emphasize:
Tangibility, usefulness, save-worthiness, professionalism, value.

What to avoid:
Cheap ad energy, cluttered promo layouts, spammy CTA design, generic brochure feel.`,
  },
  {
    id: "map",
    label: "The Infographic",
    description: "Ecosystem, taxonomy, or landscape visual.",
    prompt: `Create a strategic ecosystem-map LinkedIn visual for a B2B tech audience that organizes a complex landscape into something navigable.

Objective:
Turn the post into a map, taxonomy, or system overview that helps viewers understand how parts fit together.

Visual role in the feed:
This image should function like a strategic lens over a messy toolset, product family, workflow landscape, or connected ecosystem.

Style and brand direction:
Premium structured infographic style for Nano Banana Pro / gemini-3-pro-image-preview, generated from scratch, enterprise-tech editorial feel, dark-background-first, subtle Zazmic-style branding, red/coral accents supported by restrained secondary colors, polished and intelligent.

Composition guidance:
Use a central anchor and grouped surrounding categories, or a modular map structure with sections, clusters, labels, and connectors. Favor order and navigability.

Text treatment:
High-text controlled. Use clear category labels, grouped section names, concise descriptors, and structured organization. Avoid overly dense text blocks.

What to emphasize:
System logic, clarity, relationship mapping, navigability, strategic understanding.

What to avoid:
Random lists, weak grouping, messy lines, decorative complexity, tiny unreadable labels.`,
  },
  {
    id: "clickbait",
    label: "The Clickbait",
    description: "Curiosity without cheapness.",
    prompt: `Create a curiosity-driven LinkedIn visual for a B2B tech audience that is highly scroll-stopping but still premium and intelligent.

Objective:
Use strong curiosity and visual tension to make the viewer want to click, read, comment, or learn more, without degrading into cheap clickbait.

Visual role in the feed:
This image should create immediate intrigue around a business, AI, security, or strategy idea with a bold framing device.

Style and brand direction:
Bold, premium, high-contrast, sharp, modern enterprise-tech editorial style for Nano Banana Pro / gemini-3-pro-image-preview, generated from scratch, dark-background-first, subtle Zazmic-style branding, red/coral accents, polished and memorable.

Composition guidance:
Use oversized framing, strong numbers, contrast panels, reveal-style structure, provocative but credible visual hierarchy, or bold conceptual packaging.

Text treatment:
High-text controlled. Use punchy headlines, short teaser lines, concise list fragments, and strong visual hierarchy. Avoid dense text or tabloid messiness.

What to emphasize:
Curiosity, sharp framing, stopping power, professional intensity, thought-leadership energy.

What to avoid:
Trashy clickbait, tabloid style, visual spam, excessive hype, sensational cheapness, messy composition.`,
  },
  {
    id: "abstract",
    label: "The Abstract",
    description: "Premium editorial cover energy.",
    prompt: `Create a premium abstract editorial LinkedIn visual for a B2B tech audience that feels like a high-end cover for thought leadership or a recurring series.

Objective:
Turn the post into an elegant editorial visual led by mood, structure, and title presence rather than explicit explanation.

Visual role in the feed:
This image should feel like a publication cover, digest cover, or premium thought-leadership poster.

Style and brand direction:
Sophisticated, minimal, futuristic, premium, dark-background-first for Nano Banana Pro / gemini-3-pro-image-preview, generated from scratch, subtle Zazmic-style branding, restrained red/coral accents, elegant contrast, polished editorial identity.

Composition guidance:
Use abstract signal lines, gradients, waveforms, geometric forms, restrained textures, issue-like layout logic, and one calm but memorable visual motif.

Text treatment:
Allow concise title-led composition with limited supporting text. Keep on-image text more restrained here unless custom instructions explicitly ask otherwise.

What to emphasize:
Editorial polish, premium series identity, sophistication, calm confidence, memorable cover energy.

What to avoid:
Generic abstract wallpaper, empty filler, overbusy shapes, weak title hierarchy, meaningless decoration.`,
  },
];

function normalizePresetId(id: string | null | undefined): DesignPresetId | null {
  if (!id) {
    return null;
  }

  const trimmed = id.trim();
  return DESIGN_PRESETS.some((preset) => preset.id === trimmed)
    ? (trimmed as DesignPresetId)
    : LEGACY_PRESET_ID_MAP[trimmed] ?? null;
}

export function getDesignPresetById(id: string | null | undefined): DesignPreset | null {
  const normalizedId = normalizePresetId(id);
  return normalizedId ? DESIGN_PRESETS.find((preset) => preset.id === normalizedId) ?? null : null;
}

export function getDefaultDesignPreset(): DesignPreset {
  return DESIGN_PRESETS[0];
}

export function resolveDesignPreset(id: string | null | undefined): DesignPreset {
  return getDesignPresetById(id) ?? getDefaultDesignPreset();
}
