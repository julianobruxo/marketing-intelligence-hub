import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
} from "lucide-react";
import type { ReactNode } from "react";
import { ApprovalDecision, ApprovalStage, DesignProvider, DesignRequestStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildContentTimeline,
  buildOperationalSummary,
  getSemanticWorkflowDecision,
  buildTemplateRoutingSummary,
} from "@/modules/content-catalog/application/content-workflow-view-model";
import { getPublishedPreview } from "@/modules/content-catalog/application/content-preview";
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
  recordPostedAction,
} from "@/modules/workflow/application/workflow-actions";
import { canRecordApprovalAction } from "@/modules/workflow/domain/phase-one-workflow";
import { CollapsibleSection } from "./collapsible-section";
import { ItemHeader } from "./item-header";
import { formatOperationalLabel } from "@/shared/ui/operational-status";
import { readOperationalStatusFromPlanningSnapshot } from "@/modules/content-intake/domain/infer-content-status";

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
    publishedPostUrl: "Published post link",
    sourceAssetLink: "Source asset link",
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
    PUBLISHEDPOSTURL: "Published post link",
    SOURCEASSETLINK: "Source asset link",
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


function formatDesignProviderLabel(provider: DesignProvider | null | undefined) {
  if (!provider) {
    return "Manual";
  }

  switch (provider) {
    case "CANVA":
      return "Canva template";
    case "AI_VISUAL":
      return "Nano Banana 2";
    case "MANUAL":
      return "Manual";
    default:
      return "Manual";
  }
}

