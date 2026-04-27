import {
  AlertTriangle,
  Clock,
  ExternalLink,
} from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ApprovalDecision, ApprovalStage, DesignProvider, DesignRequestStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CANVA_PROVIDER_MODE, GPT_IMAGE_PROVIDER_MODE, NB_PROVIDER_MODE } from "@/shared/config/env";
import {
  buildContentTimeline,
  buildOperationalSummary,
  buildDesignEligibilityView,
  getSemanticWorkflowDecision,
  buildTemplateRoutingSummary,
} from "@/modules/content-catalog/application/content-workflow-view-model";
import { getPublishedPreview } from "@/modules/content-catalog/application/content-preview";
import { getContentItemDetail } from "@/modules/content-catalog/application/content-queries";
import {
  approveDesignReadyAction,
} from "@/modules/design-orchestration/application/run-canva-design-request";
import { syncDesignRequestAction } from "@/modules/design-orchestration/application/run-design-initiation";
import { resetDesignStateAction } from "@/modules/design-orchestration/application/reset-design-state";
import { isSliceOneCanvaEligible } from "@/modules/design-orchestration/domain/canva-slice";
import { DesignInitiationButton } from "./design-initiation-button";
import { StartDesignButton } from "./start-design-button";
import { ChangeVideoButton } from "./change-video-button";
import {
  NanaBananaVariationChooser,
} from "./nano-banana-variation-chooser";
import { RejectDesignPanel } from "./reject-design-panel";
import {
  extractNanaBananaVariations,
  extractSelectedVariationId,
} from "./nano-banana-variation-utils";
import type { AvailableTemplateMapping } from "./design-provider-modal";
import {
  addWorkflowNoteAction,
  advanceToReadyForDesignAction,
  recordApprovalAction,
  recordApprovalActionWithDecision,
} from "@/modules/workflow/application/workflow-actions";
import {
  approveTranslationLanguageAction,
  requestTranslationAction,
  selectPublishLanguageAndProceedAction,
  skipTranslationAction,
  submitTranslationCopyAction,
} from "@/modules/workflow/application/translation-actions";
import { canRecordApprovalAction } from "@/modules/workflow/domain/phase-one-workflow";
import { CollapsibleSection } from "./collapsible-section";
import { ItemHeader } from "./item-header";
import { formatOperationalLabel } from "@/shared/ui/operational-status";
import { readOperationalStatusFromPlanningSnapshot } from "@/modules/content-intake/domain/infer-content-status";
import { getDesignSyncState } from "@/modules/design-orchestration/domain/design-sync-state";

export const maxDuration = 180;

// ─── Label helpers ────────────────────────────────────────────────────────────

/**
 * Maps raw camelCase or snake_case field names from planningSnapshot
 * to human-readable Title Case labels.
 */
function fieldDisplayLabel(rawKey: string): string {
  const MAP: Record<string, string> = {
    copyEnglish: "LinkedIn Copy",
    plannedDate: "Date",
    campaignLabel: "Title",
    contentDeadline: "Content deadline",
    publishedFlag: "Published",
    sourceAssetLink: "IMG LINK",
    // snake_case variants (in case they appear)
    COPYENGLISH: "LinkedIn Copy",
    PLANNEDDATE: "Date",
    CAMPAIGNLABEL: "Title",
    CONTENTDEADLINE: "Content deadline",
    PUBLISHEDFLAG: "Published",
    SOURCEASSETLINK: "IMG LINK",
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
    case "GPT_IMAGE":
      return "GPT Image 2";
    case "AI_VISUAL":
      return "Nano Banana 2";
    case "MANUAL":
      return "Manual";
    default:
      return "Manual";
  }
}

