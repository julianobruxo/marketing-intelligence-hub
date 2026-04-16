"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getShortActionPhrase } from "@/modules/content-catalog/application/content-workflow-view-model";
import type { QueueLane, QueueLaneSection } from "@/modules/content-catalog/application/content-workflow-view-model";

// ─── Types ────────────────────────────────────────────────────────────────────

type DecoratedItem = QueueLaneSection["items"][number];

type LaneTab = QueueLane | "ALL";

// ─── Constants ────────────────────────────────────────────────────────────────

const LANE_ORDER: QueueLane[] = [
  "NEEDS_ACTION",
  "FAILED",
  "BLOCKED",
  "IN_PROGRESS",
  "READY",
];

const LANE_TAB_META: Record<
  LaneTab,
  { label: string; priority: number }
> = {
  ALL: { label: "All", priority: -1 },
  NEEDS_ACTION: { label: "Needs Action", priority: 0 },
  FAILED: { label: "Recovery", priority: 1 },
  BLOCKED: { label: "Blocked", priority: 2 },
  IN_PROGRESS: { label: "In Motion", priority: 3 },
  READY: { label: "Ready", priority: 4 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function profileBadgeStyle(profile: string): React.CSSProperties {
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

function statusDotClass(lane: QueueLane): string {
  switch (lane) {
    case "NEEDS_ACTION":
      return "bg-[#0A66C2]";
    case "IN_PROGRESS":
      return "bg-amber-400";
    case "FAILED":
      return "bg-rose-500";
    case "BLOCKED":
      return "bg-amber-500";
    case "READY":
      return "bg-emerald-500";
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

function isUrgentLane(lane: QueueLane): boolean {
  return lane === "NEEDS_ACTION" || lane === "FAILED";
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

// ─── Row Component ────────────────────────────────────────────────────────────

function QueueRow({ item, index }: { item: DecoratedItem; index: number }) {
  const date = getItemDate(item);
  const delay = Math.min(index * 30, 300);
  const urgent = isUrgentLane(item.lane);

  return (
    <Link
      href={`/queue/${item.id}`}
      className={cn(
        "queue-row group grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-4 border-b border-slate-100 px-5 py-3.5 last:border-b-0 animate-fade-in-row",
        laneRowClass(item.lane),
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Profile badge */}
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
        style={profileBadgeStyle(item.profile)}
      >
        {formatProfileLabel(item.profile)}
      </span>

      {/* Type badge */}
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-500 whitespace-nowrap">
        {item.contentType === "STATIC_POST" ? "Static" : "Carousel"}
      </span>

      {/* Title — primary scannable text */}
      <p className="truncate text-[15px] font-medium whitespace-nowrap" style={{ color: "#0F172A" }}>
        {item.title}
      </p>

      {/* Status */}
      <div className="hidden items-center gap-1.5 sm:flex whitespace-nowrap">
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full flex-shrink-0",
            statusDotClass(item.lane),
            urgent ? "status-dot-urgent" : "",
          )}
        />
        <span className="text-xs" style={{ color: "#64748B" }}>
          {formatStatusLabel(item.currentStatus)}
        </span>
      </div>

      {/* Short action */}
      <span className="hidden text-xs font-medium md:block whitespace-nowrap" style={{ color: "#64748B" }}>
        {getShortActionPhrase(item)}
      </span>

      {/* Date */}
      <span className="hidden text-[13px] lg:block whitespace-nowrap" style={{ color: "#94A3B8" }}>
        {formatDate(date)}
      </span>

      {/* Open icon */}
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white transition-default group-hover:border-slate-900 group-hover:bg-slate-950 group-hover:text-white"
        style={{ color: "#94A3B8" }}
      >
        <ArrowUpRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface QueueTableProps {
  sections: QueueLaneSection[];
  totalItems: number;
}

export function QueueTable({ sections, totalItems }: QueueTableProps) {
  const [activeTab, setActiveTab] = useState<LaneTab>("ALL");

  // Build flat decorated items list from sections
  const allItems: DecoratedItem[] = sections.flatMap((s) => s.items);

  // Count per lane
  const countByLane: Partial<Record<QueueLane, number>> = {};
  for (const section of sections) {
    countByLane[section.lane] = section.count;
  }

  // Items to render
  const filteredItems =
    activeTab === "ALL"
      ? sortItems(allItems)
      : sortItems(allItems.filter((item) => item.lane === activeTab));

  const tabs: LaneTab[] = ["ALL", ...LANE_ORDER];

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* ── Dashboard strip ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px]" style={{ color: "#94A3B8" }}>
            Pipeline #1 operating queue ·{" "}
            <span className="font-medium" style={{ color: "#64748B" }}>
              {totalItems} live {totalItems === 1 ? "item" : "items"}
            </span>{" "}
            · Queue first
          </p>
        </div>

        {/* Lane tabs */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const meta = LANE_TAB_META[tab];
            const count =
              tab === "ALL" ? totalItems : (countByLane[tab as QueueLane] ?? 0);
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
                    ? "bg-white shadow-sm border border-slate-200 text-slate-900"
                    : isEmpty
                      ? "cursor-default text-slate-300"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/70",
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

      {/* ── Item table ───────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Column header */}
        <div
          className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-4 border-b border-slate-100 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em]"
          style={{ color: "#94A3B8", backgroundColor: "#F8FAFC" }}
        >
          <span>Profile</span>
          <span>Type</span>
          <span>Title</span>
          <span className="hidden sm:block">Status</span>
          <span className="hidden md:block">Next action</span>
          <span className="hidden lg:block">Updated</span>
          <span />
        </div>

        {filteredItems.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm" style={{ color: "#64748B" }}>
            No items in this lane right now.
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
