"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/shared/ui/metric-card";
import { StatusBadge } from "@/shared/ui/status-badge";
import { WorkflowStepper } from "@/shared/ui/workflow-stepper";
import { DRIVE_IMPORT_FOLDER_NAME, DRIVE_IMPORT_KEYWORD, DRIVE_IMPORT_PAGE_SIZE } from "@/modules/content-intake/domain/drive-import";
import {
  type DriveSourceGroup,
  type DriveSpreadsheetRecord,
  filterDriveSpreadsheetRecords,
  formatDriveSourceGroupLabel,
  getDriveImportSourceGroups,
  paginateDriveSpreadsheetRecords,
} from "@/modules/content-intake/domain/drive-import";
import {
  scanDriveImportCatalogAction,
  sendStagedSpreadsheetToWorkflowQueueAction,
  stageDriveImportSpreadsheetsAction,
  type DriveImportScanResponse,
  type StagedSpreadsheetSnapshot,
} from "@/modules/content-intake/application/drive-import-workflow";
import type { DriveReimportStrategy } from "@prisma/client";

type ScanState = "idle" | "armed" | "scanning" | "ready";

type ActivityEntry = {
  id: string;
  label: string;
  detail: string;
  occurredAt: string;
};

type PersistedImportWizardState = {
  scanState: ScanState;
  query: string;
  appliedQuery: string;
  activeGroup: DriveSourceGroup | "ALL";
  page: number;
  scanResult: DriveImportScanResponse | null;
  stagedSpreadsheets: StagedSpreadsheetSnapshot[];
  selectedSpreadsheetIds: string[];
  selectedStagedIds: string[];
  reimportStrategy: DriveReimportStrategy;
  activity: ActivityEntry[];
};

const IMPORT_WIZARD_SESSION_STORAGE_KEY = "mih.import-wizard.v1";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatSourceGroupLabel(group: DriveSourceGroup | "ALL") {
  return formatDriveSourceGroupLabel(group);
}

function getReimportStrategyLabel(value: DriveReimportStrategy) {
  switch (value) {
    case "UPDATE":
      return "Update current import";
    case "REPLACE":
      return "Replace with sheet version";
    case "KEEP_AS_IS":
      return "Keep workflow version";
  }
}

function buildSelectionLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"} selected`;
}

function sumBy<T>(items: T[], selector: (item: T) => number) {
  return items.reduce((sum, item) => sum + selector(item), 0);
}

function uniqueByDriveFileId(items: StagedSpreadsheetSnapshot[]) {
  const map = new Map<string, StagedSpreadsheetSnapshot>();
  for (const item of items) {
    map.set(item.driveFileId, item);
  }
  return Array.from(map.values()).sort((left, right) => right.importedAt.localeCompare(left.importedAt));
}

function isValidSourceGroup(value: unknown): value is DriveSourceGroup | "ALL" {
  return value === "ALL" || getDriveImportSourceGroups().includes(value as DriveSourceGroup);
}

