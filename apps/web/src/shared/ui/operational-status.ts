export type OperationalTone = "slate" | "blue" | "amber" | "emerald" | "rose" | "violet" | "orange";

const TONE_CLASSES: Record<OperationalTone, string> = {
  slate:
    "border-slate-200/95 bg-[linear-gradient(180deg,rgba(244,247,253,1),rgba(231,237,248,0.96))] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-[rgba(110,128,200,0.48)] dark:bg-[linear-gradient(180deg,rgba(36,44,80,0.96),rgba(24,32,62,0.98))] dark:text-[#CBD8F4]",
  blue:
    "border-sky-200/95 bg-[linear-gradient(180deg,rgba(238,247,255,1),rgba(218,231,254,0.98))] text-sky-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(86,150,232,0.58)] dark:bg-[linear-gradient(180deg,rgba(12,34,84,0.96),rgba(9,26,68,0.98))] dark:text-[#C4DCFF]",
  amber:
    "border-amber-200/95 bg-[linear-gradient(180deg,rgba(255,251,236,1),rgba(254,236,183,0.96))] text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(215,155,42,0.58)] dark:bg-[linear-gradient(180deg,rgba(68,44,6,0.96),rgba(50,32,4,0.98))] dark:text-[#FDCF7A]",
  emerald:
    "border-emerald-200/95 bg-[linear-gradient(180deg,rgba(236,253,245,1),rgba(198,246,214,0.94))] text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(52,194,140,0.58)] dark:bg-[linear-gradient(180deg,rgba(8,46,28,0.96),rgba(5,34,18,0.98))] dark:text-[#8DECC6]",
  rose:
    "border-rose-200/95 bg-[linear-gradient(180deg,rgba(255,241,245,1),rgba(255,224,232,0.98))] text-rose-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] dark:border-[rgba(200,60,100,0.60)] dark:bg-[linear-gradient(180deg,rgba(74,10,28,0.96),rgba(56,7,20,0.98))] dark:text-[#F8A8BE]",
  violet:
    "border-violet-200/95 bg-[linear-gradient(180deg,rgba(246,242,255,1),rgba(231,218,255,0.95))] text-violet-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(142,100,220,0.65)] dark:bg-[linear-gradient(180deg,rgba(52,18,100,0.96),rgba(36,12,78,0.98))] dark:text-[#D4BAFF]",
  orange:
    "border-orange-200/95 bg-[linear-gradient(180deg,rgba(255,247,238,1),rgba(255,223,186,0.96))] text-orange-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(210,120,52,0.58)] dark:bg-[linear-gradient(180deg,rgba(70,30,6,0.96),rgba(52,22,4,0.98))] dark:text-[#F8BE88]",
};

const DOT_CLASSES: Record<OperationalTone, string> = {
  slate: "bg-slate-400 dark:bg-slate-500",
  blue: "bg-sky-500 dark:bg-sky-400",
  amber: "bg-amber-400 dark:bg-amber-400",
  emerald: "bg-emerald-500 dark:bg-emerald-400",
  rose: "bg-rose-500 dark:bg-rose-400",
  violet: "bg-violet-500 dark:bg-violet-400",
  orange: "bg-orange-500 dark:bg-orange-400",
};

const CLOSED_VALUES = new Set(["POSTED", "PUBLISHED", "PUBLISHED_MANUALLY", "COMPLETED"]);

const ROSE_VALUES = new Set([
  "FAILED",
  "CONFLICT",
  "REJECTED",
  "DUPLICATE",
]);

const AMBER_VALUES = new Set([
  "BLOCKED",
  "CHANGES_REQUESTED",
  "DESIGN_FAILED",
  "DESIGN_REQUESTED",
  "DESIGN_IN_PROGRESS",
  "TRANSLATION_PENDING",
  "TRANSLATION_REQUESTED",
  "REQUESTED",
  "PARTIALLY_SENT",
  "NEEDS_REIMPORT_DECISION",
  "WAITING_FOR_COPY",
]);

const VIOLET_VALUES = new Set([
  "READY_FOR_DESIGN",
  "IN_DESIGN",
  "DESIGN_READY",
  "DESIGN_APPROVED",
  "CONTENT_APPROVED",
]);

const EMERALD_VALUES = new Set([
  "READY",
  "TRANSLATION_APPROVED",
  "APPROVED",
  "COMPLETED",
  "PROCESSED",
  "SENT_TO_QUEUE",
  "READY_FOR_FINAL_REVIEW",
  "TRANSLATION_READY",
]);

