"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ChevronDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatOperationalLabel } from "@/shared/ui/operational-status";

// ─── Badge logic ──────────────────────────────────────────────────────────────

type BadgeColor = "slate" | "amber" | "emerald" | "rose" | "blue";

const BADGE_CLASSES: Record<BadgeColor, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
};

const DOT_CLASSES: Record<BadgeColor, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  amber: "bg-amber-400",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
};

function getStatusBadge(
  currentStatus: string,
  operationalStatus: string | null,
): { label: string; color: BadgeColor } {
  switch (currentStatus) {
    // New states
    case "POSTED":
    case "PUBLISHED_MANUALLY":
      return { label: "Posted", color: "blue" };
    case "READY_TO_POST":
    case "READY_TO_PUBLISH":
      return { label: "Ready to Post", color: "blue" };
    case "READY_FOR_FINAL_REVIEW":
      return { label: "Final Review", color: "emerald" };
    case "WAITING_FOR_COPY":
      return { label: "Awaiting Copy", color: "amber" };
    case "READY_FOR_DESIGN":
    case "CONTENT_APPROVED":
      return { label: "Ready for Design", color: "emerald" };
    case "IN_DESIGN":
    case "DESIGN_REQUESTED":
    case "DESIGN_IN_PROGRESS":
      return { label: "In Design", color: "amber" };
    case "TRANSLATION_REQUESTED":
    case "TRANSLATION_PENDING":
      return { label: "Translation Requested", color: "amber" };
    case "TRANSLATION_READY":
      return { label: "Translation Ready", color: "blue" };
    // Shared
    case "DESIGN_READY":
      return { label: "Design Ready", color: "emerald" };
    case "DESIGN_APPROVED":
      return { label: "Design Approved", color: "emerald" };
    case "DESIGN_FAILED":
      return { label: "Design Failed", color: "rose" };
    case "CHANGES_REQUESTED":
      return { label: "Changes Requested", color: "rose" };
    case "TRANSLATION_APPROVED":
      return { label: "Translation Approved", color: "emerald" };
  }

  // Early-workflow: fall through to operational status
  switch (operationalStatus) {
    case "WAITING_FOR_COPY":
      return { label: "Awaiting Copy", color: "amber" };
    case "READY_FOR_DESIGN":
      return { label: "Ready for Design", color: "emerald" };
    case "PUBLISHED":
      return { label: "Posted", color: "blue" };
  }

  return { label: formatOperationalLabel(currentStatus), color: "slate" };
}

