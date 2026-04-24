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

const LANE_TAB_META: Record<
  LaneTab,
  {
    label: string;
    accentClass: string;
    idleClass: string;
    activeClass: string;
    countClass: string;
  }
> = {
  ALL: {
    label: "All Items",
    accentClass: "text-violet-700 dark:text-violet-400",
    idleClass:
      "border-violet-200/85 bg-[linear-gradient(180deg,rgba(250,245,255,0.98),rgba(243,232,255,0.92))] text-violet-800 hover:border-violet-300 hover:bg-[linear-gradient(180deg,rgba(248,245,255,1),rgba(237,233,254,0.94))] dark:border-[rgba(139,92,246,0.2)] dark:bg-[linear-gradient(180deg,rgba(22,12,48,0.95),rgba(30,15,60,0.92))] dark:text-violet-300 dark:hover:border-[rgba(139,92,246,0.3)] dark:hover:bg-[linear-gradient(180deg,rgba(25,14,54,0.98),rgba(35,18,68,0.96))]",
    activeClass:
      "border-violet-300/20 bg-[linear-gradient(135deg,rgba(109,40,217,0.94),rgba(124,58,237,0.9))] text-white shadow-[0_18px_40px_-28px_rgba(109,40,217,0.6)]",
    countClass: "bg-white/18 text-white",
  },
  NEEDS_ACTION: {
    label: "Action",
    accentClass: "text-violet-700 dark:text-violet-400",
    idleClass:
      "border-violet-200/85 bg-[linear-gradient(180deg,rgba(250,245,255,0.98),rgba(243,232,255,0.92))] text-violet-800 hover:border-violet-300 hover:bg-[linear-gradient(180deg,rgba(248,245,255,1),rgba(237,233,254,0.94))] dark:border-[rgba(139,92,246,0.2)] dark:bg-[linear-gradient(180deg,rgba(22,12,48,0.95),rgba(30,15,60,0.92))] dark:text-violet-300 dark:hover:border-[rgba(139,92,246,0.3)] dark:hover:bg-[linear-gradient(180deg,rgba(25,14,54,0.98),rgba(35,18,68,0.96))]",
    activeClass:
      "border-violet-300/20 bg-[linear-gradient(135deg,rgba(109,40,217,0.94),rgba(124,58,237,0.9))] text-white shadow-[0_18px_40px_-28px_rgba(109,40,217,0.6)]",
    countClass: "bg-white/18 text-white",
  },
  FAILED: {
    label: "Overdue",
    accentClass: "text-rose-500 dark:text-rose-400",
    idleClass:
      "border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,245,247,0.98),rgba(255,228,236,0.94))] text-rose-700 hover:border-rose-300 hover:bg-[linear-gradient(180deg,rgba(255,241,242,1),rgba(255,228,230,0.96))] dark:border-[rgba(225,29,72,0.2)] dark:bg-[linear-gradient(180deg,rgba(45,8,18,0.95),rgba(55,10,22,0.92))] dark:text-rose-300 dark:hover:border-[rgba(225,29,72,0.32)] dark:hover:bg-[linear-gradient(180deg,rgba(50,8,20,0.98),rgba(62,10,25,0.96))]",
    activeClass:
      "border-rose-500/20 bg-[linear-gradient(135deg,rgba(225,29,72,0.97),rgba(244,63,94,0.94))] text-rose-50 shadow-[0_18px_42px_-28px_rgba(225,29,72,0.82)]",
    countClass: "bg-white/18 text-rose-50",
  },
  BLOCKED: {
    label: "Blocked",
    accentClass: "text-amber-600 dark:text-amber-400",
    idleClass:
      "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.99),rgba(254,243,199,0.92))] text-amber-800 hover:border-amber-300 hover:bg-[linear-gradient(180deg,rgba(255,247,220,1),rgba(253,230,138,0.9))] dark:border-[rgba(245,158,11,0.2)] dark:bg-[linear-gradient(180deg,rgba(45,30,5,0.95),rgba(55,38,5,0.92))] dark:text-amber-300 dark:hover:border-[rgba(245,158,11,0.32)] dark:hover:bg-[linear-gradient(180deg,rgba(50,35,5,0.98),rgba(62,45,5,0.96))]",
    activeClass:
      "border-amber-500/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.96),rgba(251,191,36,0.92))] text-slate-950 shadow-[0_18px_42px_-28px_rgba(245,158,11,0.78)]",
    countClass: "bg-black/12 text-slate-950",
  },
  IN_PROGRESS: {
    label: "PA",
    accentClass: "text-sky-600 dark:text-sky-400",
    idleClass:
      "border-sky-200/80 bg-[linear-gradient(180deg,rgba(245,251,255,0.98),rgba(224,242,254,0.92))] text-sky-800 hover:border-sky-300 hover:bg-[linear-gradient(180deg,rgba(240,249,255,1),rgba(219,234,254,0.94))] dark:border-[rgba(56,189,248,0.15)] dark:bg-[linear-gradient(180deg,rgba(8,18,40,0.95),rgba(8,24,50,0.92))] dark:text-sky-300 dark:hover:border-[rgba(56,189,248,0.25)] dark:hover:bg-[linear-gradient(180deg,rgba(8,22,48,0.98),rgba(8,28,58,0.96))]",
    activeClass:
      "border-sky-500/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.97),rgba(10,102,194,0.92))] text-white shadow-[0_18px_42px_-28px_rgba(10,102,194,0.82)]",
    countClass: "bg-white/18 text-white",
  },
  READY: {
    label: "Complete",
    accentClass: "text-emerald-700 dark:text-emerald-400",
    idleClass:
      "border-emerald-200/85 bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(220,252,231,0.9))] text-emerald-800 hover:border-emerald-300 hover:bg-[linear-gradient(180deg,rgba(236,253,245,1),rgba(187,247,208,0.9))] dark:border-[rgba(52,211,153,0.15)] dark:bg-[linear-gradient(180deg,rgba(8,28,18,0.95),rgba(8,35,20,0.92))] dark:text-emerald-300 dark:hover:border-[rgba(52,211,153,0.25)] dark:hover:bg-[linear-gradient(180deg,rgba(8,32,20,0.98),rgba(8,42,24,0.96))]",
    activeClass:
      "border-lime-300/30 bg-[linear-gradient(135deg,rgba(132,204,22,0.94),rgba(163,230,53,0.9))] text-white shadow-[0_18px_38px_-30px_rgba(132,204,22,0.45)]",
    countClass: "bg-black/15 text-white",
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

function getNextActionClasses(item: DecoratedItem, awaitingDesign: boolean) {
  if (awaitingDesign) {
    return "border-violet-200 bg-[linear-gradient(180deg,rgba(245,243,255,1),rgba(233,213,255,0.98))] text-violet-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(139,92,246,0.3)] dark:bg-[linear-gradient(180deg,rgba(22,10,50,1),rgba(30,14,62,0.98))] dark:text-violet-300";
  }

  if (item.lane === "NEEDS_ACTION") {
    return "border-orange-200 bg-[linear-gradient(180deg,rgba(255,247,237,1),rgba(254,215,170,0.98))] text-orange-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(249,115,22,0.4)] dark:bg-[linear-gradient(180deg,rgba(234,88,12,0.9),rgba(194,65,12,0.8))] dark:text-orange-50";
  }

  if (item.lane === "FAILED") {
    return "border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,1),rgba(255,228,230,0.98))] text-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] dark:border-[rgba(225,29,72,0.5)] dark:bg-[linear-gradient(180deg,rgba(225,29,72,0.9),rgba(190,18,60,0.8))] dark:text-slate-50";
  }

  if (item.lane === "BLOCKED") {
    return "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1),rgba(254,240,180,0.98))] text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] dark:border-[rgba(245,158,11,0.3)] dark:bg-[linear-gradient(180deg,rgba(48,32,5,1),rgba(58,40,5,0.98))] dark:text-amber-300";
  }

  if (isPublishedItem(item)) {
    return "border-emerald-200 bg-[linear-gradient(180deg,rgba(240,253,244,1),rgba(220,252,231,0.98))] text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-[rgba(74,222,128,0.4)] dark:bg-[linear-gradient(180deg,rgba(22,163,74,0.9),rgba(21,128,61,0.8))] dark:text-white";
  }

  return "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,1),rgba(219,234,254,0.98))] text-sky-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] dark:border-[rgba(56,189,248,0.4)] dark:bg-[linear-gradient(180deg,rgba(2,132,199,0.9),rgba(3,105,161,0.8))] dark:text-white";
}

function getRowSurfaceClasses(item: DecoratedItem, quietRow: boolean, awaitingDesign: boolean) {
  if (quietRow) {
    return "border-emerald-200/90 bg-[linear-gradient(135deg,rgba(244,253,247,0.99),rgba(220,252,231,0.94))] shadow-[0_18px_42px_-34px_rgba(34,197,94,0.16),inset_0_1px_0_rgba(255,255,255,0.84)] dark:border-[rgba(52,211,153,0.18)] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.99),rgba(11,17,32,0.96))] dark:shadow-[0_18px_42px_-34px_rgba(52,211,153,0.15),inset_0_1px_0_rgba(255,255,255,0.02)]";
  }

  if (awaitingDesign) {
    return "border-violet-200/90 bg-[linear-gradient(135deg,rgba(250,245,255,0.99),rgba(237,233,254,0.95))] shadow-[0_18px_42px_-34px_rgba(124,58,237,0.16),inset_0_1px_0_rgba(255,255,255,0.84)] dark:border-[rgba(139,92,246,0.18)] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.99),rgba(11,17,32,0.96))] dark:shadow-[0_18px_42px_-34px_rgba(124,58,237,0.15),inset_0_1px_0_rgba(255,255,255,0.02)]";
  }

  if (item.lane === "NEEDS_ACTION") {
    return "border-orange-200/90 bg-[linear-gradient(135deg,rgba(255,247,237,0.99),rgba(254,215,170,0.95))] shadow-[0_18px_42px_-34px_rgba(249,115,22,0.14),inset_0_1px_0_rgba(255,255,255,0.84)] dark:border-[rgba(249,115,22,0.18)] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.99),rgba(11,17,32,0.96))] dark:shadow-[0_18px_42px_-34px_rgba(249,115,22,0.15),inset_0_1px_0_rgba(255,255,255,0.02)]";
  }

  if (item.lane === "FAILED") {
    return "border-rose-200/90 bg-[linear-gradient(135deg,rgba(255,244,246,0.99),rgba(255,226,231,0.95))] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(225,29,72,0.18)] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.99),rgba(11,17,32,0.96))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";
  }

  if (item.lane === "BLOCKED") {
    return "border-amber-200/90 bg-[linear-gradient(135deg,rgba(255,250,233,0.99),rgba(254,239,183,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-[rgba(245,158,11,0.15)] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.99),rgba(11,17,32,0.96))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";
  }

  return "border-sky-200/80 bg-[linear-gradient(135deg,rgba(246,251,255,0.99),rgba(224,242,254,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-[rgba(56,189,248,0.12)] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.99),rgba(11,17,32,0.96))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";
}

function getActionShellClasses(item: DecoratedItem, quietRow: boolean, awaitingDesign: boolean) {
  if (quietRow) {
    return "border-emerald-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(236,253,245,0.96))] text-emerald-800 shadow-[0_14px_34px_-28px_rgba(34,197,94,0.24)] group-hover:border-emerald-300 group-hover:bg-[linear-gradient(180deg,rgba(245,255,248,1),rgba(220,252,231,0.98))] dark:border-[rgba(52,211,153,0.2)] dark:bg-[linear-gradient(180deg,rgba(8,28,18,0.95),rgba(10,38,24,0.96))] dark:text-emerald-300 dark:shadow-[0_14px_34px_-28px_rgba(52,211,153,0.2)] dark:group-hover:border-[rgba(52,211,153,0.35)] dark:group-hover:bg-[linear-gradient(180deg,rgba(8,32,20,1),rgba(10,42,26,0.98))]";
  }

  if (awaitingDesign) {
    return "border-violet-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(245,243,255,0.98))] text-violet-800 shadow-[0_14px_34px_-28px_rgba(124,58,237,0.24)] group-hover:border-violet-300 group-hover:bg-[linear-gradient(180deg,rgba(250,245,255,1),rgba(237,233,254,0.98))] dark:border-[rgba(139,92,246,0.2)] dark:bg-[linear-gradient(180deg,rgba(18,8,42,0.95),rgba(22,10,52,0.96))] dark:text-violet-300 dark:shadow-[0_14px_34px_-28px_rgba(124,58,237,0.22)] dark:group-hover:border-[rgba(139,92,246,0.35)] dark:group-hover:bg-[linear-gradient(180deg,rgba(22,10,50,1),rgba(28,12,62,0.98))]";
  }

  if (item.lane === "NEEDS_ACTION") {
    return "border-orange-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,247,237,0.98))] text-orange-800 shadow-[0_14px_34px_-28px_rgba(249,115,22,0.26)] group-hover:border-orange-300 group-hover:bg-[linear-gradient(180deg,rgba(255,250,244,1),rgba(254,215,170,0.96))] dark:border-[rgba(249,115,22,0.2)] dark:bg-[linear-gradient(180deg,rgba(45,18,5,0.95),rgba(52,22,5,0.96))] dark:text-orange-300 dark:shadow-[0_14px_34px_-28px_rgba(249,115,22,0.2)] dark:group-hover:border-[rgba(249,115,22,0.35)] dark:group-hover:bg-[linear-gradient(180deg,rgba(50,22,5,1),rgba(58,26,5,0.98))]";
  }

  if (item.lane === "FAILED") {
    return "border-rose-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,236,240,0.96))] text-rose-700 shadow-[0_14px_34px_-28px_rgba(225,29,72,0.45)] group-hover:border-rose-300 group-hover:bg-[linear-gradient(180deg,rgba(255,247,248,1),rgba(255,232,237,0.98))] dark:border-[rgba(225,29,72,0.2)] dark:bg-[linear-gradient(180deg,rgba(45,8,15,0.94),rgba(52,10,18,0.96))] dark:text-rose-300 dark:shadow-[0_14px_34px_-28px_rgba(225,29,72,0.28)] dark:group-hover:border-[rgba(225,29,72,0.35)] dark:group-hover:bg-[linear-gradient(180deg,rgba(50,8,18,1),rgba(58,10,22,0.98))]";
  }

  if (item.lane === "BLOCKED") {
    return "border-amber-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,245,214,0.96))] text-amber-800 shadow-[0_14px_34px_-28px_rgba(245,158,11,0.42)] group-hover:border-amber-300 group-hover:bg-[linear-gradient(180deg,rgba(255,250,232,1),rgba(254,240,186,0.98))] dark:border-[rgba(245,158,11,0.18)] dark:bg-[linear-gradient(180deg,rgba(42,28,5,0.94),rgba(50,35,5,0.96))] dark:text-amber-300 dark:shadow-[0_14px_34px_-28px_rgba(245,158,11,0.25)] dark:group-hover:border-[rgba(245,158,11,0.3)] dark:group-hover:bg-[linear-gradient(180deg,rgba(48,32,5,1),rgba(56,40,5,0.98))]";
  }

  return "border-sky-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(233,244,255,0.96))] text-sky-800 shadow-[0_14px_34px_-28px_rgba(10,102,194,0.42)] group-hover:border-sky-300 group-hover:bg-[linear-gradient(180deg,rgba(247,252,255,1),rgba(224,242,254,0.98))] dark:border-[rgba(56,189,248,0.15)] dark:bg-[linear-gradient(180deg,rgba(8,18,42,0.95),rgba(8,24,52,0.96))] dark:text-sky-300 dark:shadow-[0_14px_34px_-28px_rgba(10,102,194,0.25)] dark:group-hover:border-[rgba(56,189,248,0.25)] dark:group-hover:bg-[linear-gradient(180deg,rgba(8,22,48,1),rgba(8,28,58,0.98))]";
}

function getActionIconClasses(item: DecoratedItem, quietRow: boolean, awaitingDesign: boolean) {
  if (quietRow) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 group-hover:border-emerald-500 group-hover:bg-emerald-600 group-hover:text-white dark:border-[rgba(52,211,153,0.3)] dark:bg-[rgba(52,211,153,0.08)] dark:text-emerald-400 dark:group-hover:border-emerald-500 dark:group-hover:bg-emerald-600/80";
  }

  if (awaitingDesign) {
    return "border-violet-200 bg-violet-50 text-violet-700 group-hover:border-violet-500 group-hover:bg-violet-600 group-hover:text-white dark:border-[rgba(139,92,246,0.3)] dark:bg-[rgba(139,92,246,0.08)] dark:text-violet-400 dark:group-hover:border-violet-500 dark:group-hover:bg-violet-600/80";
  }

  if (item.lane === "NEEDS_ACTION") {
    return "border-orange-200 bg-orange-50 text-orange-700 group-hover:border-orange-500 group-hover:bg-orange-500 group-hover:text-white dark:border-[rgba(249,115,22,0.3)] dark:bg-[rgba(249,115,22,0.08)] dark:text-orange-400 dark:group-hover:border-orange-500 dark:group-hover:bg-orange-500/80";
  }

  if (item.lane === "FAILED") {
    return "border-rose-200 bg-rose-50 text-rose-700 group-hover:border-rose-500 group-hover:bg-rose-600 group-hover:text-white dark:border-[rgba(225,29,72,0.3)] dark:bg-[rgba(225,29,72,0.08)] dark:text-rose-400 dark:group-hover:border-rose-500 dark:group-hover:bg-rose-600/80";
  }

  if (item.lane === "BLOCKED") {
    return "border-amber-200 bg-amber-50 text-amber-800 group-hover:border-amber-500 group-hover:bg-amber-500 group-hover:text-slate-950 dark:border-[rgba(245,158,11,0.3)] dark:bg-[rgba(245,158,11,0.08)] dark:text-amber-400 dark:group-hover:border-amber-500 dark:group-hover:bg-amber-500/80";
  }

  return "border-sky-200 bg-sky-50 text-sky-700 group-hover:border-sky-500 group-hover:bg-sky-600 group-hover:text-white dark:border-[rgba(56,189,248,0.2)] dark:bg-[rgba(56,189,248,0.08)] dark:text-sky-400 dark:group-hover:border-sky-500 dark:group-hover:bg-sky-600/80";
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

  return (
    <Link
      href={`/queue/${item.id}`}
      data-testid="queue-item"
      className={cn(
        "queue-row group relative block border-b border-slate-200/70 px-3 py-2.5 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A66C2] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 sm:px-4 dark:border-[rgba(99,102,241,0.08)] dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-[#060B18]",
        getRowStateClass(item, quietRow, awaitingDesign),
      )}
      style={{ animationDelay: `${delay}ms` }}
      title={sourceLabel}
    >
      <div
        className={cn(
          "grid items-start gap-3 rounded-[20px] border border-transparent px-2.5 py-2.5 transition-default sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-3 sm:py-3",
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
            <span className="text-[10px] font-medium tracking-[0.06em] text-slate-400 uppercase sm:hidden dark:text-slate-600">
              {formatDate(itemDate)}
            </span>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-slate-600">
                  {item.lane === "READY" ? "Closed item" : "Queue item"}
                </span>
                <span className="hidden h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700 sm:inline-flex" aria-hidden="true" />
                <span className="hidden text-[10px] font-medium tracking-[0.06em] text-slate-400 uppercase dark:text-slate-600 sm:inline-flex">
                  {formatDate(itemDate)}
                </span>
              </div>

              <p
                className={cn(
                  "max-w-3xl text-[15px] leading-5.5 font-semibold tracking-[-0.015em] sm:text-base",
                  quietRow ? "text-slate-700 dark:text-slate-400" : "text-slate-950 dark:text-slate-100",
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
                    ? "border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,1),rgba(255,228,230,0.98))] text-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] dark:border-[rgba(225,29,72,0.3)] dark:bg-[linear-gradient(180deg,rgba(48,8,18,1),rgba(58,10,22,0.98))] dark:text-rose-300"
                    : quietRow
                      ? "border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.96))] text-slate-500 dark:border-[rgba(99,102,241,0.12)] dark:bg-[linear-gradient(180deg,rgba(20,26,48,0.96),rgba(15,20,40,0.96))] dark:text-slate-500"
                      : "border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] text-slate-700 dark:border-[rgba(99,102,241,0.12)] dark:bg-[linear-gradient(180deg,rgba(20,26,48,0.96),rgba(15,20,40,0.96))] dark:text-slate-400",
                )}
              >
                Due {formatDateLabel(planning.deadline)}
              </span>
            ) : planning.plannedDate ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,245,249,0.96))] px-2 py-0.5 font-medium text-slate-500 dark:border-[rgba(99,102,241,0.12)] dark:bg-[linear-gradient(180deg,rgba(20,26,48,0.96),rgba(15,20,40,0.96))] dark:text-slate-500">
                Planned {formatDateLabel(planning.plannedDate)}
              </span>
            ) : null}

            {publishedPreview ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-[linear-gradient(180deg,rgba(241,245,249,1),rgba(226,232,240,0.96))] px-2 py-0.5 font-medium text-slate-600 dark:border-[rgba(99,102,241,0.12)] dark:bg-[linear-gradient(180deg,rgba(20,26,48,0.96),rgba(15,20,40,0.96))] dark:text-slate-400">
                <ImageIcon className="h-3 w-3" />
                Preview
              </span>
            ) : null}
          </div>

          <p className={cn("truncate text-[11px] text-slate-400 dark:text-slate-600", quietRow && "text-slate-400/90 dark:text-slate-600/90")}>
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
      <section className="app-surface-panel overflow-visible rounded-[28px] dark:border-[rgba(88,108,186,0.34)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
        <div className="border-b border-[var(--surface-border)] px-4 py-3.5 sm:px-5 dark:border-[rgba(99,102,241,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7B93BC] dark:text-[#8B97B7]">
                Queue Controls
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#1F2E57] dark:text-slate-100 sm:text-xl">
                  Operational list
                </h2>
                <span className="app-control-pill inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-[#5E749B] dark:text-[#96A7C9]">
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
                    : "app-control-pill text-[#4E72AE] dark:text-[#B7C3E7]",
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
                    className="app-control-pill inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[#4E72AE] transition-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A66C2] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-[#B7C3E7] dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-[#060B18]"
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
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "min-w-[7.5rem] rounded-[18px] border px-3 py-2 text-left transition-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A66C2] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-[#060B18] sm:min-w-[8.25rem]",
                    isActive
                      ? meta.activeClass
                      : isEmpty
                        ? "border-sky-200/70 bg-white/60 text-slate-400 hover:border-sky-200 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.88))] dark:border-[rgba(99,102,241,0.1)] dark:bg-[rgba(13,18,38,0.6)] dark:text-slate-600 dark:hover:border-[rgba(99,102,241,0.18)] dark:hover:bg-[rgba(15,20,42,0.7)]"
                        : meta.idleClass,
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-xs font-semibold tracking-[-0.01em]",
                          !isActive && meta.accentClass,
                          isEmpty && "text-slate-300 dark:text-slate-700",
                        )}
                      >
                        {meta.label}
                      </p>
                    </div>

                    <span
                      className={cn(
                        "inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        isActive
                          ? meta.countClass
                          : isEmpty
                            ? "bg-sky-50 text-slate-400 dark:bg-[rgba(99,102,241,0.06)] dark:text-slate-700"
                            : tab === "NEEDS_ACTION" && count > 0
                              ? "bg-orange-50 text-orange-700 dark:bg-[rgba(249,115,22,0.1)] dark:text-orange-400"
                              : tab === "READY" && count > 0
                                ? "bg-emerald-50 text-emerald-700 dark:bg-[rgba(52,211,153,0.1)] dark:text-emerald-400"
                                : tab === "FAILED" && count > 0
                                  ? "bg-rose-50 text-rose-700 dark:bg-[rgba(225,29,72,0.1)] dark:text-rose-400"
                                  : tab === "ALL" && count > 0
                                    ? "bg-violet-50 text-violet-700 dark:bg-[rgba(139,92,246,0.1)] dark:text-violet-400"
                                    : "bg-sky-50 text-slate-600 dark:bg-[rgba(56,189,248,0.08)] dark:text-sky-400",
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

      <section className="app-surface-panel overflow-hidden rounded-[30px] dark:border-[rgba(88,108,186,0.34)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-sky-200/70 bg-[linear-gradient(180deg,rgba(248,251,255,0.98),rgba(239,246,255,0.82))] px-4 py-2.5 sm:px-5 dark:border-[rgba(99,102,241,0.12)] dark:bg-[linear-gradient(180deg,rgba(11,16,32,0.99),rgba(9,13,26,0.82))]">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              Active queue
            </p>
          </div>
          <span className="hidden rounded-full border border-sky-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.94))] px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 sm:inline-flex dark:border-[rgba(99,102,241,0.15)] dark:bg-[linear-gradient(180deg,rgba(20,26,48,0.98),rgba(15,20,40,0.94))] dark:text-sky-400">
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