const BLUE_VALUES = new Set([
  "NEEDS_ACTION",
  "IN_PROGRESS",
  "IMPORTED",
  "READY_TO_POST",
  "POSTED",
  "PUBLISHED_MANUALLY",
  "QUEUED",
  "UPDATED",
  "STAGED",
  "PENDING",
  "RECEIVED",
  "PUBLISHED",
]);

const DISPLAY_LABELS: Record<string, string> = {
  BLOCKED: "BLOCKED",
  WAITING_FOR_COPY: "BLOCKED",
  READY_FOR_DESIGN: "DESIGN",
  IN_DESIGN: "In Design",
  CONTENT_APPROVED: "Generate Design",
  TRANSLATION_REQUESTED: "Await Translation",
  TRANSLATION_PENDING: "Translation Pending",
  TRANSLATION_READY: "Review Translation",
  READY_FOR_FINAL_REVIEW: "Final Review",
  READY_TO_POST: "Post to LinkedIn",
  POSTED: "POSTED",
  READY_TO_PUBLISH: "PA",
  PUBLISHED_MANUALLY: "POSTED",
  PUBLISHED: "POSTED",
  DESIGN_REQUESTED: "In Design",
  DESIGN_IN_PROGRESS: "In Design",
  DESIGN_READY: "Approve Design",
  DESIGN_APPROVED: "Pending Approval",
  DESIGN_FAILED: "Design Failed",
  CHANGES_REQUESTED: "Changes Requested",
  TRANSLATION_APPROVED: "Final Review",
  LATE: "Overdue",
};

export type QueueStatePresentation =
  | { label: "BLOCKED"; tone: "amber" }
  | { label: "DESIGN"; tone: "violet" }
  | { label: "PA"; tone: "blue" }
  | { label: "POSTED"; tone: "emerald" };

export function getQueueStatePresentation(value: string | null | undefined): QueueStatePresentation | null {
  if (!value) {
    return null;
  }

  const normalized = value.toUpperCase();

  if (
    normalized === "POSTED" ||
    normalized === "PUBLISHED" ||
    normalized === "PUBLISHED_MANUALLY"
  ) {
    return { label: "POSTED", tone: "emerald" };
  }

  if (normalized === "BLOCKED" || normalized === "WAITING_FOR_COPY" || normalized === "LATE") {
    return { label: "BLOCKED", tone: "amber" };
  }

  if (normalized === "READY_TO_PUBLISH" || normalized === "READY_TO_POST") {
    return { label: "PA", tone: "blue" };
  }

  if (
    normalized === "READY_FOR_DESIGN" ||
    normalized === "CONTENT_APPROVED" ||
    normalized === "IN_DESIGN" ||
    normalized === "DESIGN_REQUESTED" ||
    normalized === "DESIGN_IN_PROGRESS" ||
    normalized === "DESIGN_READY" ||
    normalized === "DESIGN_APPROVED" ||
    normalized === "DESIGN_FAILED" ||
    normalized === "CHANGES_REQUESTED" ||
    normalized === "TRANSLATION_REQUESTED" ||
    normalized === "TRANSLATION_PENDING" ||
    normalized === "TRANSLATION_READY" ||
    normalized === "TRANSLATION_APPROVED" ||
    normalized === "READY_FOR_FINAL_REVIEW"
  ) {
    return { label: "DESIGN", tone: "violet" };
  }

  return null;
}

export function formatOperationalLabel(value: string) {
  const normalized = value.toUpperCase();
  if (DISPLAY_LABELS[normalized]) return DISPLAY_LABELS[normalized];

  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getOperationalTone(value: string | null | undefined): OperationalTone {
  if (!value) {
    return "slate";
  }

  const normalized = value.toUpperCase();

  if (CLOSED_VALUES.has(normalized)) return "emerald";

  if (VIOLET_VALUES.has(normalized)) {
    return "violet";
  }

  if (ROSE_VALUES.has(normalized) || normalized.includes("FAIL") || normalized.includes("REQUEST_CHANGES")) {
    return "rose";
  }

  if (EMERALD_VALUES.has(normalized) || normalized.includes("APPROVED")) {
    return "emerald";
  }

  if (AMBER_VALUES.has(normalized) || normalized.includes("BLOCK") || normalized.includes("PEND")) {
    return "amber";
  }

  if (BLUE_VALUES.has(normalized) || normalized.includes("PROGRESS") || normalized.includes("ACTION")) {
    return "blue";
  }

  return "slate";
}

export function getToneBadgeClasses(value: string | null | undefined) {
  return TONE_CLASSES[getOperationalTone(value)];
}

export function getToneDotClasses(value: string | null | undefined) {
  return DOT_CLASSES[getOperationalTone(value)];
}
