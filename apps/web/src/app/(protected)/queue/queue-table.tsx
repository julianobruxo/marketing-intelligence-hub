"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, EyeOff, Image as ImageIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPublishedPreview } from "@/modules/content-catalog/application/content-preview";
import {
  isDesignRejection,
  getSemanticWorkflowDecision,
  getShortActionPhrase,
} from "@/modules/content-catalog/application/content-workflow-view-model";
import type {
  QueueLane,
  QueueLaneSection,
} from "@/modules/content-catalog/application/content-workflow-view-model";
import { readOperationalStatusFromPlanningSnapshot } from "@/modules/content-intake/domain/infer-content-status";
import { formatOperationalLabel, getQueueStatePresentation } from "@/shared/ui/operational-status";
import { StatusBadge } from "@/shared/ui/status-badge";

type DecoratedItem = QueueLaneSection["items"][number];
type LaneTab = QueueLane | "ALL";

const LANE_ORDER: QueueLane[] = ["NEEDS_ACTION", "BLOCKED", "FAILED", "IN_PROGRESS", "READY"];

const ACTIVE_TAB_CLASS =
  "border-transparent bg-[linear-gradient(135deg,#7c5cfc,#a78bfa)] text-white shadow-[0_2px_12px_rgba(124,92,252,0.35)] hover:brightness-[1.08] dark:bg-[linear-gradient(135deg,#7c5cfc,#9b6dff)] dark:shadow-[0_2px_16px_rgba(124,92,252,0.45)]";



const LANE_TAB_META: Record<
  LaneTab,
  {
    label: string;
    accentClass: string;
    idleClass: string;
    activeClass: string;
    countClass: string;
    idleCountClass: string;
  }