function normalizeStoredIds(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getStageStatusLabel(record: StagedSpreadsheetSnapshot) {
  switch (record.state) {
    case "SENT_TO_QUEUE":
      return "Sent to Queue";
    case "PARTIALLY_SENT":
      return "Partially sent";
    case "NEEDS_REIMPORT_DECISION":
      return "Needs choice";
    default:
      return "Staged";
  }
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)] dark:text-[#A8B7DA]">
      {children}
    </span>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[#8B97B7]">{children}</p>;
}

function SpreadsheetResultRow({
  record,
  selected,
  onToggle,
}: {
  record: DriveSpreadsheetRecord;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-start justify-between gap-4 rounded-[22px] border px-5 py-4 text-left transition-default",
        selected
          ? "border-slate-950 bg-white shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] dark:border-[rgba(132,144,226,0.58)] dark:bg-[rgba(17,25,50,0.9)] dark:shadow-[0_18px_45px_-28px_rgba(48,62,140,0.5)]"
          : "border-slate-200/90 bg-white/90 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_38px_-30px_rgba(15,23,42,0.3)] dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(14,21,44,0.78)] dark:hover:border-[rgba(124,138,214,0.46)] dark:hover:bg-[rgba(20,29,56,0.86)]",
      )}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only" />

      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition-default",
            selected
              ? "border-slate-950 bg-slate-950 text-white dark:border-[rgba(132,144,226,0.6)] dark:bg-[rgba(95,102,236,0.86)]"
              : "border-slate-200 bg-slate-50 text-slate-500 group-hover:border-slate-300 group-hover:bg-white dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.7)] dark:text-[#95A7CB] dark:group-hover:border-[rgba(124,138,214,0.46)]",
          )}
        >
          {selected ? <CheckCircle2 className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="truncate text-[15px] font-semibold tracking-tight text-slate-950 dark:text-slate-100">{record.spreadsheetName}</p>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)] dark:text-[#A8B7DA]">
              {formatDriveSourceGroupLabel(record.sourceContext.sourceGroup)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-[11px] font-medium text-slate-500 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(18,26,51,0.8)] dark:text-[#95A7CB]">
              {record.sourceContext.owner}
            </Badge>
          </div>

          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500 dark:text-[#95A7CB]">{record.description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MetaChip>{record.sourceContext.region}</MetaChip>
            {record.sourceContext.tags.slice(0, 2).map((tag) => (
              <MetaChip key={tag}>{tag}</MetaChip>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)] dark:text-[#95A7CB]">
          <FolderOpen className="h-3 w-3" />
          {record.worksheets.length > 0 ? `${record.worksheets.length} tabs` : "Auto-detected tabs"}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-400 dark:text-[#8393B6]">Updated {formatDate(record.lastUpdatedAt)}</p>
        <p className="mt-1 max-w-[16rem] text-[11px] leading-5 text-slate-400 dark:text-[#8393B6]">{selected ? "Selected for staging" : "Ready to review"}</p>
      </div>
    </label>
  );
}

function StagedSpreadsheetRow({
  record,
  selected,
  onToggle,
}: {
  record: StagedSpreadsheetSnapshot;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-start justify-between gap-4 rounded-[22px] border px-5 py-4 text-left transition-default",
        selected
          ? "border-slate-950 bg-white shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] dark:border-[rgba(132,144,226,0.58)] dark:bg-[rgba(17,25,50,0.9)] dark:shadow-[0_18px_45px_-28px_rgba(48,62,140,0.5)]"
          : "border-slate-200/90 bg-white/90 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_38px_-30px_rgba(15,23,42,0.3)] dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(14,21,44,0.78)] dark:hover:border-[rgba(124,138,214,0.46)] dark:hover:bg-[rgba(20,29,56,0.86)]",
      )}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only" />

      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition-default",
            selected
              ? "border-slate-950 bg-slate-950 text-white dark:border-[rgba(132,144,226,0.6)] dark:bg-[rgba(95,102,236,0.86)]"
              : "border-slate-200 bg-slate-50 text-slate-500 group-hover:border-slate-300 group-hover:bg-white dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.7)] dark:text-[#95A7CB] dark:group-hover:border-[rgba(124,138,214,0.46)]",
          )}
        >
          {selected ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="truncate text-[15px] font-semibold tracking-tight text-slate-950 dark:text-slate-100">{record.spreadsheetName}</p>
            <StatusBadge status={record.state} label={getStageStatusLabel(record)} size="xs" dot={false} />
            <Badge variant="outline" className="border-slate-200 bg-white text-[11px] font-medium text-slate-600 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(18,26,51,0.8)] dark:text-[#A8B7DA]">
              {getReimportStrategyLabel(record.reimportStrategy)}
            </Badge>
          </div>

          <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-[#95A7CB]">
            {record.owner} · {formatDriveSourceGroupLabel(record.sourceGroup as DriveSourceGroup)} · {record.lastUpdatedAt ? formatDate(record.lastUpdatedAt) : "Unknown update"}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MetaChip>{record.totalRowsDetected} rows</MetaChip>
            <MetaChip>{record.qualifiedRowsDetected} valid</MetaChip>
            <MetaChip>{record.alreadyPublishedRowCount} already published</MetaChip>
            <MetaChip>{record.conflictRowsDetected} conflicts</MetaChip>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-[#95A7CB]">
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)]">
              Imported {record.importedRowCount}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)]">
              Updated {record.updatedRowCount}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)]">
              Replaced {record.replacedRowCount}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)]">
              Kept {record.keptRowCount}
            </span>
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400 dark:text-[#8393B6]">Last staged</p>
        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{formatDateTime(record.importedAt)}</p>
        <p className="mt-2 max-w-[14rem] text-[11px] leading-5 text-slate-400 dark:text-[#8393B6]">
          {record.queuedAt ? `Queued ${formatDateTime(record.queuedAt)}` : "Waiting to be sent to queue"}
        </p>
      </div>
    </label>
  );
}

