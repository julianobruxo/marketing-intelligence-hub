import { ApprovalStage, DesignRequestStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  buildApprovalCheckpoints,
  buildContentTimeline,
  buildDesignAttemptHistory,
  buildIntegrationReadinessEntries,
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
} from "@/modules/workflow/application/workflow-actions";
import { canRecordApprovalAction } from "@/modules/workflow/domain/phase-one-workflow";

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function getPlanningFieldEntries(planningSnapshot: unknown) {
  if (!planningSnapshot || typeof planningSnapshot !== "object") {
    return [];
  }

  const snapshot = planningSnapshot as Record<string, unknown>;
  const planning = snapshot.planning;

  if (!planning || typeof planning !== "object") {
    return [];
  }

  return Object.entries(planning as Record<string, unknown>).filter(
    ([, value]) => {
      if (typeof value === "string") {
        return value.trim().length > 0;
      }

      return value !== null && value !== undefined;
    },
  );
}

function getSourceMetadataEntries(planningSnapshot: unknown) {
  if (!planningSnapshot || typeof planningSnapshot !== "object") {
    return [];
  }

  const snapshot = planningSnapshot as Record<string, unknown>;
  const sourceMetadata = snapshot.sourceMetadata;

  if (!sourceMetadata || typeof sourceMetadata !== "object") {
    return [];
  }

  return Object.entries(sourceMetadata as Record<string, unknown>).filter(
    ([, value]) => {
      if (typeof value === "string") {
        return value.trim().length > 0;
      }

      return value !== null && value !== undefined;
    },
  );
}

function getNormalizationSnapshot(planningSnapshot: unknown) {
  if (!planningSnapshot || typeof planningSnapshot !== "object") {
    return null;
  }

  const snapshot = planningSnapshot as Record<string, unknown>;
  return snapshot.normalization && typeof snapshot.normalization === "object"
    ? (snapshot.normalization as Record<string, unknown>)
    : null;
}

function getToneClasses(tone: "sky" | "amber" | "rose" | "emerald" | "slate") {
  switch (tone) {
    case "sky":
      return "border-sky-200 bg-sky-50/70";
    case "amber":
      return "border-amber-200 bg-amber-50/70";
    case "rose":
      return "border-rose-200 bg-rose-50/70";
    case "emerald":
      return "border-emerald-200 bg-emerald-50/70";
    default:
      return "border-slate-200 bg-slate-50/70";
  }
}