> = {
  ALL: {
    label: "All Items",
    accentClass: "text-violet-700 dark:text-violet-400",
    idleClass:
      "border-violet-200/85 bg-[linear-gradient(135deg,rgba(237,233,255,0.9),rgba(221,214,255,0.7))] text-violet-800 hover:scale-[1.03] hover:brightness-110 dark:border-[rgba(124,92,252,0.25)] dark:bg-[rgba(124,92,252,0.08)] dark:text-[#9b6dff]",
    activeClass: ACTIVE_TAB_CLASS,
    countClass: "bg-white/20 text-white font-bold",
    idleCountClass: "bg-violet-100/70 text-violet-700 font-bold dark:bg-[rgba(139,92,246,0.12)] dark:text-violet-400",
  },
  NEEDS_ACTION: {
    label: "Action",
    accentClass: "text-[#ea6d0e] dark:text-[#fb923c]",
    idleClass:
      "border-[rgba(251,146,60,0.4)] bg-[linear-gradient(135deg,rgba(251,146,60,0.18),rgba(249,115,22,0.12))] text-[#ea6d0e] hover:scale-[1.03] hover:brightness-110 dark:border-[rgba(251,146,60,0.35)] dark:bg-[linear-gradient(135deg,rgba(251,146,60,0.14),rgba(249,115,22,0.08))] dark:text-[#fb923c]",
    activeClass: ACTIVE_TAB_CLASS,
    countClass: "bg-white/20 text-white font-bold",
    idleCountClass: "bg-[rgba(251,146,60,0.14)] text-[#ea6d0e] font-bold dark:bg-[rgba(251,146,60,0.12)] dark:text-[#fb923c]",
  },
  FAILED: {
    label: "Overdue",
    accentClass: "text-[#be123c] dark:text-[#fb7185]",
    idleClass:
      "border-[rgba(225,29,72,0.35)] bg-[linear-gradient(135deg,rgba(225,29,72,0.14),rgba(190,18,60,0.08))] text-[#be123c] hover:scale-[1.03] hover:brightness-110 dark:border-[rgba(244,63,94,0.35)] dark:bg-[linear-gradient(135deg,rgba(244,63,94,0.12),rgba(190,18,60,0.06))] dark:text-[#fb7185]",
    activeClass: ACTIVE_TAB_CLASS,
    countClass: "bg-white/20 text-white font-bold",
    idleCountClass: "bg-[rgba(225,29,72,0.1)] text-[#be123c] font-bold dark:bg-[rgba(244,63,94,0.1)] dark:text-[#fb7185]",
  },
  BLOCKED: {
    label: "Blocked",
    accentClass: "text-[#b45309] dark:text-[#fbbf24]",
    idleClass:
      "border-[rgba(245,158,11,0.4)] bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(217,119,6,0.1))] text-[#b45309] hover:scale-[1.03] hover:brightness-110 dark:border-[rgba(245,158,11,0.35)] dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.06))] dark:text-[#fbbf24]",
    activeClass: ACTIVE_TAB_CLASS,
    countClass: "bg-white/20 text-white font-bold",
    idleCountClass: "bg-[rgba(245,158,11,0.12)] text-[#b45309] font-bold dark:bg-[rgba(245,158,11,0.1)] dark:text-[#fbbf24]",
  },
  IN_PROGRESS: {
    label: "In Motion",
    accentClass: "text-[#1d4ed8] dark:text-[#60a5fa]",
    idleClass:
      "border-[rgba(59,130,246,0.4)] bg-[linear-gradient(135deg,rgba(59,130,246,0.15),rgba(37,99,235,0.08))] text-[#1d4ed8] hover:scale-[1.03] hover:brightness-110 dark:border-[rgba(96,165,250,0.35)] dark:bg-[linear-gradient(135deg,rgba(96,165,250,0.12),rgba(37,99,235,0.06))] dark:text-[#60a5fa]",
    activeClass: ACTIVE_TAB_CLASS,
    countClass: "bg-white/20 text-white font-bold",
    idleCountClass: "bg-[rgba(59,130,246,0.1)] text-[#1d4ed8] font-bold dark:bg-[rgba(96,165,250,0.1)] dark:text-[#60a5fa]",
  },
  READY: {
    label: "Complete",
    accentClass: "text-[#047857] dark:text-[#34d399]",
    idleClass:
      "border-[rgba(16,185,129,0.4)] bg-[linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.08))] text-[#047857] hover:scale-[1.03] hover:brightness-110 dark:border-[rgba(52,211,153,0.35)] dark:bg-[linear-gradient(135deg,rgba(52,211,153,0.12),rgba(5,150,105,0.06))] dark:text-[#34d399]",
    activeClass: ACTIVE_TAB_CLASS,
    countClass: "bg-white/20 text-white font-bold",
    idleCountClass: "bg-[rgba(16,185,129,0.1)] text-[#047857] font-bold dark:bg-[rgba(52,211,153,0.1)] dark:text-[#34d399]",
  },
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

/**
 * Extracts the owner name from a spreadsheet name following the "SMM Plan | Owner Name" convention.
 * This is the authoritative source for owner identity — avoids profile-enum guesses.
 */
function extractOwnerFromSpreadsheetName(spreadsheetName: string | null): string | null {
  if (!spreadsheetName) return null;
  const pipeIndex = spreadsheetName.indexOf("|");
  if (pipeIndex === -1) return null;
  const owner = spreadsheetName.slice(pipeIndex + 1).trim();
  return owner.length > 0 ? owner : null;
}

function profileBadgeStyle(profile: string): CSSProperties {
  switch (profile) {
    case "YANN":
      return { backgroundColor: "rgba(219, 234, 254, 0.92)", color: "#1D4ED8" };
    case "YURI":
      return { backgroundColor: "rgba(254, 226, 226, 0.92)", color: "#B91C1C" };
    case "SHAWN":
      return { backgroundColor: "rgba(209, 250, 229, 0.92)", color: "#047857" };
    case "SOPHIAN_YACINE":
      return { backgroundColor: "rgba(237, 233, 254, 0.92)", color: "#7C3AED" };
    case "ZAZMIC_PAGE":
      return { backgroundColor: "rgba(255, 237, 213, 0.94)", color: "#C2410C" };
    default:
      return { backgroundColor: "rgba(241, 245, 249, 0.95)", color: "#475569" };
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

function getSpreadsheetName(item: DecoratedItem): string | null {
  const snapshot = readRecord(item.planningSnapshot);
  const source = readRecord(snapshot?.source);
  const name = typeof source?.spreadsheetName === "string" && source.spreadsheetName.trim().length > 0
    ? source.spreadsheetName.trim()
    : null;
  return name;
}

function getSourceLabel(item: DecoratedItem): string {
  const sourceLink = item.sourceLinks[0];

  if (!sourceLink) {
    return "Drive source unavailable";
  }

  const spreadsheetName = getSpreadsheetName(item);
  return spreadsheetName ?? sourceLink.worksheetName ?? "Drive source";
}

function getOperationalStatusLabel(item: DecoratedItem) {
  return readOperationalStatusFromPlanningSnapshot(item.planningSnapshot);
}

function getQueueActionLabel(item: DecoratedItem) {
  const semanticDecision = getSemanticWorkflowDecision(item);
  if (semanticDecision) {
    return semanticDecision.nextActionLabel;
  }

  const base = getShortActionPhrase(item);

  switch (base) {
    case "Awaiting Copy":
      return "Await Copy";
    case "Start Design":
    case "Send to Design":
      return "Generate Design";
    case "Check Translation":
    case "Approve Translation":
      return "Review Translation";
    case "Complete":
      return "POSTED";
    default:
      return base;
  }
}

function isPublishedItem(item: DecoratedItem) {
  const semanticDecision = getSemanticWorkflowDecision(item);
  if (semanticDecision) {
    return semanticDecision.baseVisualFamily === "green";
  }

  const operationalStatus = getOperationalStatusLabel(item);
  return (
    operationalStatus === "POSTED" ||
    operationalStatus === "PUBLISHED" ||
    item.currentStatus === "PUBLISHED_MANUALLY" ||
    item.currentStatus === "POSTED"
  );
}

function isQuietRow(
  item: DecoratedItem,
  semanticDecision: ReturnType<typeof getSemanticWorkflowDecision>,
) {
  if (semanticDecision) {
    return semanticDecision.baseVisualFamily === "green";
  }

  return item.lane === "READY" || isPublishedItem(item);
}

function isAwaitingDesignRow(
  item: DecoratedItem,
  semanticDecision: ReturnType<typeof getSemanticWorkflowDecision>,
  nextAction: string,
  primaryStatus: string,
) {
  if (semanticDecision) {
    return semanticDecision.baseVisualFamily === "lavender";
  }

  const activePurpleStatuses = new Set([
    "READY_FOR_DESIGN",
    "IN_DESIGN",
    "DESIGN_READY",
    "DESIGN_APPROVED",
    "CONTENT_APPROVED",
  ]);

  return (
    !isQuietRow(item, semanticDecision) &&
    (nextAction === "Generate Design" ||
      nextAction === "In Design" ||
      nextAction === "Approve Design" ||
      nextAction === "Pending Approval" ||
      activePurpleStatuses.has(primaryStatus) ||
      activePurpleStatuses.has(item.currentStatus))
  );
}

function getRowStateClass(item: DecoratedItem, quietRow: boolean, awaitingDesign: boolean) {
  if (quietRow) {
    return "queue-row-ready";
  }

  if (awaitingDesign) {
    return "queue-row-design-prep";
  }

  switch (item.lane) {
    case "NEEDS_ACTION":
      return "queue-row-needs-action";
    case "FAILED":
      return "queue-row-failed";
    case "BLOCKED":
      return "queue-row-blocked";
    case "IN_PROGRESS":
      return "queue-row-progress";
    case "READY":
      return "queue-row-ready";
  }
}

const DARK_NEXT = "dark:border-[rgba(180,100,255,0.3)] dark:bg-[rgba(180,100,255,0.15)] dark:text-[#c084fc]";

function getNextActionClasses(_item: DecoratedItem, _awaitingDesign: boolean) {
  return `border-[rgba(167,139,250,0.35)] bg-[rgba(167,139,250,0.15)] text-[#7c5cfc] ${DARK_NEXT}`;
}

const DARK_CARD = "dark:rounded-[12px] dark:border-[rgba(255,255,255,0.07)] dark:bg-[linear-gradient(135deg,rgba(45,35,75,0.8)_0%,rgba(28,22,55,0.6)_100%)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.3)] dark:group-hover:border-[rgba(124,92,252,0.2)] dark:group-hover:shadow-[inset_0_0_0_1px_rgba(124,92,252,0.15),0_2px_20px_rgba(0,0,0,0.3)]";
const DARK_SHELL = "dark:border-[rgba(180,100,255,0.22)] dark:bg-[rgba(180,100,255,0.12)] dark:text-[#c084fc] dark:group-hover:border-[rgba(180,100,255,0.4)] dark:group-hover:bg-[rgba(180,100,255,0.18)]";
const DARK_ICON = "dark:border-[rgba(180,100,255,0.28)] dark:bg-[rgba(180,100,255,0.18)] dark:text-white";

function getRowSurfaceClasses(item: DecoratedItem, quietRow: boolean, awaitingDesign: boolean) {
  if (quietRow) {
    return `border-[rgba(16,185,129,0.18)] bg-[linear-gradient(135deg,rgba(209,250,229,0.5)_0%,rgba(236,253,245,0.3)_100%)] shadow-[0_2px_8px_rgba(16,185,129,0.07)] ${DARK_CARD}`;
  }
  if (awaitingDesign) {
    return `border-[rgba(180,160,255,0.2)] bg-[linear-gradient(135deg,rgba(237,233,255,0.7)_0%,rgba(245,240,255,0.4)_100%)] shadow-[0_2px_8px_rgba(120,100,200,0.08)] ${DARK_CARD}`;
  }
  switch (item.lane) {
    case "NEEDS_ACTION":
      return `border-[rgba(251,146,60,0.2)] bg-[linear-gradient(135deg,rgba(255,237,213,0.6)_0%,rgba(255,247,237,0.3)_100%)] shadow-[0_2px_8px_rgba(249,115,22,0.07)] ${DARK_CARD}`;
    case "FAILED":
      return `border-[rgba(244,63,94,0.2)] bg-[linear-gradient(135deg,rgba(255,228,230,0.6)_0%,rgba(255,241,242,0.3)_100%)] shadow-[0_2px_8px_rgba(225,29,72,0.07)] ${DARK_CARD}`;
    case "BLOCKED":
      return `border-[rgba(245,158,11,0.2)] bg-[linear-gradient(135deg,rgba(254,243,199,0.6)_0%,rgba(255,251,235,0.3)_100%)] shadow-[0_2px_8px_rgba(245,158,11,0.07)] ${DARK_CARD}`;
    case "IN_PROGRESS":
      return `border-[rgba(59,130,246,0.2)] bg-[linear-gradient(135deg,rgba(219,234,254,0.6)_0%,rgba(239,246,255,0.3)_100%)] shadow-[0_2px_8px_rgba(59,130,246,0.07)] ${DARK_CARD}`;
    case "READY":
      return `border-[rgba(16,185,129,0.18)] bg-[linear-gradient(135deg,rgba(209,250,229,0.5)_0%,rgba(236,253,245,0.3)_100%)] shadow-[0_2px_8px_rgba(16,185,129,0.07)] ${DARK_CARD}`;
    default:
      return `border-[rgba(180,160,255,0.2)] bg-[linear-gradient(135deg,rgba(237,233,255,0.7)_0%,rgba(245,240,255,0.4)_100%)] shadow-[0_2px_8px_rgba(120,100,200,0.08)] ${DARK_CARD}`;
  }
}

function getActionShellClasses(item: DecoratedItem, quietRow: boolean, awaitingDesign: boolean) {
  if (quietRow) {
    return `border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.12)] text-[#047857] group-hover:border-[rgba(16,185,129,0.5)] ${DARK_SHELL}`;
  }
  if (awaitingDesign) {
    return `border-[rgba(167,139,250,0.25)] bg-[rgba(167,139,250,0.12)] text-[#7c5cfc] group-hover:border-[rgba(167,139,250,0.4)] ${DARK_SHELL}`;
  }
  switch (item.lane) {
    case "NEEDS_ACTION":
      return `border-[rgba(251,146,60,0.3)] bg-[rgba(251,146,60,0.12)] text-[#ea6d0e] group-hover:border-[rgba(251,146,60,0.5)] ${DARK_SHELL}`;
    case "BLOCKED":
      return `border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.12)] text-[#b45309] group-hover:border-[rgba(245,158,11,0.5)] ${DARK_SHELL}`;
    case "FAILED":
      return `border-[rgba(244,63,94,0.3)] bg-[rgba(244,63,94,0.12)] text-[#be123c] group-hover:border-[rgba(244,63,94,0.5)] ${DARK_SHELL}`;
    case "IN_PROGRESS":
      return `border-[rgba(59,130,246,0.3)] bg-[rgba(59,130,246,0.12)] text-[#1d4ed8] group-hover:border-[rgba(59,130,246,0.5)] ${DARK_SHELL}`;
    case "READY":
      return `border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.12)] text-[#047857] group-hover:border-[rgba(16,185,129,0.5)] ${DARK_SHELL}`;
    default:
      return `border-[rgba(167,139,250,0.25)] bg-[rgba(167,139,250,0.12)] text-[#7c5cfc] group-hover:border-[rgba(167,139,250,0.4)] ${DARK_SHELL}`;
  }
}

function getActionIconClasses(item: DecoratedItem, quietRow: boolean, awaitingDesign: boolean) {
  if (quietRow) {
    return `border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.18)] text-[#047857] group-hover:bg-[rgba(16,185,129,0.28)] ${DARK_ICON}`;
  }
  if (awaitingDesign) {
    return `border-[rgba(167,139,250,0.3)] bg-[rgba(167,139,250,0.15)] text-[#7c5cfc] group-hover:bg-[rgba(167,139,250,0.25)] ${DARK_ICON}`;
  }
  switch (item.lane) {
    case "NEEDS_ACTION":
      return `border-[rgba(251,146,60,0.35)] bg-[rgba(251,146,60,0.18)] text-[#ea6d0e] group-hover:bg-[rgba(251,146,60,0.28)] ${DARK_ICON}`;
    case "BLOCKED":
      return `border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.18)] text-[#b45309] group-hover:bg-[rgba(245,158,11,0.28)] ${DARK_ICON}`;
    case "FAILED":
      return `border-[rgba(244,63,94,0.35)] bg-[rgba(244,63,94,0.18)] text-[#be123c] group-hover:bg-[rgba(244,63,94,0.28)] ${DARK_ICON}`;
    case "IN_PROGRESS":
      return `border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.18)] text-[#1d4ed8] group-hover:bg-[rgba(59,130,246,0.28)] ${DARK_ICON}`;
    case "READY":
      return `border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.18)] text-[#047857] group-hover:bg-[rgba(16,185,129,0.28)] ${DARK_ICON}`;
    default:
      return `border-[rgba(167,139,250,0.3)] bg-[rgba(167,139,250,0.15)] text-[#7c5cfc] group-hover:bg-[rgba(167,139,250,0.25)] ${DARK_ICON}`;
  }
}

function QueueRow({ item, index }: { item: DecoratedItem; index: number }) {
  const delay = Math.min(index * 28, 280);
  const semanticDecision = getSemanticWorkflowDecision(item);
  const operationalStatus = getOperationalStatusLabel(item);
  const primaryStatus = isDesignRejection(item)
    ? item.currentStatus
    : semanticDecision?.statusKey ?? operationalStatus ?? item.currentStatus;
  const planning = getPlanningDetails(item);
  const itemDate = getItemDate(item);
  const nextAction = getQueueActionLabel(item);
  const publishedPreview = isPublishedItem(item)
    ? getPublishedPreview({ planningSnapshot: item.planningSnapshot, assets: item.assets })
    : null;
  const queueState = getQueueStatePresentation(
    isPublishedItem(item) ? "POSTED" : operationalStatus ?? semanticDecision?.statusKey ?? item.currentStatus,
  );
  const quietRow = isQuietRow(item, semanticDecision);
  const awaitingDesign = isAwaitingDesignRow(item, semanticDecision, nextAction, primaryStatus);
  const hasOverdueOverlay = semanticDecision?.overdueOverlay ?? primaryStatus === "LATE";
  const sourceLabel = getSourceLabel(item);
  const rowStateClass = getRowStateClass(item, quietRow, awaitingDesign);

  return (
    <Link
      href={`/queue/${item.id}`}
      data-testid="queue-item"
      className={cn(
        "queue-row group relative block border-b border-[rgba(180,160,255,0.12)] px-3 py-2.5 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cfc] focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:px-4 dark:border-[rgba(255,255,255,0.04)] dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-[#060B18]",
        rowStateClass,
      )}
      style={{ animationDelay: `${delay}ms` }}
      title={sourceLabel}
    >
      <div
        className={cn(
          "queue-card grid items-start gap-3 rounded-[14px] border border-transparent px-2.5 py-2.5 transition-default sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-3 sm:py-3",
          getRowSurfaceClasses(item, quietRow, awaitingDesign),
        )}
      >
        <div className="flex items-start gap-2.5 sm:flex-col">
          <div className="flex items-center gap-1.5 sm:flex-col sm:items-start">
            <span
              className="inline-flex items-center rounded-full border border-white/80 px-2 py-0.5 text-[10px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-sm dark:border-white/10 dark:opacity-85"
              style={profileBadgeStyle(item.profile)}
            >
              {extractOwnerFromSpreadsheetName(getSpreadsheetName(item)) ?? formatProfileLabel(item.profile)}
            </span>
            <span className="text-[10px] font-medium tracking-[0.06em] text-[#9ca3af] uppercase sm:hidden dark:text-[rgba(255,255,255,0.35)]">
              {formatDate(itemDate)}
            </span>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="font-medium uppercase tracking-[0.12em] text-[#9ca3af] dark:text-[rgba(255,255,255,0.35)]">
                  {item.lane === "READY" ? "Closed item" : "Queue item"}
                </span>
                <span className="hidden h-1 w-1 rounded-full bg-[rgba(160,140,220,0.3)] dark:bg-[rgba(255,255,255,0.12)] sm:inline-flex" aria-hidden="true" />
                <span className="hidden text-[10px] font-medium tracking-[0.06em] text-[#9ca3af] uppercase dark:text-[rgba(255,255,255,0.35)] sm:inline-flex">
                  {formatDate(itemDate)}
                </span>
              </div>

              <p
                className={cn(
                  "max-w-3xl text-[15px] leading-5.5 font-semibold tracking-[-0.015em] sm:text-base",
                  quietRow ? "text-[#374151] dark:text-[rgba(255,255,255,0.55)]" : "text-[#0f172a] dark:text-white",
                )}
              >
                {item.title}
              </p>
            </div>

            {queueState ? (
              <StatusBadge
                variant={queueState.tone}
                label={queueState.label}
                size="xs"
                className="shrink-0"
              />
            ) : quietRow ? (
              <StatusBadge
                variant="emerald"
                label={formatOperationalLabel(primaryStatus)}
                size="xs"
                className="shrink-0"
              />
            ) : awaitingDesign ? (
              <StatusBadge
                variant="violet"
                label={formatOperationalLabel(primaryStatus)}
                size="xs"
                className="shrink-0"
              />
            ) : (
              <StatusBadge status={primaryStatus} size="xs" className="shrink-0" />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 font-semibold",
                getNextActionClasses(item, awaitingDesign),
              )}
            >
              Next: {nextAction}
            </span>

            {planning.deadline ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 font-medium",
                  hasOverdueOverlay
                    ? "border-[#e85d6a] bg-[rgba(232,93,106,0.08)] text-[#e85d6a] dark:border-[rgba(225,29,72,0.3)] dark:bg-[linear-gradient(180deg,rgba(48,8,18,1),rgba(58,10,22,0.98))] dark:text-rose-300"
                    : "border-[rgba(0,0,0,0.1)] bg-[rgba(0,0,0,0.04)] text-[#374151] dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(255,255,255,0.05)] dark:text-[rgba(255,255,255,0.45)]",
                )}
              >
                Due {formatDateLabel(planning.deadline)}
              </span>
            ) : planning.plannedDate ? (
              <span className="inline-flex items-center rounded-full border border-[rgba(0,0,0,0.1)] bg-[rgba(0,0,0,0.04)] px-2 py-0.5 font-medium text-[#374151] dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(255,255,255,0.05)] dark:text-[rgba(255,255,255,0.45)]">
                Planned {formatDateLabel(planning.plannedDate)}
              </span>
            ) : null}

            {publishedPreview ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(0,0,0,0.1)] bg-[rgba(0,0,0,0.04)] px-2 py-0.5 font-medium text-[#374151] dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(255,255,255,0.05)] dark:text-[rgba(255,255,255,0.45)]">
                <ImageIcon className="h-3 w-3" />
                Preview
              </span>
            ) : null}
          </div>

          <p className={cn("truncate text-[11px] text-[#9ca3af] dark:text-[rgba(255,255,255,0.3)]", quietRow && "opacity-80 dark:text-[rgba(255,255,255,0.22)]")}>
            {sourceLabel}
          </p>
        </div>

        <div className="flex sm:items-start">
          <span
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-1.5 py-1 text-[11px] font-semibold transition-default sm:min-w-[6rem] sm:justify-between",
              getActionShellClasses(item, quietRow, awaitingDesign),
            )}
          >
            <span className="hidden sm:inline">Details</span>
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border transition-default",
                getActionIconClasses(item, quietRow, awaitingDesign),
              )}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