function getDeadlineBadge(
  deadlineStr: string | null,
  isLate: boolean,
): { label: string; color: BadgeColor } | null {
  if (isLate) return { label: "Overdue", color: "rose" };
  if (!deadlineStr?.trim()) return null;

  const trimmed = deadlineStr.trim();

  let date: Date | null = null;
  const direct = new Date(trimmed);
  if (!isNaN(direct.getTime())) {
    date = direct;
  } else {
    const withYear = new Date(`${trimmed} ${new Date().getFullYear()}`);
    if (!isNaN(withYear.getTime())) date = withYear;
  }

  if (!date) return { label: `Due ${trimmed}`, color: "slate" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.floor((target.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return { label: "Overdue", color: "rose" };
  if (days === 0) return { label: "Due Today", color: "rose" };
  if (days === 1) return { label: "Due Tomorrow", color: "amber" };
  if (days <= 3) {
    const day = target.toLocaleDateString("en-US", { weekday: "short" });
    return { label: `Due ${day}`, color: "amber" };
  }
  const label = target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label: `Due ${label}`, color: "emerald" };
}

// ─── Pipeline step ────────────────────────────────────────────────────────────

type PipelineStep = "copy" | "design" | "translation" | "review" | "post";

const DESIGN_STATUSES = new Set([
  "READY_FOR_DESIGN",
  "CONTENT_APPROVED",
  "IN_DESIGN",
  "DESIGN_REQUESTED",
  "DESIGN_IN_PROGRESS",
  "DESIGN_FAILED",
  "DESIGN_READY",
  "DESIGN_APPROVED",
  "CHANGES_REQUESTED",
]);

const TRANSLATION_STATUSES = new Set([
  "TRANSLATION_PENDING",
  "TRANSLATION_REQUESTED",
  "TRANSLATION_READY",
  "TRANSLATION_APPROVED",
]);

const POST_STATUSES = new Set([
  "READY_TO_POST",
  "READY_TO_PUBLISH",
  "POSTED",
  "PUBLISHED_MANUALLY",
]);

function getPipelineStep(currentStatus: string): PipelineStep {
  if (DESIGN_STATUSES.has(currentStatus)) return "design";
  if (TRANSLATION_STATUSES.has(currentStatus)) return "translation";
  if (currentStatus === "READY_FOR_FINAL_REVIEW") return "review";
  if (POST_STATUSES.has(currentStatus)) return "post";
  return "copy";
}

// ─── Next-action labels ───────────────────────────────────────────────────────

// Part 3: shared action labels — must match primaryActionLabel in page.tsx
export const ACTION_LABELS: Record<string, string> = {
  design_start: "Generate Design",
  design_refresh: "Sync Design",
  design_retry: "Retry Design",
  design_approve: "Approve Design",
  translation_approve: "Approve Translation",
  final_review: "Final Review",
  post_on_li: "POST on LI",
  review: "Continue Process",
  waiting: "",
};

// Part 2: operationalStatus overrides primaryActionKind when blocked in early stages
function getNextAction(primaryActionKind: string, operationalStatus: string | null): string {
  if (primaryActionKind === "review" || primaryActionKind === "waiting") {
    if (operationalStatus === "WAITING_FOR_COPY") return "Await Copy";
    if (operationalStatus === "READY_FOR_DESIGN") return "Send to Design";
  }
  return ACTION_LABELS[primaryActionKind] ?? "";
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

function ownerLabel(profile: string): string {
  switch (profile) {
    case "YANN": return "Yann";
    case "YURI": return "Yuri";
    case "SHAWN": return "Shawn";
    case "SOPHIAN_YACINE": return "Sophian Yacine";
    case "ZAZMIC_PAGE": return "Zazmic Page";
    default: return profile.toLowerCase().replaceAll("_", " ");
  }
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 2) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function designProviderLabel(provider: string): string {
  switch (provider) {
    case "CANVA": return "Canva";
    case "AI_VISUAL": return "AI Visual";
    default: return "Manual";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ItemHeaderProps = {
  title: string;
  profile: string;
  currentStatus: string;
  operationalStatus: string | null;
  contentDeadline: string | null;
  plannedDate: string | null;
  primaryActionKind: string;
  updatedAt: string; // ISO string — Part 7 freshness signal
  // Expanded metadata (hidden by default)
  sourceWorksheetName: string | null;
  sourceRowRef: string | null;
  importMode: string | null;
  importStatus: string | null;
  templateRouteLabel: string | null;
  translationRequired: boolean;
  translationStatus: string;
  preferredDesignProvider: string;
  contentType: string;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function PipelineProgress({
  step,
  showTranslation,
}: {
  step: PipelineStep;
  showTranslation: boolean;
}) {
  const steps: Array<{ key: PipelineStep; label: string }> = [
    { key: "copy", label: "Copy" },
    { key: "design", label: "Design" },
    ...(showTranslation ? [{ key: "translation" as PipelineStep, label: "Translation" }] : []),
    { key: "review", label: "Review" },
    { key: "post", label: "Post" },
  ];

  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <span key={s.key} className="flex items-center gap-1">
            {i > 0 && (
              <span className={cn("select-none text-[11px]", i <= currentIdx ? "text-slate-300" : "text-slate-200")}>
                →
              </span>
            )}
            {isDone ? (
              <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
                <span className="text-[10px] leading-none">✓</span>
                {s.label}
              </span>
            ) : isCurrent ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-slate-900">
                <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-900" />
                {s.label}
              </span>
            ) : (
              <span className="text-xs text-slate-300">{s.label}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-xs text-slate-600">{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ItemHeader({
  title,
  profile,
  currentStatus,
  operationalStatus,
  contentDeadline,
  plannedDate,
  primaryActionKind,
  updatedAt,
  sourceWorksheetName,
  sourceRowRef,
  importMode,
  importStatus,
  templateRouteLabel,
  translationRequired,
  translationStatus,
  preferredDesignProvider,
  contentType,
}: ItemHeaderProps) {
  const [expanded, setExpanded] = useState(false);

  const owner = ownerLabel(profile);
  const statusBadge = getStatusBadge(currentStatus, operationalStatus);
  const deadlineBadge = getDeadlineBadge(contentDeadline, operationalStatus === "LATE");
  const pipelineStep = getPipelineStep(currentStatus);
  const nextAction = getNextAction(primaryActionKind, operationalStatus);
  const showPlannedDate = !deadlineBadge && plannedDate?.trim();
  const freshness = formatRelativeTime(new Date(updatedAt));

  const hasMetadata = Boolean(
    sourceWorksheetName || importMode || templateRouteLabel,
  );

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* ── Compact view ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-5 py-4">
        <Link
          href="/queue"
          className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-900"
          aria-label="Back to queue"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>

        <div className="min-w-0 flex-1 space-y-2">
          {/* 1. Title */}
          <h1 className="text-xl font-semibold leading-snug tracking-tight text-slate-900">
            {title}
          </h1>

          {/* 2. Owner · Status · Deadline */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="flex items-center gap-1 text-sm text-slate-500">
              <User className="h-3.5 w-3.5 flex-shrink-0" />
              {owner}
            </span>

            <span className="select-none text-slate-300">·</span>

            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                BADGE_CLASSES[statusBadge.color],
              )}
            >
              <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", DOT_CLASSES[statusBadge.color])} />
              {statusBadge.label}
            </span>

            {deadlineBadge ? (
              <>
                <span className="select-none text-slate-300">·</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    BADGE_CLASSES[deadlineBadge.color],
                  )}
                >
                  {deadlineBadge.label}
                </span>
              </>
            ) : showPlannedDate ? (
              <>
                <span className="select-none text-slate-300">·</span>
                <span className="text-xs text-slate-400">Planned {plannedDate}</span>
              </>
            ) : null}
          </div>

          {/* 3. Next action */}
          {nextAction ? (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-400">Next:</span>
              <span className="font-medium text-slate-700">{nextAction}</span>
            </div>
          ) : null}

          {/* 4. Progress pipeline + freshness */}
          <div className="flex items-center justify-between gap-4">
            <PipelineProgress step={pipelineStep} showTranslation={translationRequired} />
            <span className="flex-shrink-0 text-[11px] text-slate-400">Updated {freshness}</span>
          </div>

          {/* 5. Details toggle */}
          {hasMetadata ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-600"
            >
              <span>{expanded ? "Hide details" : "Details"}</span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform duration-150",
                  expanded && "rotate-180",
                )}
              />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Expanded metadata ─────────────────────────────────────────────── */}
      {expanded && hasMetadata ? (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3.5">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {sourceWorksheetName ? (
              <MetaField label="Sheet" value={sourceWorksheetName} />
            ) : null}
            {sourceRowRef ? (
              <MetaField label="Row" value={sourceRowRef} />
            ) : null}
            {importMode && importStatus ? (
              <MetaField label="Import" value={`${importMode} / ${importStatus}`} />
            ) : null}
            {templateRouteLabel && templateRouteLabel !== "No active mapping" ? (
              <MetaField label="Template" value={templateRouteLabel} />
            ) : null}
            <MetaField label="Owner" value={owner} />
            <MetaField
              label="Type"
              value={contentType === "STATIC_POST" ? "Static post" : "Carousel"}
            />
            <MetaField label="Design" value={designProviderLabel(preferredDesignProvider)} />
            <MetaField
              label="Translation"
              value={
                translationRequired
                  ? `Required · ${translationStatus.toLowerCase().replaceAll("_", " ")}`
                  : "English only"
              }
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
