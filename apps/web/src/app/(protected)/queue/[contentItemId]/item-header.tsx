"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ChevronDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SemanticWorkflowDecision } from "@/modules/content-catalog/application/content-workflow-view-model";
import { StatusBadge } from "@/shared/ui/status-badge";
import { WorkflowStepper } from "@/shared/ui/workflow-stepper";
import {
  formatOperationalLabel,
  getQueueStatePresentation,
  type OperationalTone,
} from "@/shared/ui/operational-status";

type BadgeColor = OperationalTone;

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

export const ACTION_LABELS: Record<string, string> = {
  design_start: "Generate Design",
  design_refresh: "Sync Design",
  design_retry: "Retry Design",
  design_approve: "Approve Design",
  translation_approve: "Review Translation",
  final_review: "Final Review",
  post_on_li: "Post to LinkedIn",
  review: "Continue Process",
  waiting: "",
};

export type ItemHeaderProps = {
  title: string;
  profile: string;
  currentStatus: string;
  operationalStatus: string | null;
  /** The block reason read from the planning snapshot workflow field (e.g. "MISSING_COPY"). */
  operationalBlockReason?: string | null;
  contentDeadline: string | null;
  plannedDate: string | null;
  primaryActionKind: string;
  updatedAt: string;
  sourceWorksheetName: string | null;
  sourceSpreadsheetName: string | null;
  dateCreated: string;
  datePosted: string | null;
  isDesignDone: boolean;
  templateRouteLabel: string | null;
  translationRequired: boolean;
  translationStatus: string;
  preferredDesignProvider: string;
  contentType: string;
  originalCopyBody: string | null;
  semanticDecision: SemanticWorkflowDecision | null;
};

function ownerLabel(profile: string): string {
  switch (profile) {
    case "YANN":
      return "Yann";
    case "YURI":
      return "Yuri";
    case "SHAWN":
      return "Shawn";
    case "SOPHIAN_YACINE":
      return "Sophian Yacine";
    case "ZAZMIC_PAGE":
      return "Zazmic Page";
    default:
      return profile.toLowerCase().replaceAll("_", " ");
  }
}

/**
 * Extracts the owner name from a spreadsheet name following the "SMM Plan | Owner Name" convention.
 * Primary source of truth for owner display — avoids profile-enum guesses.
 */
function extractOwnerFromSpreadsheetName(spreadsheetName: string | null | undefined): string | null {
  if (!spreadsheetName) return null;
  const pipeIndex = spreadsheetName.indexOf("|");
  if (pipeIndex === -1) return null;
  const owner = spreadsheetName.slice(pipeIndex + 1).trim();
  return owner.length > 0 ? owner : null;
}

function getStatusBadge(
  currentStatus: string,
  operationalStatus: string | null,
  semanticDecision: SemanticWorkflowDecision | null,
): { label: string; color: BadgeColor } {
  const queueState = getQueueStatePresentation(
    currentStatus === "POSTED" || currentStatus === "PUBLISHED_MANUALLY"
      ? currentStatus
      : operationalStatus ?? currentStatus,
  );

  if (queueState) {
    return { label: queueState.label, color: queueState.tone };
  }

  if (semanticDecision) {
    return {
      label: semanticDecision.visibleStatusLabel,
      color:
        semanticDecision.baseVisualFamily === "green"
          ? "emerald"
          : semanticDecision.baseVisualFamily === "amber"
            ? "amber"
            : semanticDecision.baseVisualFamily === "blue"
              ? "blue"
            : semanticDecision.baseVisualFamily === "lavender"
              ? "violet"
              : "slate",
    };
  }

  return { label: formatOperationalLabel(currentStatus), color: "slate" };
}

