import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CircleCheckBig,
  Clock3,
  Layers3,
  MoveUpRight,
  PauseCircle,
  Route,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildQueueFocusMetrics,
  buildQueueSections,
  getApprovalSummary,
  getDesignSummary,
  getTranslationCheckpoint,
} from "@/modules/content-catalog/application/content-workflow-view-model";
import { listQueueContentItems } from "@/modules/content-catalog/application/content-queries";

function formatStatusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function getToneClasses(tone: "sky" | "amber" | "rose" | "emerald" | "slate") {
  switch (tone) {
    case "sky":
      return {
        panel: "border-sky-200 bg-sky-50/80",
        badge: "bg-sky-600 text-white hover:bg-sky-600",
        rail: "bg-sky-500",
        softBadge: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "amber":
      return {
        panel: "border-amber-200 bg-amber-50/80",
        badge: "bg-amber-500 text-white hover:bg-amber-500",
        rail: "bg-amber-500",
        softBadge: "border-amber-200 bg-amber-50 text-amber-800",
      };
    case "rose":
      return {
        panel: "border-rose-200 bg-rose-50/80",
        badge: "bg-rose-600 text-white hover:bg-rose-600",
        rail: "bg-rose-500",
        softBadge: "border-rose-200 bg-rose-50 text-rose-800",
      };
    case "emerald":
      return {
        panel: "border-emerald-200 bg-emerald-50/80",
        badge: "bg-emerald-600 text-white hover:bg-emerald-600",
        rail: "bg-emerald-500",
        softBadge: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    default:
      return {
        panel: "border-slate-200 bg-slate-50/80",
        badge: "bg-slate-700 text-white hover:bg-slate-700",
        rail: "bg-slate-500",
        softBadge: "border-slate-200 bg-slate-50 text-slate-700",
      };
  }
}

function getLaneMeta(lane: string) {
  switch (lane) {
    case "NEEDS_ACTION":
      return {
        icon: Layers3,
        badge: "bg-sky-600 text-white hover:bg-sky-600",
        accent: "border-sky-200 bg-sky-50/70",
      };
    case "IN_PROGRESS":
      return {
        icon: Clock3,
        badge: "bg-amber-500 text-white hover:bg-amber-500",
        accent: "border-amber-200 bg-amber-50/70",
      };
    case "FAILED":
      return {
        icon: AlertTriangle,
        badge: "bg-rose-600 text-white hover:bg-rose-600",
        accent: "border-rose-200 bg-rose-50/70",
      };
    case "READY":
      return {
        icon: CircleCheckBig,
        badge: "bg-emerald-600 text-white hover:bg-emerald-600",
        accent: "border-emerald-200 bg-emerald-50/70",
      };
    default:
      return {
        icon: PauseCircle,
        badge: "bg-slate-700 text-white hover:bg-slate-700",
        accent: "border-slate-200 bg-slate-50/70",
      };
  }
}

export default async function QueuePage() {
  const contentItems = await listQueueContentItems();
  const sections = buildQueueSections(contentItems);
  const focus = buildQueueFocusMetrics(sections);
  const totalItems = sections.reduce((sum, section) => sum + section.count, 0);

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,247,251,0.96))] px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.04)] lg:px-5 lg:py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50">
            Pipeline #1 operating queue
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border-slate-300 bg-white px-2.5 py-0.5 text-[11px] text-slate-700"
          >
            {totalItems} live item{totalItems === 1 ? "" : "s"}
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border-slate-300 bg-white px-2.5 py-0.5 text-[11px] text-slate-700"
          >
            Queue first
          </Badge>
        </div>

        <div className="mt-2.5 space-y-3">
          <div className="space-y-1">
            <h1 className="max-w-4xl text-[1.65rem] font-semibold tracking-tight text-slate-950 lg:text-[1.9rem]">
              Queue operations lead the product.
            </h1>
            <p className="max-w-3xl text-sm leading-5 text-slate-600">
              Scan what moves now, what is blocked, and what needs recovery
              without opening every item first.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Action now
              </span>
              <span className="ml-2 font-semibold text-slate-950">
                {focus.actionNowCount}
              </span>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                In motion
              </span>
              <span className="ml-2 font-semibold text-slate-950">
                {focus.movingCount}
              </span>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Recovery load
              </span>
              <span className="ml-2 font-semibold text-slate-950">
                {focus.failedCount + focus.blockedCount}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {sections.map((section) => {
          const laneMeta = getLaneMeta(section.lane);
          const LaneIcon = laneMeta.icon;

          return (
            <section
              key={section.lane}
              className="overflow-hidden rounded-[24px] border border-slate-200 bg-white/96 shadow-[0_16px_36px_rgba(15,23,42,0.045)]"
            >
              <div className="flex flex-col gap-2.5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-5">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-2xl border ${laneMeta.accent}`}
                  >
                    <LaneIcon className="h-4 w-4 text-slate-700" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-950">
                        {section.label}
                      </h2>
                      <Badge
                        className={`rounded-full px-2.5 py-0.5 text-[11px] ${laneMeta.badge}`}
                      >
                        {section.count} item{section.count === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                      {section.description}
                    </p>
                  </div>
                </div>
                <p className="max-w-lg text-sm leading-5 text-slate-500">
                  {section.lane === "NEEDS_ACTION"
                    ? "Priority stack for review, approval, and design starts."
                    : section.lane === "IN_PROGRESS"
                      ? "Active handoffs. Inspect before starting another attempt."
                      : section.lane === "FAILED"
                        ? "Stored failure detail is ready for recovery."
                        : section.lane === "BLOCKED"
                          ? "Paused on feedback, translation, or another dependency."
                          : "Cleared for the next operational handoff."}
                </p>
              </div>

              {section.items.length === 0 ? (
                <div className="px-5 pb-5">
                  <Card size="sm" className={`shadow-none ${laneMeta.accent}`}>
                    <CardContent className="space-y-2 p-4">
                      <p className="text-sm font-medium text-slate-900">
                        {section.emptyTitle}
                      </p>
                      <p className="text-sm leading-5 text-slate-600">
                        {section.emptyDescription}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <>
                  <div className="hidden border-y border-slate-200/80 bg-slate-50/80 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 xl:grid xl:grid-cols-[minmax(0,2.45fr)_minmax(0,1.5fr)_minmax(0,1.15fr)_auto] xl:gap-4">
                    <span>Content item</span>
                    <span>Next action</span>
                    <span>Operating signals</span>
                    <span className="text-right">Open</span>
                  </div>
                  <div className="divide-y divide-slate-200/80">
                    {section.items.map((item) => {
                      const tone = getToneClasses(item.tone);
                      const latestSourceLink = item.sourceLinks[0];
                      const latestImport = item.importReceipts[0];
                      const latestDesignRequest = item.designRequests[0];
                      const approvalSummary = getApprovalSummary(item);
                      const designSummary = getDesignSummary(item);
                      const translationSummary = getTranslationCheckpoint(item);
                      const routeLabel = latestDesignRequest?.profileMapping
                        ? latestDesignRequest.profileMapping.displayName
                        : "Route resolves in item detail";
                      const routeMeta = latestDesignRequest?.profileMapping
                        ? `${formatStatusLabel(latestDesignRequest.profileMapping.designProvider)} design route`
                        : "Template mapping is still visible in the workbench";
                      const signalPills = [
                        approvalSummary ?? "Approval pending",
                        designSummary ?? "No design attempts",
                        translationSummary,
                      ];

                      return (
                        <Link
                          key={item.id}
                          href={`/queue/${item.id}`}
                          className="group block transition hover:bg-slate-50/80"
                        >
                          <article className="grid gap-3 px-4 py-3.5 xl:grid-cols-[minmax(0,2.45fr)_minmax(0,1.5fr)_minmax(0,1.15fr)_auto] xl:gap-4 xl:px-5">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge
                                  className={`rounded-full px-2.5 py-0.5 text-[11px] ${tone.badge}`}
                                >
                                  {item.profile}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-slate-300 bg-white px-2.5 py-0.5 text-[11px] text-slate-700"
                                >
                                  {item.contentType === "STATIC_POST"
                                    ? "Static post"
                                    : "Carousel"}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-slate-300 bg-white px-2.5 py-0.5 text-[11px] text-slate-700"
                                >
                                  {formatStatusLabel(item.currentStatus)}
                                </Badge>
                                {latestSourceLink ? (
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-slate-300 bg-white px-2.5 py-0.5 text-[11px] text-slate-700"
                                  >
                                    {latestSourceLink.worksheetName}
                                  </Badge>
                                ) : null}
                              </div>

                              <div className="space-y-1.5">
                                <h3 className="text-[1.05rem] font-semibold leading-tight text-slate-950 transition group-hover:text-slate-700">
                                  {item.title}
                                </h3>
                                <p className="line-clamp-2 max-w-4xl text-sm leading-5 text-slate-600">
                                  {item.copy}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span>
                                  {latestSourceLink
                                    ? `Row ${latestSourceLink.rowId} in ${latestSourceLink.spreadsheetId}`
                                    : "No source row link"}
                                </span>
                                <span>&bull;</span>
                                <span>
                                  {latestImport
                                    ? `${formatStatusLabel(latestImport.mode)} / ${formatStatusLabel(latestImport.status)}`
                                    : "No import receipt"}
                                </span>
                                {latestImport ? (
                                  <>
                                    <span>&bull;</span>
                                    <span>
                                      {formatDateTime(latestImport.receivedAt)}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            <div className={`space-y-2 rounded-[18px] border p-3 ${tone.panel}`}>
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                                Next action
                              </p>
                              <p className="text-[0.98rem] font-semibold leading-5 text-slate-950">
                                {item.nextActionLabel}
                              </p>
                              <p className="text-sm leading-5 text-slate-600">
                                {item.reason}
                              </p>
                            </div>

                            <div className="space-y-2.5 rounded-[18px] border border-slate-200 bg-white p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                                  Operating signals
                                </p>
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-slate-300 px-2 py-0.5 text-[11px] text-slate-700"
                                >
                                  {item.waitingOn}
                                </Badge>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <Route className="h-3.5 w-3.5 text-slate-400" />
                                  <p className="text-sm font-medium text-slate-900">
                                    {routeLabel}
                                  </p>
                                </div>
                                <p className="mt-1 text-sm leading-5 text-slate-600">
                                  {routeMeta}
                                </p>
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                                  Blocker
                                </p>
                                <p className="text-sm leading-5 text-slate-900">
                                  {item.blocker ??
                                    "No blocker is recorded for this item right now."}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {signalPills.map((signal) => (
                                  <Badge
                                    key={signal}
                                    variant="outline"
                                    className="rounded-full border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                                  >
                                    {signal}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-2.5 rounded-[20px] border border-slate-200 bg-white p-3.5">
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                                Status trace
                              </p>
                              <div className="space-y-2">
                                <p className="text-sm leading-5 text-slate-900">
                                  Workflow: {approvalSummary ?? "pending"}
                                </p>
                                <p className="text-sm leading-5 text-slate-900">
                                  Design: {designSummary ?? "none yet"}
                                </p>
                                <p className="text-sm leading-5 text-slate-900">
                                  Translation: {translationSummary}
                                </p>
                              </div>
                            </div>

                            <div className="flex xl:items-center xl:justify-end">
                              <div className="flex items-center gap-2 rounded-full border border-slate-900 bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition group-hover:bg-slate-800">
                                Open item
                                <ArrowRight className="h-4 w-4" />
                              </div>
                            </div>
                          </article>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </section>

      <Card
        size="sm"
        className="border-dashed border-slate-300 bg-white/90 shadow-[0_18px_46px_rgba(15,23,42,0.04)]"
      >
        <CardHeader className="pb-2">
          <CardDescription>Import checkpoint</CardDescription>
          <CardTitle className="text-base text-slate-950">
            Preview, commit, and row tracing stay available beneath the queue
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Normalized Sheets payloads still enter through the
            persistence-backed checkpoint that supports preview, commit, and
            reprocessing.
          </p>
          <Button
            asChild
            size="sm"
            className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
          >
            <Link href="/queue/import-preview">
              Open import checkpoint
              <MoveUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