function ConfirmModal({
  open,
  selectedRecords,
  reimportStrategy,
  onStrategyChange,
  onCancel,
  onConfirm,
  confirming,
}: {
  open: boolean;
  selectedRecords: DriveSpreadsheetRecord[];
  reimportStrategy: DriveReimportStrategy;
  onStrategyChange: (value: DriveReimportStrategy) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm dark:bg-slate-950/72"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-confirm-title"
        className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-[rgba(88,108,186,0.3)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.98),rgba(10,14,31,0.94))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Confirm import</p>
            <h2 id="import-confirm-title" className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">
              Stage selected spreadsheets
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-[#95A7CB]">
              The platform will inspect the selected spreadsheets, auto-pick valid worksheets, normalize their rows,
              and store the results in staging before queue ingestion.
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-default hover:border-slate-400 hover:text-slate-900 dark:border-[rgba(88,108,186,0.3)] dark:text-[#95A7CB] dark:hover:border-[rgba(124,138,214,0.46)] dark:hover:text-slate-100"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {selectedRecords.map((record) => (
            <div key={record.driveFileId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">{record.spreadsheetName}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-[#95A7CB]">
                    {record.sourceContext.owner} - {formatDriveSourceGroupLabel(record.sourceContext.sourceGroup)}
                  </p>
                </div>
                <Badge variant="outline" className="border-slate-200 bg-white text-[11px] text-slate-600 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(18,26,51,0.8)] dark:text-[#A8B7DA]">
                  {record.worksheets.length > 0 ? `${record.worksheets.length} tabs` : "Auto-detected"}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[#8B97B7]">Reimport strategy</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(["UPDATE", "REPLACE", "KEEP_AS_IS"] as const).map((option) => {
              const active = reimportStrategy === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onStrategyChange(option)}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left text-sm transition-default",
                    active
                      ? "border-slate-950 bg-white text-slate-950 shadow-sm dark:border-[rgba(132,144,226,0.58)] dark:bg-[rgba(17,25,50,0.9)] dark:text-slate-100"
                      : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(18,26,51,0.72)] dark:text-[#95A7CB] dark:hover:border-[rgba(124,138,214,0.46)] dark:hover:bg-[rgba(22,30,58,0.84)]",
                  )}
                >
                  <p className="font-semibold">{getReimportStrategyLabel(option)}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-[#95A7CB]">
                    {option === "UPDATE"
                      ? "Bring in the latest spreadsheet changes without discarding the workflow history already built here."
                      : option === "REPLACE"
                        ? "Replace the current imported version with the newest spreadsheet version for a clean refresh."
                        : "Keep the existing workflow state exactly as it is and ignore the new spreadsheet version for now."}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-[#95A7CB]">
            The selected spreadsheets will be staged first. Valid rows enter the Workflow Queue only after the next
            confirmation step.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100 dark:hover:bg-[rgba(29,37,68,0.95)]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={confirming}
              className="transition-default disabled:opacity-50"
              style={{ backgroundColor: "#E8584A", color: "white" }}
            >
              {confirming ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Staging...
                </>
              ) : (
                "Confirm stage"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImportWizard() {
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<DriveSourceGroup | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [scanResult, setScanResult] = useState<DriveImportScanResponse | null>(null);
  const [stagedSpreadsheets, setStagedSpreadsheets] = useState<StagedSpreadsheetSnapshot[]>([]);
  const [selectedSpreadsheetIds, setSelectedSpreadsheetIds] = useState<Set<string>>(new Set());
  const [selectedStagedIds, setSelectedStagedIds] = useState<Set<string>>(new Set());
  const [reimportStrategy, setReimportStrategy] = useState<DriveReimportStrategy>("UPDATE");
  const [isScanning, setIsScanning] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [hasHydratedState, setHasHydratedState] = useState(false);

  const loadedScanRecords = useMemo(() => scanResult?.results.map((result) => result.record) ?? [], [scanResult]);
  const availableSourceGroups = useMemo(() => {
    if (loadedScanRecords.length === 0) {
      return ["ALL"] as Array<DriveSourceGroup | "ALL">;
    }

    const presentGroups = new Set(loadedScanRecords.map((record) => record.sourceContext.sourceGroup));
    return getDriveImportSourceGroups().filter(
      (group): group is DriveSourceGroup | "ALL" => group === "ALL" || presentGroups.has(group),
    );
  }, [loadedScanRecords]);
  const filteredScanRecords = useMemo(
    () =>
      filterDriveSpreadsheetRecords(loadedScanRecords, {
        query: appliedQuery,
        sourceGroup: activeGroup,
      }),
    [loadedScanRecords, appliedQuery, activeGroup],
  );
  const paginatedScanRecords = useMemo(
    () => paginateDriveSpreadsheetRecords(filteredScanRecords, page, DRIVE_IMPORT_PAGE_SIZE),
    [filteredScanRecords, page],
  );
  const visibleScanRecords = paginatedScanRecords.results.map((result) => result.record);
  const selectedScanRecords = useMemo(
    () => loadedScanRecords.filter((record) => selectedSpreadsheetIds.has(record.driveFileId)),
    [loadedScanRecords, selectedSpreadsheetIds],
  );

  const pageCount = paginatedScanRecords.totalPages;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const stored = window.sessionStorage.getItem(IMPORT_WIZARD_SESSION_STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored) as Partial<PersistedImportWizardState>;
      setScanState(parsed.scanState ?? "idle");
      setQuery(parsed.query ?? "");
      setAppliedQuery(parsed.appliedQuery ?? "");
      setActiveGroup(isValidSourceGroup(parsed.activeGroup) ? parsed.activeGroup : "ALL");
      setPage(Math.max(1, parsed.page ?? 1));
      setScanResult(parsed.scanResult ?? null);
      setStagedSpreadsheets(Array.isArray(parsed.stagedSpreadsheets) ? parsed.stagedSpreadsheets : []);
      setSelectedSpreadsheetIds(new Set(normalizeStoredIds(parsed.selectedSpreadsheetIds)));
      setSelectedStagedIds(new Set(normalizeStoredIds(parsed.selectedStagedIds)));
      setReimportStrategy(parsed.reimportStrategy ?? "UPDATE");
      setActivity(Array.isArray(parsed.activity) ? parsed.activity : []);
    } catch {
      // Ignore stale or malformed session state and fall back to defaults.
    } finally {
      setHasHydratedState(true);
    }
  }, []);

  const persistedState = useMemo<PersistedImportWizardState>(
    () => ({
      scanState,
      query,
      appliedQuery,
      activeGroup,
      page,
      scanResult,
      stagedSpreadsheets,
      selectedSpreadsheetIds: Array.from(selectedSpreadsheetIds),
      selectedStagedIds: Array.from(selectedStagedIds),
      reimportStrategy,
      activity,
    }),
    [
      scanState,
      query,
      appliedQuery,
      activeGroup,
      page,
      scanResult,
      stagedSpreadsheets,
      selectedSpreadsheetIds,
      selectedStagedIds,
      reimportStrategy,
      activity,
    ],
  );

  useEffect(() => {
    if (!hasHydratedState || typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(IMPORT_WIZARD_SESSION_STORAGE_KEY, JSON.stringify(persistedState));
  }, [hasHydratedState, persistedState]);

  useEffect(() => {
    if (pageCount > 0 && page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  useEffect(() => {
    if (activeGroup !== "ALL" && !availableSourceGroups.includes(activeGroup)) {
      setActiveGroup("ALL");
    }
  }, [activeGroup, availableSourceGroups]);

  async function performScan() {
    setIsScanning(true);
    setScanState("scanning");
    setModalError(null);
    console.info("[TRACE_IMPORT_QUEUE][UI] scan:start", {
      query: "",
      sourceGroup: "ALL",
      page: 1,
      pageSize: 1000,
    });

    try {
      const result = await scanDriveImportCatalogAction({
        query: "",
        sourceGroup: "ALL",
        page: 1,
        pageSize: 1000,
      });

      setScanResult(result);
      setSelectedSpreadsheetIds((current) => {
        const next = new Set<string>();
        for (const record of result.results.map((entry) => entry.record)) {
          if (current.has(record.driveFileId)) {
            next.add(record.driveFileId);
          }
        }
        return next;
      });
      setPage(1);
      setScanState("ready");
      console.info("[TRACE_IMPORT_QUEUE][UI] scan:done", {
        total: result.total,
        resultSpreadsheetIds: result.results.map((entry) => entry.record.driveFileId),
      });
      setActivity((current) => [
        {
          id: `scan-${Date.now()}`,
          label: "Drive scan completed",
          detail: `${result.total} matching spreadsheet${result.total === 1 ? "" : "s"} found in ${DRIVE_IMPORT_FOLDER_NAME}.`,
          occurredAt: new Date().toISOString(),
        },
        ...current,
      ]);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Unable to scan Drive right now.");
    } finally {
      setIsScanning(false);
    }
  }

  function toggleSpreadsheetSelection(record: DriveSpreadsheetRecord) {
    setSelectedSpreadsheetIds((current) => {
      const next = new Set(current);
      if (next.has(record.driveFileId)) {
        next.delete(record.driveFileId);
      } else {
        next.add(record.driveFileId);
      }
      return next;
    });
  }

  function toggleStagedSelection(batchId: string) {
    setSelectedStagedIds((current) => {
      const next = new Set(current);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  }

  function selectCurrentPage() {
    if (visibleScanRecords.length === 0) {
      return;
    }

    setSelectedSpreadsheetIds((current) => {
      const next = new Set(current);
      for (const record of visibleScanRecords) {
        next.add(record.driveFileId);
      }
      return next;
    });
  }

  async function confirmStageSelected() {
    const driveFileIds = Array.from(selectedSpreadsheetIds);
    if (driveFileIds.length === 0) {
      setModalOpen(false);
      return;
    }

    setIsStaging(true);
    setModalError(null);
    console.info("[TRACE_IMPORT_QUEUE][UI] stage:start", {
      driveFileIds,
      reimportStrategy,
    });

    try {
      const result = await stageDriveImportSpreadsheetsAction({
        driveFileIds,
        reimportStrategy,
      });

      console.info("[TRACE_IMPORT_QUEUE][UI] stage:done", {
        driveFileIds,
        batchIdsCreated: result.spreadsheets.map((spreadsheet) => spreadsheet.id),
        stagedSpreadsheetIds: result.spreadsheets.map((spreadsheet) => spreadsheet.spreadsheetId),
        rowsDetected: result.spreadsheets.map((spreadsheet) => ({
          batchId: spreadsheet.id,
          spreadsheetId: spreadsheet.spreadsheetId,
          totalRowsDetected: spreadsheet.totalRowsDetected,
          qualifiedRowsDetected: spreadsheet.qualifiedRowsDetected,
          conflictRowsDetected: spreadsheet.conflictRowsDetected,
        })),
      });
      setStagedSpreadsheets((current) => uniqueByDriveFileId([...current, ...result.spreadsheets]));
      setSelectedSpreadsheetIds(new Set());
      setModalOpen(false);
      setScanState("ready");
      setActivity((current) => [
        {
          id: `stage-${Date.now()}`,
          label: "Spreadsheets staged",
          detail: `${result.spreadsheets.length} spreadsheet${result.spreadsheets.length === 1 ? "" : "s"} imported to staging.`,
          occurredAt: new Date().toISOString(),
        },
        ...current,
      ]);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Unable to stage the selected spreadsheets.");
    } finally {
      setIsStaging(false);
    }
  }

  async function sendSelectedToWorkflowQueue() {
    if (selectedStagedIds.size === 0) {
      return;
    }

    setIsSending(true);
    setModalError(null);

    try {
      const sendableIds = Array.from(selectedStagedIds).filter((batchId) => {
        const record = stagedSpreadsheets.find((item) => item.id === batchId);
        return record ? record.state !== "SENT_TO_QUEUE" : false;
      });
      console.info("[TRACE_IMPORT_QUEUE][UI] queue-send:start", {
        selectedBatchIds: Array.from(selectedStagedIds),
        sendableBatchIds: sendableIds,
      });

      if (sendableIds.length === 0) {
        setIsSending(false);
        setSelectedStagedIds(new Set());
        console.info("[TRACE_IMPORT_QUEUE][UI] queue-send:skipped", {
          reason: "already_queued",
          selectedBatchIds: Array.from(selectedStagedIds),
        });
        setActivity((current) => [
          {
            id: `queue-${Date.now()}`,
            label: "Workflow Queue updated",
            detail: "Selected spreadsheets were already queued.",
            occurredAt: new Date().toISOString(),
          },
          ...current,
        ]);
        return;
      }

      const results = await Promise.all(
        sendableIds.map(async (batchId) => {
          const result = await sendStagedSpreadsheetToWorkflowQueueAction(batchId);
          return result;
        }),
      );
      console.info("[TRACE_IMPORT_QUEUE][UI] queue-send:done", {
        sendableBatchIds: sendableIds,
        results: results.map((result) =>
          result
            ? {
                spreadsheetImportId: result.spreadsheetImportId,
                spreadsheetId: result.spreadsheetId,
                sentRows: result.sentRows,
                createdRows: result.createdRows,
                updatedRows: result.updatedRows,
                replacedRows: result.replacedRows,
                keptRows: result.keptRows,
                skippedRows: result.skippedRows,
                rejectedRows: result.rejectedRows,
                conflicts: result.conflicts,
              }
            : null,
        ),
      });

      setStagedSpreadsheets((current) =>
        current.map((record) => {
          const result = results.find((entry) => entry?.spreadsheetImportId === record.id);
          if (!result) {
            return record;
          }

          return {
            ...record,
            state: result.state,
            queuedAt: new Date().toISOString(),
            importedRowCount: result.createdRows + result.updatedRows + result.replacedRows + result.keptRows,
            updatedRowCount: result.updatedRows,
            replacedRowCount: result.replacedRows,
            keptRowCount: result.keptRows,
            conflictRowsDetected: result.conflicts,
          };
        }),
      );

      setSelectedStagedIds(new Set());
      setActivity((current) => [
        {
          id: `queue-${Date.now()}`,
          label: "Workflow Queue updated",
          detail: `${results.filter(Boolean).length} spreadsheet${results.filter(Boolean).length === 1 ? "" : "s"} moved into the queue.`,
          occurredAt: new Date().toISOString(),
        },
        ...current,
      ]);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Unable to send staged spreadsheets to the queue.");
    } finally {
      setIsSending(false);
    }
  }

  const foundCount = scanResult?.total ?? 0;
  const stagedCount = stagedSpreadsheets.length;
  const detectedRows = sumBy(stagedSpreadsheets, (item) => item.totalRowsDetected);
  const queuedRows = sumBy(stagedSpreadsheets, (item) => item.importedRowCount + item.updatedRowCount + item.replacedRowCount + item.keptRowCount);
  const conflictCount = sumBy(stagedSpreadsheets, (item) => item.conflictRowsDetected);
  const alreadyPublishedCount = sumBy(stagedSpreadsheets, (item) => item.alreadyPublishedRowCount);
  const currentWorkflowStep =
    selectedStagedIds.size > 0 || isSending ? "send" : stagedCount > 0 || modalOpen || isStaging ? "stage" : "scan";

  return (
    <>
      <div className="space-y-8 import-theme">
        <section className="app-surface-panel relative overflow-hidden rounded-[34px] px-6 py-6 sm:px-8 sm:py-8 dark:border-[rgba(88,108,186,0.36)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(232,88,74,0.12),_transparent_36%),radial-gradient(circle_at_bottom_left,_rgba(10,102,194,0.08),_transparent_34%)]" />
          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_320px] xl:items-start">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950 dark:bg-indigo-500/25 dark:text-[#C8D1FF]">
                  Command Center
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-[11px] text-slate-600 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(18,26,51,0.8)] dark:text-[#A8B7DA]">
                  {DRIVE_IMPORT_FOLDER_NAME}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-[11px] text-slate-600 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(18,26,51,0.8)] dark:text-[#A8B7DA]">
                  {DRIVE_IMPORT_KEYWORD}
                </Badge>
              </div>

              <div className="max-w-3xl space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7B93BC] dark:text-[#8B97B7]">
                  Drive import flow
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-[#1F2E57] dark:text-slate-100 sm:text-[2.85rem] sm:leading-[1.02]">
                  Turn planning into execution
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[#5E749B] dark:text-[#95A7CB]">
                  Scan your Drive, extract real work, and push it into your workflow.
                </p>
              </div>

              <div className="app-surface-soft rounded-[26px] px-4 py-4 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(18,26,51,0.8)]">
                <WorkflowStepper
                  mode="steps"
                  steps={[
                    {
                      key: "scan",
                      label: "Scan",
                      detail: "Discover sheets",
                      state: currentWorkflowStep === "scan" ? "current" : scanState === "ready" || stagedCount > 0 ? "complete" : "current",
                    },
                    {
                      key: "stage",
                      label: "Stage",
                      detail: "Validate import",
                      state: currentWorkflowStep === "stage" ? "current" : currentWorkflowStep === "send" ? "complete" : "upcoming",
                    },
                    {
                      key: "send",
                      label: "Send",
                      detail: "Push to queue",
                      state: currentWorkflowStep === "send" ? "current" : "upcoming",
                    },
                  ]}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => {
                    setScanState("armed");
                    void performScan();
                  }}
                  disabled={isScanning}
                  className="h-12 min-w-[10rem] rounded-xl px-5 text-sm font-semibold shadow-sm transition-default hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ backgroundColor: "#E8584A", color: "white" }}
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Scanning Drive...
                    </>
                  ) : (
                    "Scan Drive"
                  )}
                </Button>
                <Button
                  variant="outline"
                  asChild
                  className="app-control-pill h-11 rounded-xl border-slate-300 bg-white text-slate-700 transition-default hover:-translate-y-0.5 hover:bg-slate-50 dark:border-[rgba(88,108,186,0.35)] dark:bg-[rgba(21,29,56,0.84)] dark:text-[#B6C3E6] dark:hover:bg-[rgba(27,36,67,0.94)]"
                >
                  <Link href="/queue">Open Queue</Link>
                </Button>
                <span className="text-sm text-slate-500 dark:text-[#95A7CB]">
                  {scanState === "idle"
                    ? "Start with a remote Drive scan. Search and chips below only refine the local view."
                    : scanState === "armed"
                      ? "Drive scan is ready. Results will appear below."
                      : stagedCount > 0
                        ? "You already have staged spreadsheets waiting for their final queue send."
                        : "Keep the scan remote. Keep filters local. Move only what is ready."}
                </span>
              </div>
            </div>

            <aside className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_22px_60px_-40px_rgba(15,23,42,0.65)] dark:border-[rgba(102,119,193,0.38)] dark:bg-[linear-gradient(180deg,rgba(18,24,48,0.95),rgba(11,16,34,0.92))] dark:shadow-[0_26px_68px_-42px_rgba(43,54,122,0.58)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                System status
              </p>
              <div className="mt-5 space-y-3">
                {[
                  { label: "Found", value: foundCount, detail: scanState === "ready" ? "From the latest scan" : "Waiting for scan" },
                  { label: "Staged", value: stagedCount, detail: stagedCount > 0 ? "Ready for review" : "Nothing staged yet" },
                  { label: "Posted", value: alreadyPublishedCount, detail: "Already recognized as done" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-white/60">{stat.label}</p>
                      <p className="mt-1 text-xs text-white/45">{stat.detail}</p>
                    </div>
                    <span className="text-2xl font-semibold tracking-tight text-white">{stat.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-white/60">
                Scan remotely, review calmly, and only send validated rows forward.
              </p>
            </aside>
          </div>
        </section>

        <section className="app-surface-panel rounded-[28px] px-5 py-4 dark:border-[rgba(88,108,186,0.34)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Detected" value={detectedRows} detail="Rows seen in staged sheets" />
            <MetricCard label="Queued" value={queuedRows} detail="Rows already in workflow" tone="progress" />
            <MetricCard label="Needs review" value={conflictCount} detail="Reimport decisions pending" />
            <MetricCard label="Posted" value={alreadyPublishedCount} detail="Already recognized as posted" tone="ready" />
          </div>
        </section>

        <section className="app-surface-panel space-y-5 rounded-[30px] px-5 py-5 sm:px-6 dark:border-[rgba(88,108,186,0.34)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <SectionHeading>Discovery</SectionHeading>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">Select spreadsheets to import</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-[#95A7CB]">
                Filter and choose what should enter staging.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,31,58,0.74)] dark:text-[#95A7CB]">
              Remote scan fills this list. Search and source chips only refine the local view.
            </div>
          </div>

          <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(19,27,52,0.74)]">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-[#8B97B7]">Local filters</label>
              <div className="flex flex-col gap-2 lg:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        setAppliedQuery(event.currentTarget.value);
                        setPage(1);
                      }
                    }}
                    placeholder="Search by spreadsheet name, owner, region, or tags"
                    className="h-12 rounded-xl border-slate-200 bg-white pl-9 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAppliedQuery(query);
                    setPage(1);
                  }}
                  className="app-control-pill h-12 rounded-xl border-slate-300 bg-white px-4 text-slate-700 hover:bg-slate-50 dark:border-[rgba(88,108,186,0.35)] dark:bg-[rgba(21,29,56,0.84)] dark:text-[#B6C3E6] dark:hover:bg-[rgba(27,36,67,0.94)]"
                >
                  Apply filters
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-[#8B97B7]">Source group</p>
              <div className="flex flex-wrap items-center gap-2">
              {availableSourceGroups.map((group) => {
                const isActive = activeGroup === group;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => {
                      setActiveGroup(group);
                      setPage(1);
                    }}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-xs font-semibold transition-default",
                      isActive
                        ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-[#95A7CB] dark:hover:border-[rgba(124,138,214,0.46)] dark:hover:bg-[rgba(27,36,67,0.94)]",
                    )}
                  >
                    {formatSourceGroupLabel(group)}
                  </button>
                );
              })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-slate-500 dark:text-[#95A7CB]">{buildSelectionLabel(selectedSpreadsheetIds.size, "spreadsheet")}</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={selectCurrentPage}
                disabled={!scanResult || scanResult.results.length === 0}
                className="app-control-pill rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-[rgba(88,108,186,0.35)] dark:bg-[rgba(21,29,56,0.84)] dark:text-[#B6C3E6] dark:hover:bg-[rgba(27,36,67,0.94)]"
              >
                Select page
              </Button>
              <Button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={selectedSpreadsheetIds.size === 0}
                className="h-11 rounded-xl px-4 font-semibold transition-default hover:-translate-y-0.5 disabled:opacity-50"
                style={{ backgroundColor: "#E8584A", color: "white" }}
              >
                Import selected
              </Button>
            </div>
          </div>

          <div className="max-h-[34rem] min-h-0 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
            {isScanning ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(19,27,52,0.74)]">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                <p className="mt-4 text-base font-semibold text-slate-950 dark:text-slate-100">Scanning Drive...</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-[#95A7CB]">
                  Looking through the configured folder and preparing spreadsheet results.
                </p>
              </div>
            ) : visibleScanRecords.length ? (
              visibleScanRecords.map((record) => (
                <SpreadsheetResultRow
                  key={record.driveFileId}
                  record={record}
                  selected={selectedSpreadsheetIds.has(record.driveFileId)}
                  onToggle={() => toggleSpreadsheetSelection(record)}
                />
              ))
            ) : scanState === "ready" ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(19,27,52,0.74)]">
                <p className="text-base font-semibold text-slate-950 dark:text-slate-100">No spreadsheets found</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-[#95A7CB]">
                  Try another search term or reset the local filters.
                </p>
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(19,27,52,0.74)]">
                <p className="text-base font-semibold text-slate-950 dark:text-slate-100">Nothing scanned yet</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-[#95A7CB]">
                  Start by scanning your Drive to discover spreadsheets.
                </p>
                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={() => {
                      setScanState("armed");
                      void performScan();
                    }}
                    disabled={isScanning}
                    className="h-11 rounded-xl px-4 font-semibold transition-default hover:-translate-y-0.5 disabled:opacity-50"
                    style={{ backgroundColor: "#E8584A", color: "white" }}
                  >
                    Scan Drive
                  </Button>
                </div>
              </div>
            )}
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1));
                }}
                disabled={page <= 1 || isScanning}
                className="app-control-pill rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-[rgba(88,108,186,0.35)] dark:bg-[rgba(21,29,56,0.84)] dark:text-[#B6C3E6] dark:hover:bg-[rgba(27,36,67,0.94)]"
              >
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Previous
              </Button>
              <p className="text-sm text-slate-500 dark:text-[#95A7CB]">
                Page {page} of {pageCount}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setPage((current) => Math.min(pageCount, current + 1));
                }}
                disabled={page >= pageCount || isScanning}
                className="app-control-pill rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-[rgba(88,108,186,0.35)] dark:bg-[rgba(21,29,56,0.84)] dark:text-[#B6C3E6] dark:hover:bg-[rgba(27,36,67,0.94)]"
              >
                Next
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </section>

        <section className="app-surface-panel space-y-5 rounded-[30px] px-5 py-5 sm:px-6 dark:border-[rgba(88,108,186,0.34)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <SectionHeading>Staging & send</SectionHeading>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">Review and send to queue</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-[#95A7CB]">
                Review what is already staged, then send the right spreadsheets forward.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <p className="text-sm text-slate-500 dark:text-[#95A7CB]">Only validated rows will be sent.</p>
              <Button
                type="button"
                onClick={() => void sendSelectedToWorkflowQueue()}
                disabled={selectedStagedIds.size === 0 || isSending}
                className="h-12 rounded-xl px-5 text-sm font-semibold shadow-sm transition-default hover:-translate-y-0.5 disabled:opacity-50"
                style={{ backgroundColor: "#E8584A", color: "white" }}
              >
                {isSending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send to Workflow Queue"
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(19,27,52,0.74)]">
            <p className="text-sm text-slate-600 dark:text-[#B6C3E6]">{buildSelectionLabel(selectedStagedIds.size, "staged spreadsheet")}</p>
            <p className="text-sm text-slate-500 dark:text-[#95A7CB]">
              {stagedCount === 0
                ? "Nothing staged yet"
                : `${stagedCount} staged spreadsheet${stagedCount === 1 ? "" : "s"} ready for review`}
            </p>
          </div>

          {stagedCount > 0 ? (
            <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Staging is complete. Review the spreadsheets below, choose what should continue, then send the selection to Queue.
            </div>
          ) : null}

          <div className="max-h-[30rem] min-h-0 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
            {stagedSpreadsheets.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(19,27,52,0.74)]">
                <p className="text-base font-semibold text-slate-950 dark:text-slate-100">No spreadsheets staged yet</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-[#95A7CB]">
                  Stage one or more selected spreadsheets to make them ready for queue send.
                </p>
              </div>
            ) : (
              stagedSpreadsheets.map((record) => (
                <StagedSpreadsheetRow
                  key={record.id}
                  record={record}
                  selected={selectedStagedIds.has(record.id)}
                  onToggle={() => toggleStagedSelection(record.id)}
                />
              ))
            )}
          </div>
        </section>

        <section className="app-surface-panel rounded-[26px] px-5 py-4 dark:border-[rgba(88,108,186,0.34)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <SectionHeading>Activity</SectionHeading>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-100">Recent movement</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-[#95A7CB]">Scans, staging, and queue sends appear here as they happen.</p>
          </div>
          {activity.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(19,27,52,0.74)] dark:text-[#95A7CB]">
              Nothing has happened yet. Your scan, stage, and send events will show up here.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {activity.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 rounded-[22px] border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-[rgba(88,108,186,0.24)] dark:bg-[rgba(19,27,52,0.74)]">
                  <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400 dark:text-[#8B97B7]" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{entry.label}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-[#95A7CB]">{entry.detail}</p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-[#8B97B7]">{formatDateTime(entry.occurredAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmModal
        open={modalOpen}
        selectedRecords={selectedScanRecords}
        reimportStrategy={reimportStrategy}
        onStrategyChange={setReimportStrategy}
        onCancel={() => {
          setModalOpen(false);
          setModalError(null);
        }}
        onConfirm={() => void confirmStageSelected()}
        confirming={isStaging}
      />

      {modalError ? (
        <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-lg dark:border-rose-500/35 dark:bg-[rgba(76,16,32,0.88)] dark:text-rose-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{modalError}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
