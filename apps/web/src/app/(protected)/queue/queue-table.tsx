"use client";

import Link from "next/link";
import { ArrowUpRight, EyeOff, Image as ImageIcon } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPublishedPreview } from "@/modules/content-catalog/application/content-preview";
import { getShortActionPhrase } from "@/modules/content-catalog/application/content-workflow-view-model";
import type { QueueLane, QueueLaneSection } from "@/modules/content-catalog/application/content-workflow-view-model";
import { readOperationalStatusFromPlanningSnapshot } from "@/modules/content-intake/domain/infer-content-status";
import { formatOperationalLabel, getToneBadgeClasses } from "@/shared/ui/operational-status";

type DecoratedItem = QueueLaneSection["items"][number];
type LaneTab = QueueLane | "ALL";

const LANE_ORDER: QueueLane[] = ["NEEDS_ACTION", "FAILED", "BLOCKED", "IN_PROGRESS", "READY"];

const LANE_TAB_META: Record<LaneTab, { label: string; priority: number }> = {
  ALL: { label: "All", priority: -1 },
  NEEDS_ACTION: { label: "Needs Action", priority: 0 },
  FAILED: { label: "Attention", priority: 1 },
  BLOCKED: { label: "Blocked", priority: 2 },
  IN_PROGRESS: { label: "In Motion", priority: 3 },
  READY: { label: "Ready", priority: 4 },
};