function formatStatusLabel(status: string): string {
  return formatOperationalLabel(status);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
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

function getTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractOriginalCopy(
  planningSnapshot: unknown,
  fallbackTitle: string,
  fallbackCopy: string | null,
) {
  const snapshot =
    planningSnapshot && typeof planningSnapshot === "object"
      ? (planningSnapshot as Record<string, unknown>)
      : null;
  const planning =
    snapshot?.planning && typeof snapshot.planning === "object"
      ? (snapshot.planning as Record<string, unknown>)
      : null;
  const normalization =
    snapshot?.normalization && typeof snapshot.normalization === "object"
      ? (snapshot.normalization as Record<string, unknown>)
      : null;
  const titleDerivation =
    normalization?.titleDerivation && typeof normalization.titleDerivation === "object"
      ? (normalization.titleDerivation as Record<string, unknown>)
      : null;

  const englishCopy = getTrimmedString(planning?.copyEnglish);
  const portugueseCopy = getTrimmedString(planning?.copyPortuguese);
  // Only use non-English copy when no English copy exists at all
  const isFallbackLanguage = !englishCopy && !!portugueseCopy;
  const body = englishCopy ?? portugueseCopy ?? getTrimmedString(fallbackCopy);

  const title = body
    ? getTrimmedString(titleDerivation?.title) ??
      getTrimmedString(planning?.campaignLabel) ??
      fallbackTitle
    : null;

  return { title, body, isFallbackLanguage };
}

function extractSpreadsheetName(planningSnapshot: unknown): string | null {
  if (!planningSnapshot || typeof planningSnapshot !== "object") return null;
  const snap = planningSnapshot as Record<string, unknown>;
  const source = snap.source && typeof snap.source === "object"
    ? (snap.source as Record<string, unknown>)
    : null;
  return getTrimmedString(source?.spreadsheetName);
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

function SectionHeading({ children }: { children: ReactNode }) {
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
  const operationalSummary = buildOperationalSummary(item);
  const templateRouting = buildTemplateRoutingSummary(item);

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
  const canvaSliceReady =
    canvaEligible &&
    (item.currentStatus === "CONTENT_APPROVED" || item.currentStatus === "READY_FOR_DESIGN");
  const canvaRetryReady = canvaEligible && item.currentStatus === "DESIGN_FAILED";
  const canRefreshDesign =
    latestDesignRequest &&
    (latestDesignRequest.status === DesignRequestStatus.REQUESTED ||
      latestDesignRequest.status === DesignRequestStatus.IN_PROGRESS);
  const canRecordTranslationApproval =
    item.translationRequired &&
    canRecordApprovalAction({
      currentStatus: item.currentStatus,
      stage: ApprovalStage.TRANSLATION,
    });
  const operationalStatus = readOperationalStatusFromPlanningSnapshot(item.planningSnapshot);
  const semanticDecision = getSemanticWorkflowDecision(item);
  const publishedPreview =
    semanticDecision?.baseVisualFamily === "green" ||
    operationalStatus === "PUBLISHED" ||
    item.currentStatus === "PUBLISHED_MANUALLY" ||
    item.currentStatus === "POSTED"
      ? getPublishedPreview({ planningSnapshot: item.planningSnapshot, assets: item.assets })
      : null;

  // Determine primary action type for the prominent card
  type PrimaryActionKind =
    | "design_start"
    | "design_refresh"
    | "design_retry"
    | "design_approve"
    | "translation_approve"
    | "final_review"
    | "post_on_li"
    | "review"
    | "waiting";

  let primaryActionKind: PrimaryActionKind = "waiting";
  if (operationalStatus === "WAITING_FOR_COPY") {
    primaryActionKind = "waiting";
  } else if (canvaSliceReady) primaryActionKind = "design_start";
  else if (canRefreshDesign) primaryActionKind = "design_refresh";
  else if (canvaRetryReady) primaryActionKind = "design_retry";
  else if (item.currentStatus === "DESIGN_READY") primaryActionKind = "design_approve";
  else if (item.currentStatus === "READY_FOR_FINAL_REVIEW") primaryActionKind = "final_review";
  else if (
    item.currentStatus === "READY_TO_POST" ||
    item.currentStatus === "READY_TO_PUBLISH"
  ) primaryActionKind = "post_on_li";
  else if (canRecordTranslationApproval) primaryActionKind = "translation_approve";
  else if (
    item.currentStatus === "IMPORTED" ||
    item.currentStatus === "IN_REVIEW" ||
    item.currentStatus === "WAITING_FOR_COPY" ||
    item.currentStatus === "CHANGES_REQUESTED"
  ) primaryActionKind = "review";
  const showContinueProcessPrimary = primaryActionKind === "review";

  const primaryActionLabel: Record<PrimaryActionKind, string> = {
    design_start: "Generate Design",
    design_refresh: "Sync Design",
    design_retry: "Retry Design",
    design_approve: "Approve Design",
    translation_approve: "Review Translation",
    final_review: "Final Review",
    post_on_li: "Post to LinkedIn",
    review: "Continue Process",
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

  const contentDeadlineRaw = planningSnapshotRaw?.contentDeadline;
  const contentDeadlineDisplay =
    contentDeadlineRaw && typeof contentDeadlineRaw === "string" && contentDeadlineRaw.trim()
      ? contentDeadlineRaw
      : null;
  const originalCopy = extractOriginalCopy(
    item.planningSnapshot,
    item.title,
    typeof item.copy === "string" ? item.copy : null,
  );

  const sourceSpreadsheetName = extractSpreadsheetName(item.planningSnapshot);

  const dateCreatedStr = item.createdAt.toISOString();

  // Find the date this item was marked as posted/published
  const postedEvent = item.statusEvents.find(
    (e) => e.toStatus === "POSTED" || e.toStatus === "PUBLISHED_MANUALLY",
  );
  const datePostedStr = postedEvent ? postedEvent.createdAt.toISOString() : null;

  const isDesignDone =
    !!latestAsset ||
    item.currentStatus === "DESIGN_READY" ||
    item.currentStatus === "READY_FOR_FINAL_REVIEW" ||
    item.currentStatus === "READY_TO_POST" ||
    item.currentStatus === "READY_TO_PUBLISH" ||
    item.currentStatus === "POSTED" ||
    item.currentStatus === "PUBLISHED_MANUALLY";

  const updatedAtStr = (item.latestImportAt ?? item.updatedAt).toISOString();

  return (
    <div className="mx-auto max-w-4xl space-y-4 animate-fade-in-up">

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ZONE 1 — Item header (compact + expandable)                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <ItemHeader
        title={item.title}
        profile={item.profile}
        currentStatus={item.currentStatus}
        operationalStatus={operationalStatus}
        contentDeadline={contentDeadlineDisplay}
        plannedDate={plannedDateDisplay}
        primaryActionKind={primaryActionKind}
        updatedAt={updatedAtStr}
        sourceWorksheetName={latestSourceLink?.worksheetName ?? null}
        sourceSpreadsheetName={sourceSpreadsheetName}
        dateCreated={dateCreatedStr}
        datePosted={datePostedStr}
        isDesignDone={isDesignDone}
        templateRouteLabel={templateRouting.activeRouteLabel ?? null}
        translationRequired={item.translationRequired}
        translationStatus={item.translationStatus}
        preferredDesignProvider={item.preferredDesignProvider ?? "MANUAL"}
        contentType={item.contentType}
        originalCopyTitle={originalCopy.title}
        originalCopyBody={originalCopy.body}
        copyIsFallbackLanguage={originalCopy.isFallbackLanguage}
        semanticDecision={semanticDecision}
      />

      {publishedPreview ? (
        <section className="app-surface-panel rounded-xl px-5 py-4 dark:border-[rgba(88,108,186,0.3)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-[rgba(88,108,186,0.32)] dark:bg-[rgba(23,31,58,0.78)]">
              <img
                src={publishedPreview.previewUrl}
                alt={`${item.title} preview`}
                className="h-40 w-full object-cover sm:h-28 sm:w-40"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[#8B97B7]">
                Published preview
              </p>
              <p className="mt-2 text-sm text-slate-700 dark:text-[#CFD8F7]">
                A stored visual reference is available for this published item, so the team does not need to go back to the spreadsheet for context.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={publishedPreview.referenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-[rgba(88,108,186,0.3)] dark:text-[#CFD8F7] dark:hover:border-[rgba(122,138,218,0.45)] dark:hover:bg-[rgba(26,34,65,0.82)]"
                >
                  Open reference
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ZONE 2 — Action zone                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* 2A — Primary action card */}
      {primaryActionKind === "waiting" ? (
        <section
          className="app-surface-panel rounded-xl px-5 py-4 dark:border-[rgba(88,108,186,0.3)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]"
          style={{ borderLeft: '4px solid #0A66C2' }}
        >
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: '#0A66C2' }} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#0A66C2' }}>
                {operationalStatus === "WAITING_FOR_COPY" ? "Blocked: Awaiting Copy" : "Waiting"}
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {operationalStatus === "WAITING_FOR_COPY" ? "Waiting for copy" : operationalSummary.waitingOn}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-[#8FA1C5]">{operationalSummary.nextStep}</p>
            </div>
          </div>
        </section>
      ) : (
        <section
          className="app-surface-panel rounded-xl border-l-4 px-5 py-5 dark:border-[rgba(88,108,186,0.3)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]"
          style={{ borderLeftColor: '#E11D48' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#E11D48' }}>
            Primary action
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {showContinueProcessPrimary ? "Continue Process" : primaryActionLabel[primaryActionKind]}
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
                  style={{ backgroundColor: '#E11D48', color: 'white' }}
                >
                  Generate Design
                </Button>
              </form>
            )}

            {primaryActionKind === "design_refresh" && (
              <form action={syncCanvaDesignRequestAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <Button
                  type="submit"
                  className="transition-default"
                  style={{ backgroundColor: '#E11D48', color: 'white' }}
                >
                  Sync Design
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
                  style={{ backgroundColor: '#E11D48', color: 'white' }}
                >
                  Retry Design
                </Button>
              </form>
            )}

            {primaryActionKind === "design_approve" && (
              <form action={approveDesignReadyAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <Button
                  type="submit"
                  className="transition-default"
                  style={{ backgroundColor: '#E11D48', color: 'white' }}
                >
                  Approve Design
                </Button>
              </form>
            )}

            {primaryActionKind === "final_review" && (
              <>
                <form action={recordApprovalAction}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <input type="hidden" name="stage" value={ApprovalStage.PUBLISH} />
                  <input type="hidden" name="decision" value="APPROVED" />
                  <Button type="submit" className="transition-default" style={{ backgroundColor: '#E11D48', color: 'white' }}>
                    Final Review
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

            {primaryActionKind === "post_on_li" && (
              <form action={recordPostedAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <Button
                  type="submit"
                  className="transition-default font-semibold"
                  style={{ backgroundColor: '#0A66C2', color: 'white' }}
                >
                  Post to LinkedIn
                </Button>
              </form>
            )}

            {primaryActionKind === "translation_approve" && (
              <>
                <form action={recordApprovalAction}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <input type="hidden" name="stage" value={ApprovalStage.TRANSLATION} />
                  <input type="hidden" name="decision" value="APPROVED" />
                  <Button type="submit" className="transition-default" style={{ backgroundColor: '#E11D48', color: 'white' }}>
                    Review Translation
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

            {showContinueProcessPrimary && (
              <Button asChild className="transition-default" style={{ backgroundColor: '#E11D48', color: 'white' }}>
                <Link href="#secondary-actions">Continue Process</Link>
              </Button>
            )}
          </div>
        </section>
      )}

      {/* 2B — Blocker / waiting signal */}
      {operationalSummary.blocker ? (
        <div
          className="app-surface-panel flex items-start gap-3 rounded-xl border-l-4 px-4 py-3.5 dark:border-[rgba(88,108,186,0.3)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]"
          style={{ borderLeftColor: '#F59E0B', borderColor: '#FDE68A' }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: '#D97706' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#92400E' }}>Blocked</p>
            <p className="mt-0.5 text-sm" style={{ color: '#78350F' }}>{operationalSummary.blocker}</p>
          </div>
        </div>
      ) : null}

      {/* 2C — Secondary actions */}
      {!operationalSummary.blocker && operationalStatus === "LATE" ? (
        <div
          className="app-surface-panel flex items-start gap-3 rounded-xl border-l-4 px-4 py-3.5 dark:border-[rgba(88,108,186,0.3)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]"
          style={{ borderLeftColor: '#E11D48', borderColor: '#FDA4AF' }}
        >
          <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: '#E11D48' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#9F1239' }}>Overdue</p>
            <p className="mt-0.5 text-sm" style={{ color: '#881337' }}>
              The deadline passed, but this item can still continue through the workflow.
            </p>
          </div>
        </div>
      ) : null}

      <section
        id="secondary-actions"
        className="app-surface-panel space-y-4 rounded-xl px-5 py-4 dark:border-[rgba(88,108,186,0.3)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]"
        style={{ animationDelay: '100ms' }}
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[#8B97B7]">
            Add a note or revision
          </p>
          <form action={addWorkflowNoteAction} className="mt-3 space-y-3">
            <input type="hidden" name="contentItemId" value={item.id} />
            <div className="flex gap-3">
              <select
                name="type"
                defaultValue="COMMENT"
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100"
              >
                <option value="COMMENT">Comment</option>
                <option value="REVISION">Revision</option>
              </select>
            </div>
            <Textarea
              name="body"
              placeholder="Add a comment or revision note tied to this content item."
              className="min-h-24 bg-white dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100"
            />
            <Button type="submit" variant="outline" className="border-slate-200 transition-default hover:bg-slate-50 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100 dark:hover:bg-[rgba(29,37,68,0.95)]" style={{ color: '#0F172A' }}>
              Add note
            </Button>
          </form>
        </div>

        {/* Approval forms — secondary, shown only when available and not already primary */}
        {canRecordTranslationApproval && primaryActionKind !== "translation_approve" && (
          <div className="border-t border-slate-100 pt-4 dark:border-[rgba(88,108,186,0.24)]">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[#8B97B7]">
              Review Translation
            </p>
            <form action={recordApprovalAction} className="mt-3 space-y-3">
              <input type="hidden" name="contentItemId" value={item.id} />
              <input type="hidden" name="stage" value={ApprovalStage.TRANSLATION} />
              <input type="hidden" name="decision" value="APPROVED" />
              <Textarea
                name="note"
                placeholder="Optional translation review note."
                className="min-h-20 bg-white dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="bg-slate-950 text-white hover:bg-slate-800 dark:bg-indigo-500/85 dark:hover:bg-indigo-500">
                  Review Translation
                </Button>
                <Button
                  formAction={recordApprovalActionWithDecision.bind(null, ApprovalDecision.CHANGES_REQUESTED)}
                  type="submit"
                  variant="outline"
                  className="border-slate-300 text-slate-900 hover:bg-slate-50 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100 dark:hover:bg-[rgba(29,37,68,0.95)]"
                >
                  Request changes
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Recent notes inline */}
        {item.notes.length > 0 && (
          <div className="border-t border-slate-100 pt-4 space-y-2.5 dark:border-[rgba(88,108,186,0.24)]">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[#8B97B7]">
              Recent notes
            </p>
            {item.notes.slice(0, 3).map((note) => (
              <div
                key={note.id}
                className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 dark:border-[rgba(88,108,186,0.24)] dark:bg-[rgba(22,30,58,0.68)]"
              >
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-[#8B97B7]">
                  <span className="capitalize">{formatLabel(note.type)}</span>
                  <span>·</span>
                  <span>{note.author.name ?? note.author.email}</span>
                  <span>·</span>
                  <span>{formatDateTime(note.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm leading-5 text-slate-800 dark:text-[#D7DEFA]">{note.body}</p>
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

          <div>
            <SectionHeading>Generated translation</SectionHeading>
            <div className="rounded-xl border border-slate-100 px-3 py-3">
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <KvRow
                  label="Translation status"
                  value={formatStatusLabel(item.translationStatus)}
                />
                <KvRow
                  label="Translation required"
                  value={item.translationRequired ? "Yes" : "No"}
                />
                <KvRow
                  label="Requested at"
                  value={
                    item.translationRequestedAt ? formatDateTime(item.translationRequestedAt) : "—"
                  }
                />
                <KvRow
                  label="Generated at"
                  value={
                    item.translationGeneratedAt ? formatDateTime(item.translationGeneratedAt) : "—"
                  }
                />
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-900">
                {item.translationCopy && item.translationCopy.trim().length > 0
                  ? item.translationCopy
                  : "Translation has not been generated yet."}
              </p>
            </div>
          </div>

          <div>
            <SectionHeading>Workflow preferences</SectionHeading>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              <KvRow
                label="Visual generation mode"
                value={formatDesignProviderLabel(item.preferredDesignProvider)}
              />
              <KvRow
                label="LinkedIn autopost"
                value={item.autopostEnabled ? "Enabled" : "Manual fallback"}
              />
              <KvRow
                label="Source spreadsheet"
                value={latestSourceLink ? latestSourceLink.spreadsheetId : "—"}
              />
              <KvRow
                label="Source worksheet"
                value={latestSourceLink ? latestSourceLink.worksheetName : "—"}
              />
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
