import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { ApprovalDecision, ApprovalStage, DesignRequestStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildApprovalCheckpoints,
  buildContentTimeline,
  buildDesignAttemptHistory,
  buildOperationalSummary,
  buildTemplateRoutingSummary,
} from "@/modules/content-catalog/application/content-workflow-view-model";
import { getContentItemDetail } from "@/modules/content-catalog/application/content-queries";
import {
  approveDesignReadyAction,
  runCanvaDesignRequestAction,
  syncCanvaDesignRequestAction,
} from "@/modules/design-orchestration/application/run-canva-design-request";
import { isSliceOneCanvaEligible } from "@/modules/design-orchestration/domain/canva-slice";
import { designSimulationScenarioSchema } from "@/modules/design-orchestration/domain/design-provider";
import {
  addWorkflowNoteAction,
  recordApprovalAction,
  recordApprovalActionWithDecision,
} from "@/modules/workflow/application/workflow-actions";
import { canRecordApprovalAction } from "@/modules/workflow/domain/phase-one-workflow";
import { CollapsibleSection } from "./collapsible-section";

// ─── Label helpers ────────────────────────────────────────────────────────────

/**
 * Maps raw camelCase or snake_case field names from planningSnapshot
 * to human-readable Title Case labels.
 */
function fieldDisplayLabel(rawKey: string): string {
  const MAP: Record<string, string> = {
    copyEnglish: "Copy (English)",
    copyPortuguese: "Copy (Portuguese)",
    plannedDate: "Planned date",
    campaignLabel: "Campaign",
    platformLabel: "Platform",
    contentDeadline: "Content deadline",
    sheetProfileKey: "Sheet profile",
    titleDerivation: "Title derivation",
    publishedFlag: "Published",
    publishedPostLink: "Published post link",
    // snake_case variants (in case they appear)
    COPYENGLISH: "Copy (English)",
    COPYPORTUGUESE: "Copy (Portuguese)",
    PLANNEDDATE: "Planned date",
    CAMPAIGNLABEL: "Campaign",
    PLATFORMLABEL: "Platform",
    CONTENTDEADLINE: "Content deadline",
    SHEETPROFILEKEY: "Sheet profile",
    TITLEDERIVATION: "Title derivation",
    PUBLISHEDFLAG: "Published",
    PUBLISHEDPOSTLINK: "Published post link",
  };

  if (MAP[rawKey]) return MAP[rawKey];

  // Fallback: split camelCase, handle underscores, title case
  return rawKey
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function formatProfileLabel(profile: string) {
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

function profileBadgeStyle(profile: string): { backgroundColor: string; color: string } {
  switch (profile) {
    case "YANN":
      return { backgroundColor: "#DBEAFE", color: "#1E40AF" };
    case "YURI":
      return { backgroundColor: "#FEE2E2", color: "#991B1B" };
    case "SHAWN":
      return { backgroundColor: "#D1FAE5", color: "#065F46" };
    case "SOPHIAN_YACINE":
      return { backgroundColor: "#E9D5FF", color: "#6B21A8" };
    case "ZAZMIC_PAGE":
      return { backgroundColor: "#FFEDD5", color: "#9A3412" };
    default:
      return { backgroundColor: "#F1F5F9", color: "#475569" };
  }
}

function formatStatusLabel(status: string): string {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDateShort(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

// ─── Planning snapshot helpers ────────────────────────────────────────────────

function getPlanningFieldEntries(planningSnapshot: unknown) {
  if (!planningSnapshot || typeof planningSnapshot !== "object") return [];
  const snapshot = planningSnapshot as Record<string, unknown>;
  const planning = snapshot.planning;
  if (!planning || typeof planning !== "object") return [];
  return Object.entries(planning as Record<string, unknown>).filter(([, value]) => {
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null && value !== undefined;
  });
}

function getSourceMetadataEntries(planningSnapshot: unknown) {
  if (!planningSnapshot || typeof planningSnapshot !== "object") return [];
  const snapshot = planningSnapshot as Record<string, unknown>;
  const sourceMetadata = snapshot.sourceMetadata;
  if (!sourceMetadata || typeof sourceMetadata !== "object") return [];
  return Object.entries(sourceMetadata as Record<string, unknown>).filter(([, value]) => {
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null && value !== undefined;
  });
}

function getNormalizationSnapshot(planningSnapshot: unknown) {
  if (!planningSnapshot || typeof planningSnapshot !== "object") return null;
  const snapshot = planningSnapshot as Record<string, unknown>;
  return snapshot.normalization && typeof snapshot.normalization === "object"
    ? (snapshot.normalization as Record<string, unknown>)
    : null;
}

function formatPlanningValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatNormalizationValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => formatNormalizationValue(key, entry))
      .filter((entry) => entry !== "—");
    return entries.length > 0 ? entries.join(" · ") : "—";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (key === "titleDerivation") {
      const parts: string[] = [];
      if (typeof record.title === "string" && record.title.trim().length > 0) parts.push(record.title.trim());
      if (typeof record.strategy === "string" && record.strategy.trim().length > 0) parts.push(formatLabel(record.strategy));
      if (typeof record.sourceField === "string" && record.sourceField.trim().length > 0) parts.push(`field: ${record.sourceField.trim()}`);
      return parts.length > 0 ? parts.join(" · ") : "—";
    }
    const parts = Object.entries(record)
      .map(([entryKey, entryValue]) => {
        const formattedValue = formatNormalizationValue(entryKey, entryValue);
        return formattedValue === "—" ? null : `${formatLabel(entryKey)}: ${formattedValue}`;
      })
      .filter((entry): entry is string => entry !== null);
    return parts.length > 0 ? parts.join(" · ") : "—";
  }
  return "—";
}

// ─── Small display components ─────────────────────────────────────────────────

function KvRow({ label, value }: { label: string; value: string }) {
  if (!value || value === "—") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-b-0">
      <span className="text-xs text-slate-500 flex-shrink-0 w-36">{label}</span>
      <span className="text-sm text-slate-900 text-right break-all">{value}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 mb-2">
      {children}
    </p>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ContentItemDetailPage({
  params,
}: Readonly<{
  params: Promise<{ contentItemId: string }>;
}>) {
  const { contentItemId } = await params;
  const item = await getContentItemDetail(contentItemId);

  // View model
  const planningFields = getPlanningFieldEntries(item.planningSnapshot);
  const sourceMetadataFields = getSourceMetadataEntries(item.planningSnapshot);
  const normalizationSnapshot = getNormalizationSnapshot(item.planningSnapshot);
  const timelineEntries = buildContentTimeline(item);
  const approvalCheckpoints = buildApprovalCheckpoints(item);
  const operationalSummary = buildOperationalSummary(item);
  const templateRouting = buildTemplateRoutingSummary(item);
  const designAttemptHistory = buildDesignAttemptHistory(item);

  // Derived data
  const latestDesignRequest = item.designRequests[0];
  const latestAsset = item.assets[item.assets.length - 1];
  const latestSourceLink = item.sourceLinks[0];
  const latestImportReceipt = item.importReceipts[0];

  // Action availability
  const canvaEligible = isSliceOneCanvaEligible({
    profile: item.profile,
    contentType: item.contentType,
    sourceLocale: item.sourceLocale,
  });
  const canvaSliceReady = canvaEligible && item.currentStatus === "CONTENT_APPROVED";
  const canvaRetryReady = canvaEligible && item.currentStatus === "DESIGN_FAILED";
  const canRefreshDesign =
    latestDesignRequest &&
    (latestDesignRequest.status === DesignRequestStatus.REQUESTED ||
      latestDesignRequest.status === DesignRequestStatus.IN_PROGRESS);
  const canRecordPublishApproval = canRecordApprovalAction({
    currentStatus: item.currentStatus,
    stage: ApprovalStage.PUBLISH,
  });
  const canRecordTranslationApproval =
    item.translationRequired &&
    canRecordApprovalAction({
      currentStatus: item.currentStatus,
      stage: ApprovalStage.TRANSLATION,
    });

  // Determine primary action type for the prominent card
  type PrimaryActionKind =
    | "design_start"
    | "design_refresh"
    | "design_retry"
    | "design_approve"
    | "publish_approve"
    | "translation_approve"
    | "review"
    | "waiting";

  let primaryActionKind: PrimaryActionKind = "waiting";
  if (canvaSliceReady) primaryActionKind = "design_start";
  else if (canRefreshDesign) primaryActionKind = "design_refresh";
  else if (canvaRetryReady) primaryActionKind = "design_retry";
  else if (item.currentStatus === "DESIGN_READY") primaryActionKind = "design_approve";
  else if (canRecordPublishApproval) primaryActionKind = "publish_approve";
  else if (canRecordTranslationApproval) primaryActionKind = "translation_approve";
  else if (item.currentStatus === "IMPORTED" || item.currentStatus === "IN_REVIEW") primaryActionKind = "review";

  const primaryActionLabel: Record<PrimaryActionKind, string> = {
    design_start: "Start design handoff",
    design_refresh: "Refresh active design handoff",
    design_retry: "Retry failed design attempt",
    design_approve: "Approve the generated design",
    publish_approve: "Record publish approval",
    translation_approve: "Record translation approval",
    review: "Review content and approve",
    waiting: operationalSummary.waitingOn,
  };

  // Count of timeline events for the audit trail badge
  const auditCount = timelineEntries.length;

  // Planned date from planning snapshot
  const planningSnapshotRaw =
    item.planningSnapshot &&
    typeof item.planningSnapshot === "object" &&
    "planning" in (item.planningSnapshot as Record<string, unknown>)
      ? ((item.planningSnapshot as Record<string, unknown>).planning as Record<string, unknown>)
      : null;
  const plannedDateRaw = planningSnapshotRaw?.plannedDate;
  const plannedDateDisplay =
    plannedDateRaw && typeof plannedDateRaw === "string" && plannedDateRaw.trim()
      ? plannedDateRaw
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 animate-fade-in-up">

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ZONE 1 — Identity strip                                           */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm" style={{ animationDelay: '0ms' }}>
        <div className="flex items-start gap-3">
          <Link
            href="/queue"
            className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-900"
            aria-label="Back to queue"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>

          <div className="min-w-0 flex-1 space-y-2">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={profileBadgeStyle(item.profile)}
              >
                {formatProfileLabel(item.profile)}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600">
                {item.contentType === "STATIC_POST" ? "Static post" : "Carousel"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-700">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    item.currentStatus.includes("FAIL") || item.currentStatus.includes("CHANGES")
                      ? "bg-rose-500"
                      : item.currentStatus.includes("READY") || item.currentStatus.includes("APPROVED") || item.currentStatus.includes("PUBLISHED")
                        ? "bg-emerald-500"
                        : item.currentStatus.includes("PROGRESS") || item.currentStatus.includes("REQUESTED")
                          ? "bg-amber-400"
                          : "bg-sky-500"
                  }`}
                />
                {formatStatusLabel(item.currentStatus)}
              </span>
              {item.translationRequired ? (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600">
                  Translation required
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600">
                  English only
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-lg font-semibold leading-snug tracking-tight" style={{ color: '#0F172A' }}>
              {item.title}
            </h1>

            {/* Secondary trace line */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              {latestSourceLink ? (
                <span>
                  Row {latestSourceLink.rowId} in{" "}
                  <span className="text-slate-500">{latestSourceLink.worksheetName}</span>
                </span>
              ) : null}
              {latestImportReceipt ? (
                <>
                  <span>·</span>
                  <span>
                    {formatLabel(latestImportReceipt.mode)} /{" "}
                    {formatLabel(latestImportReceipt.status)}
                  </span>
                </>
              ) : null}
              {templateRouting.activeRouteLabel && templateRouting.activeRouteLabel !== "No active mapping" ? (
                <>
                  <span>·</span>
                  <span>{templateRouting.activeRouteLabel}</span>
                </>
              ) : null}
              {plannedDateDisplay ? (
                <>
                  <span>·</span>
                  <span>Planned {plannedDateDisplay}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ZONE 2 — Action zone                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* 2A — Primary action card */}
      {primaryActionKind === "waiting" ? (
        <section
          className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
          style={{ borderLeft: '4px solid #0A66C2' }}
        >
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: '#0A66C2' }} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#0A66C2' }}>
                Waiting
              </p>
              <p className="text-sm font-medium" style={{ color: '#0F172A' }}>
                {operationalSummary.waitingOn}
              </p>
              <p className="mt-1 text-sm" style={{ color: '#64748B' }}>{operationalSummary.nextStep}</p>
            </div>
          </div>
        </section>
      ) : (
        <section
          className="rounded-xl border-l-4 border border-slate-200 bg-white px-5 py-5 shadow-lg"
          style={{ borderLeftColor: '#E8584A' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#E8584A' }}>
            Primary action
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: '#0F172A' }}>
            {primaryActionLabel[primaryActionKind]}
          </h2>
          <p className="mt-1.5 text-sm leading-6" style={{ color: '#64748B' }}>
            {operationalSummary.nextStep}
          </p>

          {/* Primary action button(s) */}
          <div className="mt-4 flex flex-wrap gap-2">
            {primaryActionKind === "design_start" && (
              <form action={runCanvaDesignRequestAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <input
                  type="hidden"
                  name="simulationScenario"
                  value={designSimulationScenarioSchema.enum.SUCCESS}
                />
                <Button
                  type="submit"
                  className="transition-default"
                  style={{ backgroundColor: '#E8584A', color: 'white' }}
                >
                  Start design handoff
                </Button>
              </form>
            )}

            {primaryActionKind === "design_refresh" && (
              <form action={syncCanvaDesignRequestAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <Button
                  type="submit"
                  className="transition-default"
                  style={{ backgroundColor: '#E8584A', color: 'white' }}
                >
                  Refresh active handoff
                </Button>
              </form>
            )}

            {primaryActionKind === "design_retry" && (
              <form action={runCanvaDesignRequestAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <input
                  type="hidden"
                  name="simulationScenario"
                  value={designSimulationScenarioSchema.enum.FAILURE}
                />
                <Button
                  type="submit"
                  className="transition-default"
                  style={{ backgroundColor: '#E8584A', color: 'white' }}
                >
                  Retry failed handoff
                </Button>
              </form>
            )}

            {primaryActionKind === "design_approve" && (
              <form action={approveDesignReadyAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <Button
                  type="submit"
                  className="transition-default"
                  style={{ backgroundColor: '#E8584A', color: 'white' }}
                >
                  Approve generated design
                </Button>
              </form>
            )}

            {primaryActionKind === "publish_approve" && (
              <>
                <form action={recordApprovalAction}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <input type="hidden" name="stage" value={ApprovalStage.PUBLISH} />
                  <input type="hidden" name="decision" value="APPROVED" />
                  <Button type="submit" className="transition-default" style={{ backgroundColor: '#E8584A', color: 'white' }}>
                    Approve for publish
                  </Button>
                </form>
                <form action={recordApprovalActionWithDecision.bind(null, ApprovalDecision.CHANGES_REQUESTED)}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <input type="hidden" name="stage" value={ApprovalStage.PUBLISH} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="border-slate-300 bg-white hover:bg-slate-50 transition-default"
                    style={{ color: '#0F172A' }}
                  >
                    Request changes
                  </Button>
                </form>
              </>
            )}

            {primaryActionKind === "translation_approve" && (
              <>
                <form action={recordApprovalAction}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <input type="hidden" name="stage" value={ApprovalStage.TRANSLATION} />
                  <input type="hidden" name="decision" value="APPROVED" />
                  <Button type="submit" className="transition-default" style={{ backgroundColor: '#E8584A', color: 'white' }}>
                    Approve translation
                  </Button>
                </form>
                <form action={recordApprovalActionWithDecision.bind(null, ApprovalDecision.CHANGES_REQUESTED)}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <input type="hidden" name="stage" value={ApprovalStage.TRANSLATION} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="border-slate-300 bg-white hover:bg-slate-50 transition-default"
                    style={{ color: '#0F172A' }}
                  >
                    Request changes
                  </Button>
                </form>
              </>
            )}

            {primaryActionKind === "review" && (
              <form action={recordApprovalAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <input type="hidden" name="stage" value={ApprovalStage.PUBLISH} />
                <input type="hidden" name="decision" value="APPROVED" />
                <Button type="submit" className="transition-default" style={{ backgroundColor: '#E8584A', color: 'white' }}>
                  Approve for publish
                </Button>
              </form>
            )}
          </div>
        </section>
      )}

      {/* 2B — Blocker / waiting signal */}
      {operationalSummary.blocker ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-l-4 bg-white px-4 py-3.5 shadow-sm"
          style={{ borderLeftColor: '#F59E0B', borderColor: '#FDE68A' }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: '#D97706' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#92400E' }}>Active blocker</p>
            <p className="mt-0.5 text-sm" style={{ color: '#78350F' }}>{operationalSummary.blocker}</p>
          </div>
        </div>
      ) : null}

      {/* 2C — Secondary actions */}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm" style={{ animationDelay: '100ms' }}>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Add a note or revision
          </p>
          <form action={addWorkflowNoteAction} className="mt-3 space-y-3">
            <input type="hidden" name="contentItemId" value={item.id} />
            <div className="flex gap-3">
              <select
                name="type"
                defaultValue="COMMENT"
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="COMMENT">Comment</option>
                <option value="REVISION">Revision</option>
              </select>
            </div>
            <Textarea
              name="body"
              placeholder="Add a comment or revision note tied to this content item."
              className="min-h-24 bg-white"
            />
            <Button type="submit" variant="outline" className="border-slate-200 transition-default hover:bg-slate-50" style={{ color: '#0F172A' }}>
              Add note
            </Button>
          </form>
        </div>

        {/* Approval forms — secondary, shown only when available and not already primary */}
        {canRecordPublishApproval && primaryActionKind !== "publish_approve" && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
              Publish approval
            </p>
            <form action={recordApprovalAction} className="mt-3 space-y-3">
              <input type="hidden" name="contentItemId" value={item.id} />
              <input type="hidden" name="stage" value={ApprovalStage.PUBLISH} />
              <input type="hidden" name="decision" value="APPROVED" />
              <Textarea
                name="note"
                placeholder="Optional publish approval note."
                className="min-h-20 bg-white"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="transition-default" style={{ backgroundColor: '#E8584A', color: 'white' }}>
                  Record publish approval
                </Button>
                <Button
                  formAction={recordApprovalActionWithDecision.bind(null, ApprovalDecision.CHANGES_REQUESTED)}
                  type="submit"
                  variant="outline"
                  className="border-slate-300 text-slate-900 hover:bg-slate-50"
                >
                  Request changes
                </Button>
              </div>
            </form>
          </div>
        )}

        {canRecordTranslationApproval && primaryActionKind !== "translation_approve" && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
              Translation approval
            </p>
            <form action={recordApprovalAction} className="mt-3 space-y-3">
              <input type="hidden" name="contentItemId" value={item.id} />
              <input type="hidden" name="stage" value={ApprovalStage.TRANSLATION} />
              <input type="hidden" name="decision" value="APPROVED" />
              <Textarea
                name="note"
                placeholder="Optional translation approval note."
                className="min-h-20 bg-white"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="bg-slate-950 text-white hover:bg-slate-800">
                  Record translation approval
                </Button>
                <Button
                  formAction={recordApprovalActionWithDecision.bind(null, ApprovalDecision.CHANGES_REQUESTED)}
                  type="submit"
                  variant="outline"
                  className="border-slate-300 text-slate-900 hover:bg-slate-50"
                >
                  Request changes
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Recent notes inline */}
        {item.notes.length > 0 && (
          <div className="border-t border-slate-100 pt-4 space-y-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
              Recent notes
            </p>
            {item.notes.slice(0, 3).map((note) => (
              <div
                key={note.id}
                className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3"
              >
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="capitalize">{formatLabel(note.type)}</span>
                  <span>·</span>
                  <span>{note.author.name ?? note.author.email}</span>
                  <span>·</span>
                  <span>{formatDateTime(note.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm leading-5 text-slate-800">{note.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ZONE 3 — Supporting context (collapsible, collapsed by default)   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <CollapsibleSection label="Supporting context">
        <div className="space-y-5 px-5 py-4">

          {/* Planning data */}
          {planningFields.length > 0 && (
            <div>
              <SectionHeading>Planning data</SectionHeading>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {planningFields.map(([key, value]) => (
                  <KvRow
                    key={key}
                    label={fieldDisplayLabel(key)}
                    value={formatPlanningValue(value)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Source metadata */}
          {sourceMetadataFields.length > 0 && (
            <div>
              <SectionHeading>Source metadata</SectionHeading>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {sourceMetadataFields.map(([key, value]) => (
                  <KvRow
                    key={key}
                    label={fieldDisplayLabel(key)}
                    value={formatPlanningValue(value)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Import normalization */}
          {normalizationSnapshot && (
            <div>
              <SectionHeading>Import normalization</SectionHeading>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {Object.entries(normalizationSnapshot).map(([key, value]) => (
                  <KvRow
                    key={key}
                    label={fieldDisplayLabel(key)}
                    value={formatNormalizationValue(key, value)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Template routing summary */}
          <div>
            <SectionHeading>Template route</SectionHeading>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              <KvRow label="Active route" value={templateRouting.activeRouteLabel} />
              <KvRow label="Route status" value={formatStatusLabel(templateRouting.status)} />
              {templateRouting.mappings.map((mapping) => (
                <div key={mapping.id} className="flex items-start justify-between gap-4 border-b border-slate-100 px-3 py-2 last:border-b-0">
                  <span className="text-xs text-slate-500 flex-shrink-0 w-36">{mapping.displayName}</span>
                  <span className="text-sm text-slate-900 text-right break-all">
                    {mapping.providerLabel} · {mapping.locale.toUpperCase()} · {mapping.externalTemplateId}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Import receipt */}
          <div>
            <SectionHeading>Import receipt</SectionHeading>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {latestImportReceipt ? (
                <>
                  <KvRow
                    label="Mode / status"
                    value={`${formatLabel(latestImportReceipt.mode)} / ${formatLabel(latestImportReceipt.status)}`}
                  />
                  <KvRow label="Idempotency key" value={latestImportReceipt.idempotencyKey} />
                  <KvRow
                    label="Received"
                    value={formatDateTime(latestImportReceipt.receivedAt)}
                  />
                  {latestImportReceipt.processedAt && (
                    <KvRow
                      label="Processed"
                      value={formatDateTime(latestImportReceipt.processedAt)}
                    />
                  )}
                </>
              ) : (
                <div className="py-3 px-3 text-sm text-slate-500">No import receipt linked.</div>
              )}
            </div>
          </div>

          {/* Source link trace */}
          {latestSourceLink && (
            <div>
              <SectionHeading>Source link</SectionHeading>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                <KvRow label="Worksheet" value={latestSourceLink.worksheetName} />
                <KvRow label="Row ID" value={latestSourceLink.rowId} />
                <KvRow label="Spreadsheet ID" value={latestSourceLink.spreadsheetId} />
                <KvRow
                  label="Sheet profile"
                  value={latestSourceLink.sheetProfileKey ?? "—"}
                />
                <KvRow
                  label="Profile version"
                  value={
                    latestSourceLink.sheetProfileVersion != null
                      ? String(latestSourceLink.sheetProfileVersion)
                      : "—"
                  }
                />
              </div>
            </div>
          )}

          {/* Latest linked asset */}
          <div>
            <SectionHeading>Latest asset</SectionHeading>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {latestAsset ? (
                <>
                  <KvRow label="Type" value={formatStatusLabel(latestAsset.assetType)} />
                  <KvRow label="Status" value={formatStatusLabel(latestAsset.assetStatus)} />
                  <KvRow label="Locale" value={latestAsset.locale} />
                  {latestAsset.externalUrl && (
                    <KvRow label="External URL" value={latestAsset.externalUrl} />
                  )}
                  {latestAsset.storagePath && (
                    <KvRow label="Storage path" value={latestAsset.storagePath} />
                  )}
                </>
              ) : (
                <div className="py-3 px-3 text-sm text-slate-500">
                  No asset linked yet.
                </div>
              )}
            </div>
          </div>

          {/* Content copy */}
          <div>
            <SectionHeading>Content copy</SectionHeading>
            <div className="rounded-xl border border-slate-100 px-3 py-3">
              <p className="text-sm leading-6 text-slate-900 whitespace-pre-wrap">{item.copy}</p>
            </div>
          </div>

        </div>
      </CollapsibleSection>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ZONE 4 — Audit trail (collapsible, collapsed by default)          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <CollapsibleSection
        label="Audit trail"
        badge={auditCount > 0 ? `${auditCount} events` : undefined}
      >
        <div className="divide-y divide-slate-100">
          {timelineEntries.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">No events recorded yet.</p>
          ) : (
            timelineEntries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={`mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    entry.tone === "rose"
                      ? "bg-rose-500"
                      : entry.tone === "emerald"
                        ? "bg-emerald-500"
                        : entry.tone === "amber"
                          ? "bg-amber-400"
                          : entry.tone === "sky"
                            ? "bg-sky-500"
                            : "bg-slate-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs text-slate-400">
                      {formatDateTime(entry.occurredAt)}
                    </span>
                    <span className="text-xs font-medium text-slate-500 capitalize">
                      {entry.kind.toLowerCase()}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{entry.title}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{entry.description}</p>
                  {entry.meta && (
                    <p className="mt-0.5 text-xs text-slate-400">{entry.meta}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>

    </div>
  );
}