function formatContentAuthorLabel(profile: string) {
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

function formatStatusLabel(status: string): string {
  return formatOperationalLabel(status);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

const OPERATIONAL_PLANNING_FIELDS = [
  "plannedDate",
  "campaignLabel",
  "copyEnglish",
  "sourceAssetLink",
  "contentDeadline",
] as const;

const OPERATIONAL_SOURCE_METADATA_FIELDS = [
  "publishedFlag",
] as const;

// ─── Planning snapshot helpers ────────────────────────────────────────────────

function getPlanningFieldEntries(planningSnapshot: unknown) {
  if (!planningSnapshot || typeof planningSnapshot !== "object") return [];
  const snapshot = planningSnapshot as Record<string, unknown>;
  const planning = snapshot.planning;
  if (!planning || typeof planning !== "object") return [];
  const planningRecord = planning as Record<string, unknown>;
  return OPERATIONAL_PLANNING_FIELDS.flatMap((field) => {
    const value = planningRecord[field];
    if (typeof value === "string") {
      return value.trim().length > 0 ? [[field, value] as [string, unknown]] : [];
    }
    return value !== null && value !== undefined ? [[field, value] as [string, unknown]] : [];
  });
}

function getSourceMetadataEntries(planningSnapshot: unknown) {
  if (!planningSnapshot || typeof planningSnapshot !== "object") return [];
  const snapshot = planningSnapshot as Record<string, unknown>;
  const sourceMetadata = snapshot.sourceMetadata;
  if (!sourceMetadata || typeof sourceMetadata !== "object") return [];
  const sourceMetadataRecord = sourceMetadata as Record<string, unknown>;
  return OPERATIONAL_SOURCE_METADATA_FIELDS.flatMap((field) => {
    const value = sourceMetadataRecord[field];
    if (typeof value === "string") {
      return value.trim().length > 0 ? [[field, value] as [string, unknown]] : [];
    }
    return value !== null && value !== undefined ? [[field, value] as [string, unknown]] : [];
  });
}

function getTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBlockReasonFromSnapshot(planningSnapshot: unknown): string | null {
  if (!planningSnapshot || typeof planningSnapshot !== "object") return null;
  const snapshot = planningSnapshot as Record<string, unknown>;
  const workflow =
    snapshot.workflow && typeof snapshot.workflow === "object"
      ? (snapshot.workflow as Record<string, unknown>)
      : null;
  return typeof workflow?.blockReason === "string" ? workflow.blockReason : null;
}

function extractOriginalCopy(planningSnapshot: unknown) {
  const snapshot =
    planningSnapshot && typeof planningSnapshot === "object"
      ? (planningSnapshot as Record<string, unknown>)
      : null;
  const planning =
    snapshot?.planning && typeof snapshot.planning === "object"
      ? (snapshot.planning as Record<string, unknown>)
      : null;
  const englishCopy = getTrimmedString(planning?.copyEnglish);
  return { body: englishCopy };
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
  const timelineEntries = buildContentTimeline(item);
  const operationalSummary = buildOperationalSummary(item);
  const designEligibility = buildDesignEligibilityView(item);
  const templateRouting = buildTemplateRoutingSummary(item);

  // Derived data
  const latestDesignRequest = item.designRequests[0];
  // Exclude VIDEO assets — they are a reference URL, not a design output.
  const latestAsset = item.assets.filter((a) => (a.assetType as string) !== "VIDEO").at(-1);
  const existingVideoUrl =
    item.assets.find((a) => (a.assetType as string) === "VIDEO" && !a.deletedAt)?.externalUrl ??
    null;
  const latestSourceLink = item.sourceLinks[0];
  const latestImportReceipt = item.importReceipts[0];
  const designSyncState = getDesignSyncState(latestDesignRequest?.resultPayload);

  // Design initiation modal data
  const availableMappings: AvailableTemplateMapping[] = item.activeTemplateMappings.map((m) => ({
    id: m.id,
    externalTemplateId: m.externalTemplateId,
    displayName: m.displayName,
    designProvider: m.designProvider as "CANVA" | "GPT_IMAGE" | "AI_VISUAL" | "MANUAL",
  }));

  // Last attempt config — pre-populates modal on retry
  const lastRequestPayload =
    latestDesignRequest?.requestPayload && typeof latestDesignRequest.requestPayload === "object"
      ? (latestDesignRequest.requestPayload as Record<string, unknown>)
      : null;
  const lastTemplateId =
    typeof lastRequestPayload?.templateId === "string" ? lastRequestPayload.templateId : null;
  const lastNbPrompt = (() => {
    const providerPayload = lastRequestPayload?.gptImage ?? lastRequestPayload?.nanoBanana;
    if (!providerPayload || typeof providerPayload !== "object") return null;
    const providerData = providerPayload as Record<string, unknown>;
    return typeof providerData.customPrompt === "string" ? providerData.customPrompt : null;
  })();
  const lastPresetId = (() => {
    const providerPayload = lastRequestPayload?.gptImage ?? lastRequestPayload?.nanoBanana;
    if (!providerPayload || typeof providerPayload !== "object") return null;
    const providerData = providerPayload as Record<string, unknown>;
    return typeof providerData.presetId === "string" ? providerData.presetId : null;
  })();
  const lastProvider =
    latestDesignRequest?.designProvider === DesignProvider.GPT_IMAGE
      ? ("GPT_IMAGE" as const)
      : latestDesignRequest?.designProvider === DesignProvider.AI_VISUAL
      ? ("AI_VISUAL" as const)
      : latestDesignRequest?.designProvider === DesignProvider.CANVA
        ? ("CANVA" as const)
        : null;
  const isDesignRejected =
    item.currentStatus === "CHANGES_REQUESTED" &&
    latestDesignRequest?.status === DesignRequestStatus.REJECTED;

  // True when the item's visual asset is a video reference (not a generated image).
  const hasVideoAsset = existingVideoUrl !== null;

  // AI visual variations (shown in DESIGN_READY state for GPT Image or Nano Banana requests).
  // Excluded for video items — the video reference is the asset, no variation chooser needed.
  const isAiVisualReadyResult =
    item.currentStatus === "DESIGN_READY" &&
    !hasVideoAsset &&
    (latestDesignRequest?.designProvider === DesignProvider.GPT_IMAGE ||
      latestDesignRequest?.designProvider === DesignProvider.AI_VISUAL);
  const nbVariations = isAiVisualReadyResult
    ? extractNanaBananaVariations(latestDesignRequest?.resultPayload)
    : [];
  const nbSelectedVariationId = isAiVisualReadyResult
    ? extractSelectedVariationId(item.assets[item.assets.length - 1]?.metadata) ??
      extractSelectedVariationId(latestDesignRequest?.resultPayload)
    : null;
  const blocksAiVisualApproval = isAiVisualReadyResult && !nbSelectedVariationId;
  const selectedDesignVariationId =
    extractSelectedVariationId(latestAsset?.metadata) ??
    extractSelectedVariationId(latestDesignRequest?.resultPayload);
  const isAiDesignProvider =
    latestDesignRequest?.designProvider === DesignProvider.GPT_IMAGE ||
    latestDesignRequest?.designProvider === DesignProvider.AI_VISUAL;
  const hasSelectedDesignAsset = latestAsset
    ? isAiDesignProvider
      ? Boolean(selectedDesignVariationId)
      : Boolean(latestAsset.externalUrl || latestAsset.storagePath)
    : false;
  // Don't offer reset for video-approved items — the video reference is the asset.
  const canResetApprovedDesign =
    item.currentStatus === "DESIGN_APPROVED" && !hasSelectedDesignAsset && !hasVideoAsset;

  // Action availability
  const canvaEligible = isSliceOneCanvaEligible({
    profile: item.profile,
    contentType: item.contentType,
    sourceLocale: item.sourceLocale,
  });
  const canvaSliceReady =
    canvaEligible &&
    (item.currentStatus === "CONTENT_APPROVED" || item.currentStatus === "READY_FOR_DESIGN");
  const canvaRetryReady =
    canvaEligible &&
    designEligibility.canRetry &&
    (item.currentStatus === "DESIGN_FAILED" || isDesignRejected);
  const hasActiveDesignRequest =
    latestDesignRequest &&
    (latestDesignRequest.status === DesignRequestStatus.REQUESTED ||
      latestDesignRequest.status === DesignRequestStatus.IN_PROGRESS);
  const canRefreshDesign =
    hasActiveDesignRequest && Boolean(latestDesignRequest.externalRequestId);
  const canResetDesign =
    (item.currentStatus === "IN_DESIGN" && !canRefreshDesign) || canResetApprovedDesign;
  const canRecordTranslationApproval =
    item.translationRequired &&
    canRecordApprovalAction({
      currentStatus: item.currentStatus,
      stage: ApprovalStage.TRANSLATION,
    });
  const operationalStatus = readOperationalStatusFromPlanningSnapshot(item.planningSnapshot);
  const operationalBlockReason = readBlockReasonFromSnapshot(item.planningSnapshot);
  const semanticDecision = getSemanticWorkflowDecision(item);
  const publishedPreview =
    semanticDecision?.baseVisualFamily === "green" ||
    operationalStatus === "POSTED" ||
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
  if (operationalStatus === "BLOCKED" || operationalStatus === "WAITING_FOR_COPY") {
    primaryActionKind = "waiting";
  } else if (canvaSliceReady) primaryActionKind = "design_start";
  else if (canRefreshDesign) primaryActionKind = "design_refresh";
  // DESIGN_READY must be checked before the operationalStatus snapshot override below.
  // The snapshot's operationalStatus stays "READY_FOR_DESIGN" after design completes because
  // it is only updated on reimport — checking it first would shadow the correct approve path.
  else if (item.currentStatus === "DESIGN_READY") primaryActionKind = "design_approve";
  else if (
    (item.currentStatus === "READY_FOR_DESIGN" || operationalStatus === "READY_FOR_DESIGN") &&
    item.currentStatus !== "IN_DESIGN" &&
    item.currentStatus !== "DESIGN_APPROVED" &&
    item.currentStatus !== "READY_FOR_FINAL_REVIEW" &&
    item.currentStatus !== "READY_TO_POST" &&
    item.currentStatus !== "READY_TO_PUBLISH" &&
    item.currentStatus !== "POSTED" &&
    item.currentStatus !== "PUBLISHED_MANUALLY"
  ) primaryActionKind = "design_start";
  else if (canvaRetryReady) primaryActionKind = "design_retry";
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
    design_start: "Start Design",
    design_refresh: "Sync Design",
    design_retry: "Retry Design",
    design_approve: hasVideoAsset ? "Review Video Asset" : "Approve Design",
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

  const originalCopy = extractOriginalCopy(item.planningSnapshot);

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
    <div className="mx-auto max-w-4xl space-y-4 animate-fade-in-up" data-testid="item-detail">

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ZONE 1 — Item header (compact + expandable)                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <ItemHeader
        title={item.title}
        profile={item.profile}
        currentStatus={item.currentStatus}
        operationalStatus={operationalStatus}
        operationalBlockReason={operationalBlockReason}
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
        originalCopyBody={originalCopy.body}
        semanticDecision={semanticDecision}
      />

      {publishedPreview ? (
        <section className="app-surface-panel rounded-xl px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-[rgba(88,108,186,0.32)] dark:bg-[rgba(23,31,58,0.78)]">
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- Published previews can be dynamic or data URLs, so next/image is not appropriate here. */}
                <img
                  src={publishedPreview.previewUrl}
                  alt={`${item.title} preview`}
                  className="h-40 w-full object-cover sm:h-28 sm:w-40"
                />
              </>
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
          className="app-surface-panel rounded-xl px-5 py-4"
          style={{ borderLeft: '4px solid #0A66C2' }}
        >
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: '#0A66C2' }} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#0A66C2' }}>
                {operationalStatus === "BLOCKED" || operationalStatus === "WAITING_FOR_COPY" ? "Blocked" : "Waiting"}
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {operationalStatus === "BLOCKED" || operationalStatus === "WAITING_FOR_COPY" ? "Required source fields missing" : operationalSummary.waitingOn}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-[#8FA1C5]">
                {operationalStatus === "BLOCKED" && operationalBlockReason === "MISSING_COPY"
                  ? "This item doesn't have a valid copy. It will remain BLOCKED until a valid copy is added to the right Column"
                  : operationalSummary.nextStep}
              </p>
              {canResetDesign ? (
                <form action={resetDesignStateAction} className="mt-3">
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <Button
                    type="submit"
                    variant="link"
                    className="h-auto p-0 text-sm text-muted-foreground underline"
                    data-testid="reset-design-button"
                  >
                    Reset and try again
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section
          className="app-surface-panel rounded-xl border-l-4 px-5 py-5"
          style={{ borderLeftColor: '#E11D48' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#E11D48' }}>
            Primary action
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {showContinueProcessPrimary ? "Continue Process" : primaryActionLabel[primaryActionKind]}
          </h2>
          <p className="mt-1.5 text-sm leading-6" style={{ color: '#64748B' }}>
            {primaryActionKind === "design_start"
              ? "Choose whether this post should use an image design or an uploaded video asset."
              : primaryActionKind === "design_approve" && hasVideoAsset
                ? "Review the video reference and confirm it as the visual asset for this post."
                : operationalSummary.nextStep}
          </p>

          {primaryActionKind === "design_approve" && isAiVisualReadyResult && nbVariations.length > 0 && (
            <div className="mt-4">
              <NanaBananaVariationChooser
                contentItemId={item.id}
                variations={nbVariations}
                selectedVariationId={nbSelectedVariationId}
              />
            </div>
          )}

          {/* Primary action button(s) */}
          <div className="mt-4 flex flex-wrap gap-2">
            {primaryActionKind === "design_start" && (
              <StartDesignButton
                contentItemId={item.id}
                title={item.title}
                author={formatContentAuthorLabel(item.profile)}
                copy={item.copy ?? ""}
                availableMappings={availableMappings}
                existingVideoUrl={existingVideoUrl}
                canvaProviderMode={CANVA_PROVIDER_MODE}
                gptImageProviderMode={GPT_IMAGE_PROVIDER_MODE}
                nbProviderMode={NB_PROVIDER_MODE}
              />
            )}

            {primaryActionKind === "design_refresh" && (
              <div className="space-y-2">
                <form action={syncDesignRequestAction}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <Button
                    type="submit"
                    className="transition-default"
                    data-testid="sync-design-button"
                    style={{ backgroundColor: '#E11D48', color: 'white' }}
                  >
                    Sync Design
                  </Button>
                </form>
                {item.currentStatus === "IN_DESIGN" && designSyncState.failureCount > 0 && (
                  <p
                    className="text-xs font-medium text-amber-700 dark:text-amber-300"
                    data-testid="sync-failure-counter"
                  >
                    Sync attempt {Math.min(designSyncState.failureCount + 1, designSyncState.maxSyncFailures)} of{" "}
                    {designSyncState.maxSyncFailures} — still in progress
                  </p>
                )}
              </div>
            )}

            {primaryActionKind === "design_retry" && (
              <DesignInitiationButton
                contentItemId={item.id}
                title={item.title}
                author={formatContentAuthorLabel(item.profile)}
                copy={item.copy ?? ""}
                availableMappings={availableMappings}
                mode="retry"
                label="Retry Design"
                lastProvider={lastProvider}
                lastTemplateId={lastTemplateId}
                lastPresetId={lastPresetId}
                lastPrompt={lastNbPrompt}
                canvaProviderMode={CANVA_PROVIDER_MODE}
                gptImageProviderMode={GPT_IMAGE_PROVIDER_MODE}
                nbProviderMode={NB_PROVIDER_MODE}
                disabled={!designEligibility.canRetry}
              />
            )}

            {item.currentStatus === "DESIGN_FAILED" && designSyncState.retryable === false && (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-[rgba(245,158,11,0.25)] dark:bg-[rgba(92,56,8,0.18)] dark:text-amber-100"
                data-testid="design-terminal-error-message"
              >
                <p className="font-semibold">Terminal error - cannot retry automatically.</p>
                <p className="mt-1">
                  {latestDesignRequest?.errorMessage ?? latestDesignRequest?.errorCode ?? "The provider returned a non-retryable failure."}
                </p>
              </div>
            )}

            {item.currentStatus === "DESIGN_FAILED" && !designEligibility.canRetry && (
              <div
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-[rgba(244,63,94,0.25)] dark:bg-[rgba(127,29,29,0.2)] dark:text-rose-200"
                data-testid="retry-exhausted-message"
              >
                <p className="font-semibold">{designEligibility.headline}</p>
                <p className="mt-1">{designEligibility.summary}</p>
                {designEligibility.reasons.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                    {designEligibility.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}

            {primaryActionKind === "design_approve" && hasVideoAsset && (
              <div className="mt-4 space-y-3">
                {/* Video reference summary */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-2 dark:border-[rgba(255,255,255,0.08)] dark:bg-[rgba(255,255,255,0.03)]">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-[#8B97B7]">
                    Current video reference
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 break-all">
                    {existingVideoUrl}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={existingVideoUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                    >
                      Open video
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-[rgba(63,177,135,0.3)] dark:bg-[rgba(16,48,34,0.5)] dark:text-emerald-300">
                      Confirmed @zazmic.com only
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={approveDesignReadyAction}>
                    <input type="hidden" name="contentItemId" value={item.id} />
                    <Button
                      type="submit"
                      className="transition-default"
                      data-testid="approve-design-button"
                      style={{ backgroundColor: '#E11D48', color: 'white' }}
                    >
                      Approve video
                    </Button>
                  </form>
                  <ChangeVideoButton contentItemId={item.id} existingVideoUrl={existingVideoUrl} />
                </div>
              </div>
            )}

            {primaryActionKind === "design_approve" && !hasVideoAsset && (
              <div className="space-y-3">
                <form action={approveDesignReadyAction}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <Button
                    type="submit"
                    className="transition-default"
                    disabled={blocksAiVisualApproval}
                    data-testid="approve-design-button"
                    style={{ backgroundColor: '#E11D48', color: 'white' }}
                  >
                    Approve Design
                  </Button>
                </form>
                {blocksAiVisualApproval ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select a generated variation before approving this design.
                  </p>
                ) : null}
                <RejectDesignPanel contentItemId={item.id} currentStatus={item.currentStatus} />
              </div>
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
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/queue/${item.id}/linkedin-preview`}
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-default"
                  data-testid="post-to-linkedin-button"
                  style={{ backgroundColor: '#0A66C2' }}
                >
                  Post to LinkedIn
                </Link>
                <span className="inline-flex items-center rounded-full border border-amber-200/95 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-[rgba(191,141,57,0.48)] dark:bg-[rgba(62,42,8,0.8)] dark:text-[#F1CC88]">
                  Mock mode
                </span>
              </div>
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
              <form action={advanceToReadyForDesignAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <Button
                  type="submit"
                  className="transition-default"
                  data-testid="continue-process-button"
                  style={{ backgroundColor: '#E11D48', color: 'white' }}
                >
                  Continue Process
                </Button>
              </form>
            )}
          </div>
        </section>
      )}

      {/* ── Translation Setup — visible only at DESIGN_APPROVED ── */}
      {item.currentStatus === "DESIGN_APPROVED" && (
        <section
          className="app-surface-panel rounded-xl px-5 py-4"
          style={{ borderLeft: "4px solid #8B5CF6" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#8B5CF6" }}>
            Translation
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Does this content need translation before publishing?
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#8FA1C5]">
            Design has been approved. Choose a language to translate, or skip directly to final review with English.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={requestTranslationAction}>
              <input type="hidden" name="contentItemId" value={item.id} />
              <input type="hidden" name="language" value="PT_BR" />
              <Button type="submit" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-900/20">
                Request PT-BR
              </Button>
            </form>
            <form action={requestTranslationAction}>
              <input type="hidden" name="contentItemId" value={item.id} />
              <input type="hidden" name="language" value="FR" />
              <Button type="submit" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-900/20">
                Request French
              </Button>
            </form>
            <form action={skipTranslationAction}>
              <input type="hidden" name="contentItemId" value={item.id} />
              <Button type="submit" variant="outline" className="border-slate-300 bg-white hover:bg-slate-50 transition-default dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100" style={{ color: "#0F172A" }}>
                English only — skip translation
              </Button>
            </form>
          </div>
        </section>
      )}

      {/* ── Translation Workflow — TRANSLATION_REQUESTED / TRANSLATION_READY ── */}
      {(item.currentStatus === "TRANSLATION_REQUESTED" ||
        item.currentStatus === "TRANSLATION_READY") && (() => {
        const isPtBrActive = item.translationPtBrStatus === "REQUESTED" || item.translationPtBrStatus === "READY_FOR_APPROVAL";
        const isFrActive = item.translationFrStatus === "REQUESTED" || item.translationFrStatus === "READY_FOR_APPROVAL";
        const activeLang = isPtBrActive ? "PT_BR" : isFrActive ? "FR" : null;
        const activeLangLabel = activeLang === "PT_BR" ? "PT-BR" : "French";
        const existingCopy = activeLang === "PT_BR" ? item.translationPtBrCopy : item.translationFrCopy;
        const isReadyForReview = item.currentStatus === "TRANSLATION_READY";

        if (!activeLang) return null;

        return (
          <section
            className="app-surface-panel rounded-xl px-5 py-5 space-y-4"
            style={{ borderLeft: "4px solid #8B5CF6" }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#8B5CF6" }}>
                {activeLangLabel} Translation
              </p>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {isReadyForReview ? `${activeLangLabel} translation is ready for approval` : `Submit ${activeLangLabel} translation copy`}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-[#8FA1C5]">
                {isReadyForReview
                  ? `Review the translated copy below. Approve to advance, or update the copy and resubmit.`
                  : `Paste the ${activeLangLabel} translation of the LinkedIn copy. Once submitted it will be queued for approval.`}
              </p>
            </div>

            <form action={submitTranslationCopyAction} className="space-y-3">
              <input type="hidden" name="contentItemId" value={item.id} />
              <input type="hidden" name="language" value={activeLang} />
              <Textarea
                name="copy"
                defaultValue={existingCopy ?? ""}
                placeholder={`Paste the ${activeLangLabel} translation here…`}
                className="min-h-36 bg-white font-mono text-sm dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100"
              />
              <Button type="submit" className="transition-default" style={{ backgroundColor: "#8B5CF6", color: "white" }}>
                {isReadyForReview ? "Update copy" : "Submit for approval"}
              </Button>
            </form>

            {isReadyForReview && (
              <div className="border-t border-slate-100 pt-4 dark:border-[rgba(88,108,186,0.24)]">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[#8B97B7]">
                  Approve translation
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-[#8FA1C5]">
                  Requires <span className="font-semibold">Translation Approver</span> role.
                  {activeLang === "PT_BR" && " (PT-BR: Juliano)"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={approveTranslationLanguageAction}>
                    <input type="hidden" name="contentItemId" value={item.id} />
                    <input type="hidden" name="language" value={activeLang} />
                    <Button type="submit" className="transition-default" style={{ backgroundColor: "#8B5CF6", color: "white" }}>
                      Approve {activeLangLabel} translation
                    </Button>
                  </form>
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* ── Publish Language Selector — TRANSLATION_APPROVED ── */}
      {item.currentStatus === "TRANSLATION_APPROVED" && (() => {
        const ptBrApproved = item.translationPtBrStatus === "APPROVED";
        const frApproved = item.translationFrStatus === "APPROVED";
        const approvedLangLabel = ptBrApproved ? "PT-BR" : frApproved ? "French" : null;

        return (
          <section
            className="app-surface-panel rounded-xl px-5 py-5 space-y-4"
            style={{ borderLeft: "4px solid #10B981" }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#10B981" }}>
                Translation Approved
              </p>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {approvedLangLabel ? `${approvedLangLabel} translation approved` : "Translation approved"} — select publish language
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-[#8FA1C5]">
                Choose which language version will be used for the final post. Only approved versions are selectable.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {/* English — always available */}
              <form action={selectPublishLanguageAndProceedAction}>
                <input type="hidden" name="contentItemId" value={item.id} />
                <input type="hidden" name="language" value="ENG" />
                <Button type="submit" variant="outline" className="border-slate-300 transition-default hover:bg-slate-50 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100" style={{ color: "#0F172A" }}>
                  Publish in English
                </Button>
              </form>

              {/* PT-BR — only if approved */}
              {ptBrApproved && (
                <form action={selectPublishLanguageAndProceedAction}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <input type="hidden" name="language" value="PT_BR" />
                  <Button type="submit" className="transition-default" style={{ backgroundColor: "#10B981", color: "white" }}>
                    Publish in PT-BR ✓
                  </Button>
                </form>
              )}

              {/* French — only if approved */}
              {frApproved && (
                <form action={selectPublishLanguageAndProceedAction}>
                  <input type="hidden" name="contentItemId" value={item.id} />
                  <input type="hidden" name="language" value="FR" />
                  <Button type="submit" className="transition-default" style={{ backgroundColor: "#10B981", color: "white" }}>
                    Publish in French ✓
                  </Button>
                </form>
              )}
            </div>
          </section>
        );
      })()}

      {/* 2C — Blocker / waiting signal */}
      {operationalSummary.blocker ? (
        <div
          className="app-surface-panel flex items-start gap-3 rounded-xl border-l-4 px-4 py-3.5"
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
          className="app-surface-panel flex items-start gap-3 rounded-xl border-l-4 px-4 py-3.5"
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
        className="app-surface-panel space-y-4 rounded-xl px-5 py-4"
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
                data-testid="workflow-note"
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
              <SectionHeading>Operational source data</SectionHeading>
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
        buttonTestId="audit-trail-toggle"
      >
        <div className="divide-y divide-slate-100">
          {timelineEntries.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">No events recorded yet.</p>
          ) : (
            timelineEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-5 py-3"
                data-testid="audit-trail-event"
              >
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

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ZONE 5 — Publish attempts                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {item.publishAttempts.length > 0 && (
        <CollapsibleSection
          label="Publish attempts"
          badge={`${item.publishAttempts.length}`}
        >
          <div className="divide-y divide-slate-100 dark:divide-[rgba(255,255,255,0.05)]">
            {item.publishAttempts.map((attempt) => (
              <div key={attempt.id} className="px-5 py-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-amber-200/95 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-[rgba(191,141,57,0.48)] dark:bg-[rgba(62,42,8,0.8)] dark:text-[#F1CC88]">
                    {attempt.mode}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    attempt.status === "POSTED"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-[rgba(63,177,135,0.3)] dark:bg-[rgba(16,48,34,0.5)] dark:text-emerald-300"
                      : attempt.status === "FAILED"
                        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-[rgba(244,63,94,0.25)] dark:bg-[rgba(127,29,29,0.2)] dark:text-rose-300"
                        : "border-slate-200 bg-slate-50 text-slate-600 dark:border-[rgba(104,120,186,0.3)] dark:bg-[rgba(34,42,75,0.5)] dark:text-slate-300"
                  }`}>
                    {attempt.status}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {formatDateTime(attempt.createdAt)}
                  </span>
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-medium">{attempt.targetLabel}</span>
                  {" · "}
                  <span className="text-slate-500 dark:text-slate-400">{attempt.selectedPublishLanguage}</span>
                  {attempt.assetType && (
                    <>{" · "}<span className="text-slate-500 dark:text-slate-400">{attempt.assetType}</span></>
                  )}
                </div>
                {attempt.linkedinPostUrl && (
                  <a
                    href={attempt.linkedinPostUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"
                  >
                    View post
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {attempt.errorMessage && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{attempt.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

    </div>
  );
}