interface QueueTableProps {
  sections: QueueLaneSection[];
  canClearQueue: boolean;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string } | null;
    const errorMessage =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : "";

    return errorMessage.trim().length > 0 ? errorMessage : fallback;
  } catch {
    return fallback;
  }
}

export function QueueTable({ sections, canClearQueue }: QueueTableProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LaneTab>("ALL");
  const [hidePublished, setHidePublished] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearQueueError, setClearQueueError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!showConfirm) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-clear-queue]")) {
        setShowConfirm(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !clearing) {
        setShowConfirm(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [clearing, showConfirm]);

  const confirmClearQueue = async () => {
    try {
      setClearing(true);
      setClearQueueError(null);

      const tokenResponse = await fetch("/api/queue/clear", {
        method: "GET",
        credentials: "same-origin",
      });

      if (!tokenResponse.ok) {
        setClearQueueError(await readErrorMessage(tokenResponse, "Unable to request a confirmation token."));
        return;
      }

      const tokenPayload = (await tokenResponse.json().catch(() => null)) as
        | { confirmationToken?: string }
        | null;
      const confirmationToken =
        typeof tokenPayload?.confirmationToken === "string" ? tokenPayload.confirmationToken.trim() : "";

      if (!confirmationToken) {
        setClearQueueError("Confirmation token missing.");
        return;
      }

      const response = await fetch("/api/queue/clear", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmationToken }),
      });

      if (!response.ok) {
        setClearQueueError(await readErrorMessage(response, "Unable to clear the queue."));
        return;
      }

      setShowConfirm(false);
      setClearQueueError(null);
      router.refresh();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-3 animate-fade-in-up" data-testid="queue-container">
      <section className="app-surface-panel overflow-visible rounded-[28px]">
        <div className="border-b border-[var(--surface-border)] px-4 py-3.5 sm:px-5 dark:border-[rgba(255,255,255,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9ca3af] dark:text-[#8B97B7]">
                Queue Controls
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#0f172a] dark:text-slate-100 sm:text-xl">
                  Operational list
                </h2>
                <span className="app-control-pill inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-[#374151] dark:text-[#96A7C9]">
                  {filteredItems.length} visible
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHidePublished((current) => !current)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A66C2] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-[#060B18]",
                  hidePublished
                    ? "border-sky-300/35 bg-[linear-gradient(180deg,rgba(82,122,205,0.94),rgba(95,136,219,0.92))] text-white shadow-[0_18px_36px_-26px_rgba(73,110,184,0.45)] dark:border-indigo-400/35 dark:bg-[linear-gradient(180deg,rgba(109,102,255,0.9),rgba(93,108,236,0.85))] dark:shadow-[0_18px_36px_-26px_rgba(95,102,241,0.44)]"
                    : "app-control-pill text-[#374151] dark:text-[#B7C3E7]",
                )}
              >
                <EyeOff className="h-4 w-4" />
                Hide published
              </button>

              {canClearQueue ? (
                <div className="relative" data-clear-queue>
                  <button
                    type="button"
                    onClick={() => {
                      setClearQueueError(null);
                      setShowConfirm(true);
                    }}
                    className="app-control-pill inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[#374151] transition-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cfc] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-[#B7C3E7] dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-[#060B18]"
                    disabled={clearing}
                    aria-expanded={showConfirm}
                    aria-controls={showConfirm ? "clear-queue-confirm-popover" : undefined}
                  >
                    Clean Queue
                  </button>

                  {showConfirm ? (
                    <div
                      id="clear-queue-confirm-popover"
                      className="absolute right-0 top-full z-50 mt-1 flex w-52 flex-col gap-2 rounded-lg border border-border bg-popover p-3 shadow-md"
                    >
                      <p className="text-xs font-medium text-popover-foreground">
                        Remove all items from queue?
                      </p>
                      {clearQueueError ? (
                        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                          {clearQueueError}
                        </p>
                      ) : null}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setClearQueueError(null);
                            setShowConfirm(false);
                          }}
                          disabled={clearing}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={confirmClearQueue}
                          disabled={clearing}
                        >
                          {clearing ? "Clearing..." : "Confirm"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((tab) => {
              const meta = LANE_TAB_META[tab];
              const count = tab === "ALL" ? visibleItems.length : (countByLane[tab as QueueLane] ?? 0);
              const isActive = activeTab === tab;
              const isEmpty = count === 0 && tab !== "ALL";

              return (
                <button
                  key={tab}
                  type="button"
                  data-lane={tab}
                  data-state={isActive ? "active" : isEmpty ? "empty" : "idle"}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "min-h-[40px] min-w-[7.5rem] rounded-full border px-[18px] py-2 text-left transition-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cfc] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-[#060B18] sm:min-w-[8.25rem]",
                    isActive
                      ? meta.activeClass
                      : isEmpty
                        ? "cursor-default border-transparent bg-transparent opacity-45 pointer-events-none"
                        : meta.idleClass,
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-xs font-semibold tracking-[-0.01em]",
                          !isActive && meta.accentClass,
                        )}
                      >
                        {meta.label}
                      </p>
                    </div>

                    <span
                      className={cn(
                        "inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px]",
                        isActive ? meta.countClass : meta.idleCountClass,
                      )}
                    >
                      {count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="app-surface-panel overflow-hidden rounded-[30px]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-sky-200/70 bg-[linear-gradient(180deg,rgba(248,251,255,0.98),rgba(239,246,255,0.82))] px-4 py-2.5 sm:px-5 dark:border-[rgba(255,255,255,0.06)] dark:bg-[rgba(255,255,255,0.02)]">
          <div className="flex items-center gap-2">
            <p className="queue-active-label text-[10px] font-bold uppercase tracking-[0.16em] text-[#9ca3af]">
              Active queue
            </p>
          </div>
          <span className="hidden rounded-full border border-[rgba(167,139,250,0.25)] bg-[rgba(167,139,250,0.08)] px-2.5 py-0.5 text-[11px] font-semibold text-[#7c5cfc] sm:inline-flex dark:border-[rgba(180,100,255,0.25)] dark:bg-[rgba(180,100,255,0.1)] dark:text-[#c084fc]">
            {filteredItems.length} items
          </span>
        </div>

        {filteredItems.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-500">
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