function getDeadlineBadge(
  deadline: string | null,
  isLate: boolean,
): { label: string; color: BadgeColor } | null {
  if (isLate) {
    return { label: "Overdue", color: "rose" };
  }

  if (!deadline?.trim()) {
    return null;
  }

  const trimmed = deadline.trim();
  const parsed = new Date(trimmed);
  const date = Number.isNaN(parsed.getTime())
    ? new Date(`${trimmed} ${new Date().getFullYear()}`)
    : parsed;

  if (Number.isNaN(date.getTime())) {
    return { label: `Due ${trimmed}`, color: "slate" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.floor((target.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return { label: "Overdue", color: "rose" };
  if (days === 0) return { label: "Due Today", color: "rose" };
  if (days === 1) return { label: "Due Tomorrow", color: "amber" };
  if (days <= 3) {
    return {
      label: `Due ${target.toLocaleDateString("en-US", { weekday: "short" })}`,
      color: "amber",
    };
  }

  return {
    label: `Due ${target.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    color: "emerald",
  };
}

function getPipelineStep(currentStatus: string): PipelineStep {
  if (DESIGN_STATUSES.has(currentStatus)) return "design";
  if (TRANSLATION_STATUSES.has(currentStatus)) return "translation";
  if (currentStatus === "READY_FOR_FINAL_REVIEW") return "review";
  if (POST_STATUSES.has(currentStatus)) return "post";
  return "copy";
}

function getNextAction(
  primaryActionKind: string,
  operationalStatus: string | null,
  semanticDecision: SemanticWorkflowDecision | null,
): string {
  if (semanticDecision) {
    return semanticDecision.nextActionLabel;
  }

  if (primaryActionKind === "review" || primaryActionKind === "waiting") {
    if (operationalStatus === "BLOCKED" || operationalStatus === "WAITING_FOR_COPY") return "Blocked";
    if (operationalStatus === "READY_FOR_DESIGN") return "Generate Design";
    if (operationalStatus === "READY_TO_PUBLISH") return "Post to LinkedIn";
    if (operationalStatus === "POSTED") return "Posted";
  }

  return ACTION_LABELS[primaryActionKind] ?? "";
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 2) return "Updated just now";
  if (diffMins < 60) return `Updated ${diffMins}m ago`;
  if (diffDays === 0) return "Updated today";
  if (diffDays === 1) return "Updated yesterday";
  if (diffDays < 30) return `Updated ${diffDays} days ago`;
  return `Updated ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function getHeaderShellClasses(tone: BadgeColor) {
  switch (tone) {
    case "rose":
      return "border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,250,251,0.98),rgba(255,241,242,0.95))] dark:border-[rgba(225,29,72,0.18)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.99),rgba(11,17,32,0.97))]";
    case "amber":
      return "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.9))] dark:border-[rgba(245,158,11,0.15)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.99),rgba(11,17,32,0.97))]";
    case "emerald":
      return "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(247,254,250,0.98),rgba(236,253,245,0.95))] dark:border-[rgba(52,211,153,0.15)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.99),rgba(11,17,32,0.97))]";
    case "blue":
      return "border-sky-200/80 bg-[linear-gradient(180deg,rgba(247,252,255,0.98),rgba(240,249,255,0.95))] dark:border-[rgba(56,189,248,0.12)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.99),rgba(11,17,32,0.97))]";
    case "violet":
      return "border-violet-200/80 bg-[linear-gradient(180deg,rgba(250,245,255,0.98),rgba(237,233,254,0.95))] dark:border-[rgba(139,92,246,0.15)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.99),rgba(11,17,32,0.97))]";
    case "slate":
    default:
      return "border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] dark:border-[rgba(99,102,241,0.15)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.99),rgba(11,17,32,0.97))]";
  }
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200/80 bg-white/85 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-[rgba(99,102,241,0.12)] dark:bg-[rgba(15,23,42,0.6)]">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{label}</span>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{value}</p>
    </div>
  );
}

function SeparatorDot() {
  return <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden="true" />;
}

function formatIsoDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ItemHeader({
  title,
  profile,
  currentStatus,
  operationalStatus,
  operationalBlockReason,
  contentDeadline,
  plannedDate,
  primaryActionKind,
  updatedAt,
  sourceWorksheetName,
  sourceSpreadsheetName,
  dateCreated,
  datePosted,
  isDesignDone,
  templateRouteLabel,
  translationRequired,
  translationStatus,
  preferredDesignProvider,
  contentType,
  originalCopyBody,
  semanticDecision,
}: ItemHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  void templateRouteLabel;
  void preferredDesignProvider;

  // Copy step turns red when the item is blocked specifically because LinkedIn Copy is missing.
  const copyBlocked = operationalStatus === "BLOCKED" && operationalBlockReason === "MISSING_COPY";

  // Owner is derived from the spreadsheet name ("SMM Plan | Owner Name") — not from the profile enum.
  const owner = extractOwnerFromSpreadsheetName(sourceSpreadsheetName) ?? ownerLabel(profile);
  const statusBadge = getStatusBadge(currentStatus, operationalStatus, semanticDecision);
  const deadlineBadge = getDeadlineBadge(
    contentDeadline,
    semanticDecision?.overdueOverlay ?? operationalStatus === "LATE",
  );
  const pipelineStep = semanticDecision
    ? semanticDecision.statusKey === "PUBLISHED"
      ? "post"
      : semanticDecision.statusKey === "READY_TO_PUBLISH"
        ? "post"
      : semanticDecision.statusKey === "READY_FOR_DESIGN"
        ? "design"
        : "copy"
    : getPipelineStep(currentStatus);
  const nextAction = getNextAction(primaryActionKind, operationalStatus, semanticDecision);
  const freshness = formatRelativeTime(new Date(updatedAt));
  const plannedLabel = plannedDate?.trim() ? `Planned ${plannedDate.trim()}` : null;
  const hasMetadata = Boolean(sourceWorksheetName || sourceSpreadsheetName || dateCreated || owner || contentType);
  const hasCopyReference = Boolean(originalCopyBody);
  const hasDetails = hasMetadata || hasCopyReference;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[28px] border shadow-[0_24px_70px_-48px_rgba(15,23,42,0.38)]",
        getHeaderShellClasses(statusBadge.color),
      )}
    >
      <div className="flex items-start gap-4 px-5 py-5 sm:px-6">
        <Link
          href="/queue"
          className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/88 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A66C2] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-[rgba(101,118,191,0.35)] dark:bg-[rgba(31,38,70,0.84)] dark:text-[#9AA9CB] dark:hover:border-[rgba(131,145,226,0.5)] dark:hover:text-slate-100 dark:focus-visible:ring-indigo-300 dark:focus-visible:ring-offset-[#0A1023]"
          aria-label="Back to queue"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-[#8B97B7]">
                  Queue item
                </span>
                <SeparatorDot />
                <span className="flex items-center gap-1.5 font-medium text-slate-500 dark:text-[#95A6CA]">
                  <User className="h-3.5 w-3.5 flex-shrink-0" />
                  {owner}
                </span>
              </div>

              <h1 className="max-w-4xl text-2xl font-semibold leading-tight tracking-[-0.03em] text-slate-950 dark:text-slate-100 sm:text-[2rem]">
                {title}
              </h1>
            </div>

              <span
                className="hidden rounded-full border border-white/80 bg-white/82 px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:inline-flex dark:border-[rgba(101,118,191,0.35)] dark:bg-[rgba(31,38,70,0.8)] dark:text-[#95A6CA]"
                data-testid="item-freshness"
              >
              {freshness}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div data-testid="item-status">
              <StatusBadge variant={statusBadge.color} label={statusBadge.label} />
            </div>

            {deadlineBadge ? (
              <StatusBadge variant={deadlineBadge.color} label={deadlineBadge.label} dot={false} />
            ) : plannedLabel ? (
              <span className="inline-flex items-center rounded-full border border-white/80 bg-white/78 px-3 py-1 text-xs font-semibold text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                {plannedLabel}
              </span>
            ) : null}

            {nextAction ? (
              <span
                className="inline-flex items-center rounded-full border border-slate-200 bg-white/88 px-3 py-1 text-xs font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                data-testid="item-header-next"
              >
                Next: {nextAction}
              </span>
            ) : null}

              <span className="rounded-full border border-white/80 bg-white/72 px-3 py-1 text-xs font-medium text-slate-500 sm:hidden dark:border-[rgba(101,118,191,0.35)] dark:bg-[rgba(31,38,70,0.8)] dark:text-[#95A6CA]">
                {freshness}
              </span>
          </div>

          <div className="rounded-[22px] border border-white/80 bg-white/72 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div data-testid="item-progress">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Workflow
                </p>
                <WorkflowStepper
                  steps={[
                    { key: "copy", label: "Copy" },
                    { key: "design", label: "Design" },
                    ...(translationRequired ? [{ key: "translation", label: "Translation" }] : []),
                    { key: "review", label: "Review" },
                    { key: "post", label: "Post" },
                  ]}
                  currentKey={pipelineStep}
                  errorKey={copyBlocked ? "copy" : undefined}
                />
              </div>

              {hasDetails ? (
                <button
                  type="button"
                  onClick={() => setExpanded((current) => !current)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-default hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A66C2] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-indigo-400/40 dark:bg-[rgba(26,34,70,0.8)] dark:text-indigo-200 dark:hover:border-indigo-400/70 dark:hover:bg-indigo-900/50 dark:hover:text-white"
                >
                  <span>{expanded ? "Hide details" : "Open details"}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
                </button>
              ) : null}
            </div>
          </div>

          {hasDetails ? (
            <div className="text-xs text-slate-400 dark:text-[#8A97B8]">
              Source, import, template, and LinkedIn copy stay available on demand.
            </div>
          ) : null}
        </div>
      </div>

      {expanded && hasDetails ? (
        <div className="border-t border-white/80 bg-white/72 px-5 py-4 backdrop-blur-sm sm:px-6 dark:border-[rgba(95,114,186,0.34)] dark:bg-[rgba(14,20,42,0.78)]">
          {hasMetadata ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {sourceWorksheetName ? <MetaField label="Sheet" value={sourceWorksheetName} /> : null}
              {sourceSpreadsheetName ? <MetaField label="Spreadsheet" value={sourceSpreadsheetName} /> : null}
              <MetaField label="Date created" value={formatIsoDate(dateCreated)} />
              {contentDeadline ? <MetaField label="Original date for posting" value={contentDeadline} /> : null}
              {datePosted ? <MetaField label="Date posted" value={formatIsoDate(datePosted)} /> : null}
              <MetaField label="Owner" value={owner} />
              <MetaField
                label="Type"
                value={contentType === "STATIC_POST" ? "Static post" : "Carousel"}
              />
              <MetaField label="Design" value={isDesignDone ? "Done" : "Not yet"} />
              <MetaField
                label="Translation"
                value={
                  translationRequired
                    ? `Required - ${translationStatus.toLowerCase().replaceAll("_", " ")}`
                    : "English only"
                }
              />
            </div>
          ) : null}

          <div className={cn("space-y-3", hasMetadata ? "mt-5 border-t border-slate-200/80 pt-4" : "")}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-[#8B97B7]">
                LinkedIn Copy
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-[#95A6CA]">
                Read-only reference from the operational spreadsheet fields.
              </p>
            </div>

            {originalCopyBody ? (
              <div className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.24)] dark:border-[rgba(95,114,186,0.34)] dark:bg-[rgba(16,23,47,0.84)] dark:shadow-[0_18px_40px_-30px_rgba(35,45,98,0.5)]">
                <p
                  data-testid="original-copy-body"
                  className="whitespace-pre-wrap text-slate-700 dark:text-[#D6DEFB]"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: "12px", lineHeight: 1.6 }}
                >
                  {originalCopyBody}
                </p>
              </div>
            ) : (
              <div
                className="rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500 dark:border-[rgba(95,114,186,0.34)] dark:bg-[rgba(16,23,47,0.84)] dark:text-[#95A6CA]"
                data-testid="original-copy-empty"
              >
                No final LinkedIn copy found in source spreadsheet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