function formatProfileLabel(profile: string): string {
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

function profileBadgeStyle(profile: string): CSSProperties {
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

function laneRowClass(lane: QueueLane): string {
  switch (lane) {
    case "NEEDS_ACTION":
      return "queue-row-needs-action";
    case "FAILED":
      return "queue-row-failed";
    case "BLOCKED":
      return "queue-row-blocked";
    case "READY":
      return "queue-row-ready";
    case "IN_PROGRESS":
      return "";
  }
}

function readRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getPlanningDetails(item: DecoratedItem) {
  const snapshot = readRecord(item.planningSnapshot);
  const planning = readRecord(snapshot?.planning);

  return {
    plannedDate:
      typeof planning?.plannedDate === "string" && planning.plannedDate.trim().length > 0
        ? planning.plannedDate.trim()
        : null,
    deadline:
      typeof planning?.contentDeadline === "string" && planning.contentDeadline.trim().length > 0
        ? planning.contentDeadline.trim()
        : null,
  };
}

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function getItemDate(item: DecoratedItem): Date {
  return (
    item.statusEvents[0]?.createdAt ??
    item.designRequests[0]?.updatedAt ??
    item.importReceipts[0]?.receivedAt ??
    item.latestImportAt ??
    item.updatedAt
  );
}

function sortItems(items: DecoratedItem[]): DecoratedItem[] {
  return [...items].sort((a, b) => {
    const laneAIdx = LANE_ORDER.indexOf(a.lane);
    const laneBIdx = LANE_ORDER.indexOf(b.lane);
    if (laneAIdx !== laneBIdx) return laneAIdx - laneBIdx;
    return getItemDate(b).getTime() - getItemDate(a).getTime();
  });
}

function getSourceLabel(item: DecoratedItem): string {
  const sourceLink = item.sourceLinks[0];

  if (!sourceLink) {
    return "Drive source unavailable";
  }

  const rowLabel = sourceLink.rowNumber ? `Row ${sourceLink.rowNumber}` : sourceLink.rowId;
  return `${sourceLink.worksheetName} · ${rowLabel}`;
}

function getSourceDetail(item: DecoratedItem): string | null {
  const sourceLink = item.sourceLinks[0];

  if (!sourceLink) {
    return null;
  }

  return `Spreadsheet ${sourceLink.spreadsheetId}`;
}

function getOperationalStatusLabel(item: DecoratedItem) {
  return readOperationalStatusFromPlanningSnapshot(item.planningSnapshot);
}

function isPublishedItem(item: DecoratedItem) {
  const operationalStatus = getOperationalStatusLabel(item);
  return (
    operationalStatus === "PUBLISHED" ||
    item.currentStatus === "PUBLISHED_MANUALLY" ||
    item.currentStatus === "POSTED"
  );
}

function QueueRow({ item, index }: { item: DecoratedItem; index: number }) {
  const [showMetadata, setShowMetadata] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const delay = Math.min(index * 30, 300);
  const operationalStatus = getOperationalStatusLabel(item);
  const primaryStatus = operationalStatus ?? item.currentStatus;
  const planning = getPlanningDetails(item);
  const itemDate = getItemDate(item);
  const publishedPreview = isPublishedItem(item)
    ? getPublishedPreview({ planningSnapshot: item.planningSnapshot, assets: item.assets })
    : null;

  const startMetadataTimer = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
    }

    hoverTimer.current = window.setTimeout(() => {
      setShowMetadata(true);
    }, 3000);
  };

  const stopMetadataTimer = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }

    setShowMetadata(false);
  };

  return (
    <Link
      href={`/queue/${item.id}`}
      className={cn(
        "queue-row group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 animate-fade-in-row",
        laneRowClass(item.lane),
      )}
      style={{ animationDelay: `${delay}ms` }}
      onMouseEnter={startMetadataTimer}
      onMouseLeave={stopMetadataTimer}
      onFocus={() => setShowMetadata(true)}
      onBlur={stopMetadataTimer}
    >
      <div className="flex flex-col items-start gap-2">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
          style={profileBadgeStyle(item.profile)}
        >
          {formatProfileLabel(item.profile)}
        </span>
        {publishedPreview ? (
          <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:block">
            <img
              src={publishedPreview.previewUrl}
              alt={`${item.title} preview`}
              className="h-16 w-16 object-cover"
            />
          </div>
        ) : null}
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[15px] font-medium leading-6 text-slate-900">
            {item.title}
          </p>
          <Badge
            variant="outline"
            className={cn("shrink-0 px-2.5 py-0.5 text-[11px] font-medium", getToneBadgeClasses(primaryStatus))}
          >
            {formatOperationalLabel(primaryStatus)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {planning.deadline ? (
            <span className={cn(primaryStatus === "LATE" ? "font-medium text-rose-600" : undefined)}>
              {formatDateLabel(planning.deadline)}
            </span>
          ) : (
            <span>{formatDateLabel(planning.plannedDate) ?? formatDate(itemDate)}</span>
          )}
          <span className="select-none text-slate-300">·</span>
          <span>{getShortActionPhrase(item)}</span>
          {publishedPreview ? (
            <>
              <span className="select-none text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 text-slate-500">
                <ImageIcon className="h-3.5 w-3.5" />
                Preview
              </span>
            </>
          ) : null}
        </div>

        {showMetadata ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 shadow-sm">
            <p>{getSourceLabel(item)}</p>
            {getSourceDetail(item) ? <p className="mt-1">{getSourceDetail(item)}</p> : null}
          </div>
        ) : null}
      </div>

      <span
        className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-default group-hover:border-slate-900 group-hover:bg-slate-950 group-hover:text-white"
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

interface QueueTableProps {
  sections: QueueLaneSection[];
  totalItems: number;
}

export function QueueTable({ sections, totalItems }: QueueTableProps) {
  const [activeTab, setActiveTab] = useState<LaneTab>("ALL");
  const [hidePublished, setHidePublished] = useState(false);

  const allItems: DecoratedItem[] = sections.flatMap((section) => section.items);
  const visibleItems = hidePublished ? allItems.filter((item) => !isPublishedItem(item)) : allItems;

  const countByLane: Partial<Record<QueueLane, number>> = {};
  for (const lane of LANE_ORDER) {
    countByLane[lane] = visibleItems.filter((item) => item.lane === lane).length;
  }

  const filteredItems =
    activeTab === "ALL"
      ? sortItems(visibleItems)
      : sortItems(visibleItems.filter((item) => item.lane === activeTab));

  const tabs: LaneTab[] = ["ALL", ...LANE_ORDER];

  return (
    <div className="space-y-3 animate-fade-in-up">
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px]" style={{ color: "#94A3B8" }}>
            Pipeline #1 operating queue -{" "}
            <span className="font-medium" style={{ color: "#64748B" }}>
              {visibleItems.length} visible of {totalItems} {totalItems === 1 ? "item" : "items"}
            </span>
          </p>

          <button
            type="button"
            onClick={() => setHidePublished((current) => !current)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-default",
              hidePublished
                ? "border-slate-900 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
            )}
          >
            <EyeOff className="h-4 w-4" />
            Hide published
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const meta = LANE_TAB_META[tab];
            const count = tab === "ALL" ? visibleItems.length : (countByLane[tab as QueueLane] ?? 0);
            const isActive = activeTab === tab;
            const isEmpty = count === 0 && tab !== "ALL";

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-default",
                  isActive
                    ? "border border-slate-200 bg-white text-slate-900 shadow-sm"
                    : isEmpty
                      ? "cursor-default text-slate-300"
                      : "text-slate-500 hover:bg-white/70 hover:text-slate-800",
                )}
              >
                {meta.label}
                <span
                  className={cn(
                    "inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                    isActive
                      ? "bg-slate-100 text-slate-600"
                      : isEmpty
                        ? "text-slate-300"
                        : tab === "NEEDS_ACTION" && count > 0
                          ? "text-white"
                          : "bg-slate-100 text-slate-500",
                  )}
                  style={
                    tab === "NEEDS_ACTION" && count > 0 && !isActive
                      ? { backgroundColor: "#E8584A" }
                      : undefined
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-slate-100 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em]"
          style={{ color: "#94A3B8", backgroundColor: "#F8FAFC" }}
        >
          <span>Owner</span>
          <span>Work item</span>
          <span />
        </div>

        {filteredItems.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm" style={{ color: "#64748B" }}>
            {hidePublished ? "No non-published items match this view right now." : "No items in this lane right now."}
          </p>
        ) : (
          <div>
            {filteredItems.map((item, index) => (
              <QueueRow key={item.id} item={item} index={index} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
