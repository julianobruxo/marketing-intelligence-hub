export type TextDensityHint = "low" | "medium" | "high";

export type DerivedDesignContext = {
  title: string;
  author: string;
  postTopic: string;
  primaryAngle: string;
  visualGoal: string;
  ctaIntent?: string;
  likelyContentShape?: string;
  keyEntities?: string[];
  textDensityHint: TextDensityHint;
  brandContext: string;
};

const BRAND_CONTEXT = "premium Zazmic-style LinkedIn B2B tech visual";

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function limitText(value: string, maxLength: number): string {
  const compacted = compactWhitespace(value);
  if (compacted.length <= maxLength) {
    return compacted;
  }

  const clipped = compacted.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
  return clipped.length > 0 ? `${clipped}...` : compacted.slice(0, maxLength);
}

function firstMeaningfulSentence(value: string): string {
  const compacted = compactWhitespace(value);
  const sentence = compacted.split(/(?<=[.!?])\s+/)[0] ?? compacted;
  return limitText(sentence, 120);
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function derivePrimaryAngle(text: string): string {
  if (includesAny(text, ["risk", "threat", "breach", "attack", "security", "exposure", "vulnerability", "governance gap"])) {
    return "Threat/risk framing with controlled urgency.";
  }

  if (includesAny(text, ["framework", "how to", "guide", "steps", "workflow", "process", "explainer", "playbook"])) {
    return "Explainer/framework framing that makes the idea easy to understand.";
  }

  if (includesAny(text, ["benchmark", "report", "data", "metric", "analysis", "authority", "research", "proof"])) {
    return "Authority/benchmark framing with expert credibility.";
  }

  if (includesAny(text, ["download", "checklist", "template", "resource", "ebook", "save", "pdf"])) {
    return "Resource framing that feels practical and save-worthy.";
  }

  if (includesAny(text, ["map", "ecosystem", "landscape", "taxonomy", "platform", "tools", "stack"])) {
    return "Map/ecosystem framing that organizes a complex landscape.";
  }

  if (includesAny(text, ["why", "secret", "mistake", "truth", "you need", "nobody", "hidden"])) {
    return "Curiosity framing with a bold but credible hook.";
  }

  if (includesAny(text, ["launch", "team", "culture", "milestone", "celebrate", "hiring"])) {
    return "Editorial/culture framing with polished brand presence.";
  }

  return "Thought-leadership framing around one clear B2B technology idea.";
}

function deriveVisualGoal(angle: string): string {
  if (angle.startsWith("Threat")) {
    return "Make the hidden risk feel real while staying credible and polished.";
  }

  if (angle.startsWith("Explainer")) {
    return "Turn the idea into a structured visual that teaches quickly.";
  }

  if (angle.startsWith("Authority")) {
    return "Signal expertise, evidence, and executive-level analysis.";
  }

  if (angle.startsWith("Resource")) {
    return "Make the post feel like a tangible high-value asset.";
  }

  if (angle.startsWith("Map")) {
    return "Show relationships and categories in a navigable system.";
  }

  if (angle.startsWith("Curiosity")) {
    return "Create immediate intrigue without cheap visual gimmicks.";
  }

  return "Create a premium LinkedIn visual that communicates the core idea fast.";
}

function deriveCtaIntent(text: string): string | undefined {
  if (includesAny(text, ["comment", "reply", "drop a comment"])) {
    return "comment";
  }

  if (includesAny(text, ["download", "link", "click", "read more", "register", "sign up"])) {
    return "click";
  }

  if (includesAny(text, ["dm", "message me", "send me"])) {
    return "DM";
  }

  if (includesAny(text, ["save", "share", "bookmark"])) {
    return "save/share";
  }

  return undefined;
}

function deriveLikelyContentShape(text: string, angle: string): string {
  if (includesAny(text, ["checklist", "guide", "playbook", "ebook", "template", "download"])) {
    return "resource cover or packaged guide";
  }

  if (includesAny(text, ["vs", "versus", "compare", "comparison", "matrix"])) {
    return "comparison chart";
  }

  if (includesAny(text, ["step", "workflow", "process", "framework"])) {
    return "step-by-step framework";
  }

  if (includesAny(text, ["map", "ecosystem", "landscape", "taxonomy"])) {
    return "ecosystem map";
  }

  if (angle.startsWith("Threat")) {
    return "risk diagram";
  }

  if (angle.startsWith("Authority")) {
    return "analyst scorecard";
  }

  return "single-frame LinkedIn static post";
}

function extractKeyEntities(input: string): string[] {
  const matches = input.match(/\b(?:[A-Z]{2,}|[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,2})\b/g) ?? [];
  const stopWords = new Set([
    "A",
    "An",
    "And",
    "But",
    "For",
    "From",
    "How",
    "Into",
    "The",
    "This",
    "What",
    "When",
    "Why",
    "With",
    "LinkedIn",
  ]);
  const entities: string[] = [];

  for (const match of matches) {
    const normalized = compactWhitespace(match);
    if (normalized.length < 2 || stopWords.has(normalized) || entities.includes(normalized)) {
      continue;
    }

    entities.push(normalized);
    if (entities.length >= 6) {
      break;
    }
  }

  return entities;
}

function deriveTextDensity(text: string): TextDensityHint {
  const wordCount = compactWhitespace(text).split(/\s+/).filter(Boolean).length;
  const listSignals = (text.match(/(?:\n|^)\s*(?:[-*]|\d+[.)])/g) ?? []).length;

  if (wordCount > 120 || listSignals >= 3) {
    return "high";
  }

  if (wordCount > 45) {
    return "medium";
  }

  return "low";
}

export function deriveDesignContextFromCard(input: {
  title: string;
  author: string;
  copy: string;
}): DerivedDesignContext {
  const title = limitText(input.title || "Untitled post", 120);
  const author = limitText(input.author || "Zazmic", 80);
  const compactCopy = compactWhitespace(input.copy);
  const combined = `${title} ${compactCopy}`.toLowerCase();
  const primaryAngle = derivePrimaryAngle(combined);
  const likelyContentShape = deriveLikelyContentShape(combined, primaryAngle);
  const keyEntities = extractKeyEntities(`${title} ${compactCopy}`);

  return {
    title,
    author,
    postTopic: title || firstMeaningfulSentence(compactCopy),
    primaryAngle,
    visualGoal: deriveVisualGoal(primaryAngle),
    ctaIntent: deriveCtaIntent(combined),
    likelyContentShape,
    keyEntities: keyEntities.length > 0 ? keyEntities : undefined,
    textDensityHint: deriveTextDensity(`${title} ${compactCopy}`),
    brandContext: BRAND_CONTEXT,
  };
}