export default async function ContentItemDetailPage({
  params,
}: Readonly<{
  params: Promise<{ contentItemId: string }>;
}>) {
  const { contentItemId } = await params;
  const item = await getContentItemDetail(contentItemId);
  const planningFields = getPlanningFieldEntries(item.planningSnapshot);
  const sourceMetadataFields = getSourceMetadataEntries(item.planningSnapshot);
  const normalizationSnapshot = getNormalizationSnapshot(item.planningSnapshot);
  const timelineEntries = buildContentTimeline(item);
  const approvalCheckpoints = buildApprovalCheckpoints(item);
  const operationalSummary = buildOperationalSummary(item);
  const templateRouting = buildTemplateRoutingSummary(item);
  const designAttemptHistory = buildDesignAttemptHistory(item);
  const integrationReadiness = buildIntegrationReadinessEntries(item);
  const latestDesignRequest = item.designRequests[0];
  const latestAsset = item.assets[item.assets.length - 1];
  const latestSourceLink = item.sourceLinks[0];
  const latestImportReceipt = item.importReceipts[0];
  const canvaEligible = isSliceOneCanvaEligible({
    profile: item.profile,
    contentType: item.contentType,
    sourceLocale: item.sourceLocale,
  });
  const canvaSliceReady =
    canvaEligible && item.currentStatus === "CONTENT_APPROVED";
  const canvaRetryReady =
    canvaEligible && item.currentStatus === "DESIGN_FAILED";
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
  const availableActions = [
    canvaSliceReady ? "Start the design attempt" : null,
    canRefreshDesign ? "Refresh the active design handoff" : null,
    canvaRetryReady ? "Retry the failed design attempt" : null,
    item.currentStatus === "DESIGN_READY"
      ? "Approve the generated design"
      : null,
    canRecordPublishApproval ? "Record a publish approval decision" : null,
    canRecordTranslationApproval
      ? "Record a translation approval decision"
      : null,
    "Add a workflow note or revision comment",
  ].filter((value): value is string => Boolean(value));
  const primaryAction = availableActions[0] ?? operationalSummary.nextStep;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:items-start">
      <section className="space-y-5">
        <Card size="sm" className="border-slate-200 bg-white/96 shadow-sm">
          <CardContent className="space-y-5 p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50">
                {item.profile}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-slate-300 bg-white px-2.5 py-0.5 text-[11px] text-slate-700"
              >
                {formatLabel(item.currentStatus)}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-slate-300 bg-white px-2.5 py-0.5 text-[11px] text-slate-700"
              >
                {item.contentType === "STATIC_POST" ? "Static post" : "Carousel"}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-slate-300 bg-white px-2.5 py-0.5 text-[11px] text-slate-700"
              >
                {item.translationRequired ? "Translation required" : "English only"}
              </Badge>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Current work item
                </p>
                <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 lg:text-[2.2rem]">
                  {item.title}
                </h1>
                <p className="max-w-4xl text-base leading-7 text-slate-600">
                  {item.copy}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                    {latestSourceLink
                      ? `Row ${latestSourceLink.rowId} in ${latestSourceLink.worksheetName}`
                      : "No source row link yet"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                    {latestImportReceipt
                      ? `${formatLabel(latestImportReceipt.mode)} / ${formatLabel(latestImportReceipt.status)}`
                      : "No import receipt"}
                  </span>
                  {latestDesignRequest?.profileMapping ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                      {latestDesignRequest.profileMapping.displayName}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className={`rounded-2xl border p-3.5 ${getToneClasses(operationalSummary.tone)}`}>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Next move
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-900">
                    {operationalSummary.nextStep}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Primary action
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-900">
                    {primaryAction}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Waiting on
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-900">
                    {operationalSummary.waitingOn}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Active blocker
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-900">
                    {operationalSummary.blocker ??
                      "No active blocker is recorded right now."}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card size="sm" className="border-slate-200 bg-white/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardDescription>Operator workbench</CardDescription>
            <CardTitle>Actions, approvals, notes, and recovery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
              <div className="space-y-5">
                <section className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Actions now
                  </p>
                  <div className="space-y-2.5">
                    {availableActions.map((action) => {
                      const isPrimary = action === primaryAction;

                      return (
                        <div
                          key={action}
                          className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 ${
                            isPrimary
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-slate-200 bg-slate-50/80"
                          }`}
                        >
                          <div className="space-y-1">
                            <p
                              className={`text-sm font-medium ${
                                isPrimary ? "text-white" : "text-slate-900"
                              }`}
                            >
                              {action}
                            </p>
                            {isPrimary ? (
                              <p className="text-xs uppercase tracking-[0.14em] text-slate-300">
                                Primary operator action
                              </p>
                            ) : null}
                          </div>
                          <Badge
                            variant="outline"
                            className={`rounded-full ${
                              isPrimary
                                ? "border-white/35 bg-white/10 text-white"
                                : "border-slate-300 text-slate-700"
                            }`}
                          >
                            {isPrimary ? "Primary" : "Available"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                      Approval checkpoints
                    </p>
                    <p className="text-sm text-slate-500">
                      Publish and translation stay explicit.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {approvalCheckpoints.map((checkpoint) => (
                      <div
                        key={`approval-${checkpoint.stage}`}
                        className={`rounded-2xl border p-3.5 ${getToneClasses(checkpoint.tone)}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">
                            {checkpoint.label}
                          </p>
                          <Badge
                            variant="outline"
                            className="rounded-full border-slate-300 text-slate-700"
                          >
                            {formatLabel(checkpoint.status)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {checkpoint.summary}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          Owner:{" "}
                          <span className="font-medium text-slate-900">
                            {checkpoint.actor}
                          </span>
                        </p>
                        {checkpoint.note ? (
                          <p className="mt-2 text-sm text-slate-700">
                            Latest note: {checkpoint.note}
                          </p>
                        ) : null}
                        {checkpoint.occurredAt ? (
                          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                            Last updated {formatDateTime(checkpoint.occurredAt)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {canRecordPublishApproval ? (
                      <form
                        action={recordApprovalAction}
                        className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3.5"
                      >
                        <input type="hidden" name="contentItemId" value={item.id} />
                        <input type="hidden" name="stage" value={ApprovalStage.PUBLISH} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <p className="text-sm font-medium text-slate-900">
                          Publish approval
                        </p>
                        <Textarea
                          name="note"
                          placeholder="Optional publish approval note."
                          className="min-h-20"
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button
                            type="submit"
                            className="bg-slate-950 text-white hover:bg-slate-800"
                          >
                            Record publish approval
                          </Button>
                          <Button
                            formAction={recordApprovalAction}
                            type="submit"
                            name="decision"
                            value="CHANGES_REQUESTED"
                            className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                          >
                            Request publish changes
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm text-slate-600">
                        Publish approval is not available at the current state.
                      </div>
                    )}
                    {canRecordTranslationApproval ? (
                      <form
                        action={recordApprovalAction}
                        className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3.5"
                      >
                        <input type="hidden" name="contentItemId" value={item.id} />
                        <input
                          type="hidden"
                          name="stage"
                          value={ApprovalStage.TRANSLATION}
                        />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <p className="text-sm font-medium text-slate-900">
                          Translation approval
                        </p>
                        <Textarea
                          name="note"
                          placeholder="Optional translation approval note."
                          className="min-h-20"
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button
                            type="submit"
                            className="bg-slate-950 text-white hover:bg-slate-800"
                          >
                            Record translation approval
                          </Button>
                          <Button
                            formAction={recordApprovalAction}
                            type="submit"
                            name="decision"
                            value="CHANGES_REQUESTED"
                            className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                          >
                            Request translation changes
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm text-slate-600">
                        Translation approval is not available at the current state.
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="space-y-4">
                <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Notes and revisions
                  </p>
                  <form action={addWorkflowNoteAction} className="mt-3 space-y-3">
                    <input type="hidden" name="contentItemId" value={item.id} />
                    <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                      <select
                        name="type"
                        defaultValue="COMMENT"
                        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                      >
                        <option value="COMMENT">Comment</option>
                        <option value="REVISION">Revision</option>
                      </select>
                      <Textarea
                        name="body"
                        placeholder="Add a comment or revision note tied to this content item."
                        className="min-h-28 bg-white"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="bg-slate-950 text-white hover:bg-slate-800"
                    >
                      Add workflow note
                    </Button>
                  </form>
                </section>

                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Recent notes
                  </p>
                  <div className="space-y-3">
                    {item.notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                          <span>{formatLabel(note.type)}</span>
                          <span>&bull;</span>
                          <span>{note.author.name ?? note.author.email}</span>
                          <span>&bull;</span>
                          <span>{formatDateTime(note.createdAt)}</span>
                        </div>
                        <p className="mt-3 text-sm leading-5 text-slate-800">
                          {note.body}
                        </p>
                      </div>
                    ))}
                    {item.notes.length === 0 ? (
                      <Card
                        size="sm"
                        className="border-dashed border-slate-300 bg-slate-50/70 shadow-none"
                      >
                        <CardContent className="space-y-2 p-4">
                          <p className="text-sm font-medium text-slate-900">
                            No workflow notes yet
                          </p>
                          <p className="text-sm leading-5 text-slate-600">
                            Use this area to capture editorial comments, revision
                            requests, or operator context.
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <section className="space-y-4 border-t border-slate-200 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Template routing and recovery
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Keep the active route, Canva handoff, and fallback history visible in one place.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-300 text-slate-700"
                >
                  {formatLabel(templateRouting.status)}
                </Badge>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Routing summary
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {templateRouting.activeRouteLabel}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {templateRouting.summary}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Design trigger
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {latestDesignRequest
                      ? `Attempt ${latestDesignRequest.attemptNumber} / ${formatLabel(latestDesignRequest.status)}`
                      : "No design attempt has been started yet"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {latestDesignRequest
                      ? latestDesignRequest.status === DesignRequestStatus.FAILED
                        ? latestDesignRequest.errorMessage ??
                          latestDesignRequest.errorCode ??
                          "The provider returned a failure state."
                        : latestDesignRequest.status ===
                            DesignRequestStatus.IN_PROGRESS ||
                          latestDesignRequest.status ===
                            DesignRequestStatus.REQUESTED
                          ? "The provider handoff is still active."
                          : "The generated design result is ready for the next checkpoint."
                      : "Trigger the first Canva handoff from the workbench once the item is ready."}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {templateRouting.mappings.map((mapping) => (
                  <div
                    key={mapping.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {mapping.displayName}
                        </p>
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          {formatLabel(mapping.providerLabel)} /{" "}
                          {mapping.locale.toUpperCase()}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full border-slate-300 text-slate-700"
                      >
                        {mapping.isSliceRoute ? "Slice" : "Route"}
                      </Badge>
                    </div>
                    <p className="mt-2 break-all text-sm text-slate-600">
                      {mapping.externalTemplateId}
                    </p>
                  </div>
                ))}
                {templateRouting.mappings.length === 0 ? (
                  <Card
                    size="sm"
                    className="border-dashed border-slate-300 bg-slate-50/70 shadow-none md:col-span-2"
                  >
                    <CardContent className="space-y-2 p-4">
                      <p className="text-sm font-medium text-slate-900">
                        No active mapping is available
                      </p>
                      <p className="text-sm leading-5 text-slate-600">
                        This content item does not yet have a usable template route.
                      </p>
                    </CardContent>
                  </Card>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {canvaSliceReady ? (
                  <form action={runCanvaDesignRequestAction} className="space-y-3">
                    <input type="hidden" name="contentItemId" value={item.id} />
                    <input
                      type="hidden"
                      name="simulationScenario"
                      value={designSimulationScenarioSchema.enum.SUCCESS}
                    />
                    <Button
                      type="submit"
                      className="w-full bg-slate-950 text-white hover:bg-slate-800"
                    >
                      Start design handoff
                    </Button>
                  </form>
                ) : null}
                {canRefreshDesign ? (
                  <form action={syncCanvaDesignRequestAction} className="space-y-3">
                    <input type="hidden" name="contentItemId" value={item.id} />
                    <Button
                      type="submit"
                      className="w-full bg-slate-950 text-white hover:bg-slate-800"
                    >
                      Refresh active handoff
                    </Button>
                  </form>
                ) : null}
                {canvaRetryReady ? (
                  <form action={runCanvaDesignRequestAction} className="space-y-3">
                    <input type="hidden" name="contentItemId" value={item.id} />
                    <input
                      type="hidden"
                      name="simulationScenario"
                      value={designSimulationScenarioSchema.enum.FAILURE}
                    />
                    <Button
                      type="submit"
                      className="w-full bg-slate-950 text-white hover:bg-slate-800"
                    >
                      Retry failed handoff
                    </Button>
                  </form>
                ) : null}
                {item.currentStatus === "DESIGN_READY" ? (
                  <form action={approveDesignReadyAction} className="space-y-3">
                    <input type="hidden" name="contentItemId" value={item.id} />
                    <Button
                      type="submit"
                      className="w-full bg-slate-950 text-white hover:bg-slate-800"
                    >
                      Approve generated design
                    </Button>
                  </form>
                ) : null}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Recovery history
                </p>
                <div className="space-y-3">
                  {designAttemptHistory.map((attempt) => (
                    <div
                      key={attempt.id}
                      className={`rounded-2xl border p-3.5 ${getToneClasses(attempt.tone)}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">
                          {attempt.headline}
                        </p>
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-300 text-slate-700"
                        >
                          {attempt.statusLabel}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-slate-700">
                        {attempt.summary}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                        <span className="rounded-full border border-white/70 bg-white/75 px-2 py-0.5">
                          {attempt.templateLabel}
                        </span>
                        <span className="rounded-full border border-white/70 bg-white/75 px-2 py-0.5">
                          {attempt.simulationScenario}
                        </span>
                        <span className="rounded-full border border-white/70 bg-white/75 px-2 py-0.5">
                          {attempt.externalRequestId
                            ? "Request traced"
                            : "No request id"}
                        </span>
                      </div>
                      {attempt.errorMessage ? (
                        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-rose-700">
                            {attempt.errorCode ?? "Design failure"}
                          </p>
                          <p className="mt-1 text-sm text-rose-900">
                            {attempt.errorMessage}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {designAttemptHistory.length === 0 ? (
                    <Card
                      size="sm"
                      className="border-dashed border-slate-300 bg-slate-50/70 shadow-none"
                    >
                      <CardContent className="space-y-2 p-4">
                        <p className="text-sm font-medium text-slate-900">
                          No design attempts are recorded yet
                        </p>
                        <p className="text-sm leading-5 text-slate-600">
                          Once design is triggered, this history will show every
                          request, active handoff, failure, retry, and ready
                          result for this content item.
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </div>
            </section>
          </CardContent>
        </Card>

        <Card size="sm" className="border-slate-200 bg-white/95 shadow-sm">
          <CardHeader>
            <CardDescription>Readable operational audit trail</CardDescription>
            <CardTitle>Activity timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {timelineEntries.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-2xl border p-3.5 ${getToneClasses(entry.tone)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-300 text-slate-700"
                    >
                      {entry.kind.toLowerCase()}
                    </Badge>
                    <p className="text-sm font-medium text-slate-900">
                      {entry.title}
                    </p>
                  </div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    {formatDateTime(entry.occurredAt)}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-5 text-slate-700">
                  {entry.description}
                </p>
                <p className="mt-1.5 text-sm text-slate-600">{entry.meta}</p>
              </div>
            ))}
            {timelineEntries.length === 0 ? (
              <Card
                size="sm"
                className="border-dashed border-slate-300 bg-slate-50/70 shadow-none"
              >
                <CardContent className="space-y-2 p-4">
                  <p className="text-sm font-medium text-slate-900">
                    No activity timeline exists yet
                  </p>
                  <p className="text-sm leading-5 text-slate-600">
                    Import events, workflow state changes, approvals, notes,
                    and design attempts will appear here as soon as they are
                    recorded.
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-5 self-start xl:sticky xl:top-6">
        <Card size="sm" className="border-slate-200 bg-white/95 shadow-sm">
          <CardHeader>
            <CardDescription>Supporting context</CardDescription>
            <CardTitle>Planning data, metadata, and trace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Planning data
                </p>
                <div className="mt-3 space-y-3">
                  {planningFields.map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        {formatLabel(key)}
                      </p>
                      <p className="mt-1 text-sm text-slate-900">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                  {planningFields.length === 0 ? (
                    <p className="text-sm leading-5 text-slate-600">
                      No planning fields were normalized yet.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Source-only metadata
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-600">
                  Published flags, post URLs, and adjacent planning metadata
                  remain source facts until a controlled reconciliation rule
                  exists. They never silently rewrite workflow state.
                </p>
                <div className="mt-3 space-y-3">
                  {sourceMetadataFields.map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        {formatLabel(key)}
                      </p>
                      <p className="mt-1 break-all text-sm text-slate-900">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                  {sourceMetadataFields.length === 0 ? (
                    <p className="text-sm leading-5 text-slate-600">
                      No source metadata is attached.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {normalizationSnapshot ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Normalization signal
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {Object.entries(normalizationSnapshot).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        {formatLabel(key)}
                      </p>
                      <p className="mt-1 text-sm text-slate-900">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Import receipt
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {latestImportReceipt
                    ? `${formatLabel(latestImportReceipt.mode)} / ${formatLabel(latestImportReceipt.status)}`
                    : "No import receipt linked"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {latestImportReceipt?.idempotencyKey ??
                    "No idempotency trace is stored yet."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Latest linked asset
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {latestAsset ? formatLabel(latestAsset.assetStatus) : "No asset linked yet"}
                </p>
                <p className="mt-1 break-all text-sm text-slate-600">
                  {latestAsset?.externalUrl ??
                    "A design-ready or export asset will appear here once available."}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Source trace and output
              </p>
              <div className="space-y-2">
                {item.sourceLinks.map((link) => (
                  <div
                    key={link.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3.5"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {link.worksheetName} / row {link.rowId}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Spreadsheet {link.spreadsheetId} / worksheet {link.worksheetId}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Sheet profile {link.sheetProfileKey ?? "not recorded"} / version{" "}
                      {link.sheetProfileVersion ?? "n/a"}
                    </p>
                  </div>
                ))}
                {item.sourceLinks.length === 0 ? (
                  <Card
                    size="sm"
                    className="border-dashed border-slate-300 bg-slate-50/70 shadow-none"
                  >
                    <CardContent className="space-y-2 p-4">
                      <p className="text-sm font-medium text-slate-900">
                        No source row link is attached yet
                      </p>
                      <p className="text-sm leading-5 text-slate-600">
                        Import metadata will appear here once a Sheets row is
                        normalized and committed.
                      </p>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          size="sm"
          className="border-dashed border-slate-300 bg-white/90 shadow-[0_12px_28px_rgba(15,23,42,0.04)]"
        >
          <CardHeader className="pb-2">
            <CardDescription>Ready for later connections</CardDescription>
            <CardTitle className="text-base text-slate-950">
              Integration surfaces stay visible, but quiet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrationReadiness.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-2xl border p-3.5 ${getToneClasses(entry.tone)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    {entry.label}
                  </p>
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-300 text-slate-700"
                  >
                    {formatLabel(entry.status)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-5 text-slate-700">
                  {entry.summary}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
