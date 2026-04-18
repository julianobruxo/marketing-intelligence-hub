export type OperationalTone = "slate" | "blue" | "amber" | "emerald" | "rose";

const TONE_CLASSES: Record<OperationalTone, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
};

const DOT_CLASSES: Record<OperationalTone, string> = {
  slate: "bg-slate-400",
  blue: "bg-linkedin-blue",
  amber: "bg-amber-400",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
};

const ROSE_VALUES = new Set([
  "FAILED",
  "DESIGN_FAILED",
  "CHANGES_REQUESTED",
  "CONFLICT",
  "REJECTED",
  "DUPLICATE",
]);

const AMBER_VALUES = new Set([
  "BLOCKED",
  "DESIGN_REQUESTED",
  "DESIGN_IN_PROGRESS",
  "IN_DESIGN",
  "TRANSLATION_PENDING",
  "TRANSLATION_REQUESTED",
  "REQUESTED",
  "PARTIALLY_SENT",
  "NEEDS_REIMPORT_DECISION",
  "WAITING_FOR_COPY",
]);

const EMERALD_VALUES = new Set([
  "READY",
  "DESIGN_READY",
  "DESIGN_APPROVED",
  "TRANSLATION_APPROVED",
  "APPROVED",
  "COMPLETED",
  "PROCESSED",
  "SENT_TO_QUEUE",
  "PUBLISHED_MANUALLY",
  "READY_FOR_DESIGN",
  "READY_FOR_FINAL_REVIEW",
  "TRANSLATION_READY",
]);

const BLUE_VALUES = new Set([
  "NEEDS_ACTION",
  "IN_PROGRESS",
  "IMPORTED",
  "READY_TO_PUBLISH",
  "READY_TO_POST",
  "POSTED",
  "QUEUED",
  "UPDATED",
  "STAGED",
  "PENDING",
  "RECEIVED",
  "PUBLISHED",
]);

const DISPLAY_LABELS: Record<string, string> = {
  WAITING_FOR_COPY: "Awaiting Copy",
  READY_FOR_DESIGN: "Ready for Design",
  IN_DESIGN: "In Design",
  TRANSLATION_REQUESTED: "Translation Requested",
  TRANSLATION_READY: "Translation Ready",
  READY_FOR_FINAL_REVIEW: "Final Review",
  READY_TO_POST: "Ready to Post",
  POSTED: "Posted",
  // Legacy rename in display
  READY_TO_PUBLISH: "Ready to Post",
  PUBLISHED_MANUALLY: "Posted",
  CONTENT_APPROVED: "Ready for Design",
  DESIGN_REQUESTED: "In Design",
  DESIGN_IN_PROGRESS: "In Design",
  TRANSLATION_PENDING: "Translation Requested",
  LATE: "Overdue",
};

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

  if (normalized === "LATE") return "rose";
  if (normalized === "PUBLISHED") return "blue";

  if (ROSE_VALUES.has(normalized) || normalized.includes("FAIL") || normalized.includes("REQUEST_CHANGES")) {
    return "rose";
  }

  if (EMERALD_VALUES.has(normalized) || normalized.includes("APPROVED") || normalized.includes("PUBLISHED")) {
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
