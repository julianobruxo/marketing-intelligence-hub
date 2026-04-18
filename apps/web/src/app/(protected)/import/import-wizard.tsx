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

function formatReimportStrategy(value: DriveReimportStrategy) {
  return value.toLowerCase().replaceAll("_", " ");
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

function getRecordSummary(record: DriveSpreadsheetRecord) {
  return `${record.sourceContext.owner} - ${formatDriveSourceGroupLabel(record.sourceContext.sourceGroup)} - ${record.sourceContext.region}`;
}

function getStageStatusLabel(record: StagedSpreadsheetSnapshot) {
  switch (record.state) {
    case "SENT_TO_QUEUE":
      return "Queued";
    case "PARTIALLY_SENT":
      return "Partially queued";
    case "NEEDS_REIMPORT_DECISION":
      return "Needs decision";
    default:
      return "Staged";
  }
}

function getStageTone(record: StagedSpreadsheetSnapshot) {
  switch (record.state) {
    case "SENT_TO_QUEUE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "PARTIALLY_SENT":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "NEEDS_REIMPORT_DECISION":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
      {children}
    </span>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{children}</p>;
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
        "group flex cursor-pointer items-start justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-default",
        selected
          ? "border-slate-950 bg-slate-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only" />

      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 bg-slate-50 text-slate-500",
          )}
        >
          {selected ? <CheckCircle2 className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-950">{record.spreadsheetName}</p>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-600">
              {DRIVE_IMPORT_KEYWORD}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-600">
              {formatDriveSourceGroupLabel(record.sourceContext.sourceGroup)}
            </Badge>
          </div>

          <p className="mt-1 text-sm leading-6 text-slate-500">{record.description}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MetaChip>{record.sourceContext.owner}</MetaChip>
            <MetaChip>{record.sourceContext.region}</MetaChip>
            {record.sourceContext.tags.slice(0, 2).map((tag) => (
              <MetaChip key={tag}>{tag}</MetaChip>
            ))}
            {record.matchingSignals.slice(0, 2).map((signal) => (
              <MetaChip key={signal}>{signal}</MetaChip>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
          <FolderOpen className="h-3 w-3" />
          {record.worksheets.length > 0 ? `${record.worksheets.length} tabs` : "Worksheets auto-detected"}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">Updated {formatDate(record.lastUpdatedAt)}</p>
        <p className="mt-1 max-w-[16rem] text-[11px] leading-5 text-slate-400">{getRecordSummary(record)}</p>
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
        "group flex cursor-pointer items-start justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-default",
        selected
          ? "border-slate-950 bg-slate-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only" />

      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 bg-slate-50 text-slate-500",
          )}
        >
          {selected ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-950">{record.spreadsheetName}</p>
            <Badge variant="outline" className={cn("text-[11px]", getStageTone(record))}>
              {getStageStatusLabel(record)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-600">
              {formatReimportStrategy(record.reimportStrategy)}
            </Badge>
          </div>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            {record.owner} - {formatDriveSourceGroupLabel(record.sourceGroup as DriveSourceGroup)} - {record.lastUpdatedAt ? formatDate(record.lastUpdatedAt) : "Unknown update"}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MetaChip>{record.totalRowsDetected} rows</MetaChip>
            <MetaChip>{record.qualifiedRowsDetected} valid</MetaChip>
            <MetaChip>{record.alreadyPublishedRowCount} already published</MetaChip>
            <MetaChip>{record.conflictRowsDetected} conflicts</MetaChip>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Imported {record.importedRowCount}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Updated {record.updatedRowCount}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Replaced {record.replacedRowCount}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Kept {record.keptRowCount}
            </span>
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Imported</p>
        <p className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(record.importedAt)}</p>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-confirm-title"
        className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Confirm import</p>
            <h2 id="import-confirm-title" className="mt-1 text-xl font-semibold text-slate-950">
              Stage selected spreadsheets
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              The platform will inspect the selected spreadsheets, auto-pick valid worksheets, normalize their rows,
              and store the results in staging before queue ingestion.
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-default hover:border-slate-400 hover:text-slate-900"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {selectedRecords.map((record) => (
            <div key={record.driveFileId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{record.spreadsheetName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {record.sourceContext.owner} - {formatDriveSourceGroupLabel(record.sourceContext.sourceGroup)}
                  </p>
                </div>
                <Badge variant="outline" className="border-slate-200 bg-white text-[11px] text-slate-600">
                  {record.worksheets.length > 0 ? `${record.worksheets.length} tabs` : "Auto-detected"}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Reimport strategy</p>
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
                      ? "border-slate-950 bg-white text-slate-950 shadow-sm"
                      : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white",
                  )}
                >
                  <p className="font-semibold">{formatReimportStrategy(option)}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {option === "UPDATE"
                      ? "Update matching workflow items when the same source row is already known."
                      : option === "REPLACE"
                        ? "Replace the existing item with the latest spreadsheet version."
                        : "Keep the current item as-is and preserve the existing workflow state."}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            The selected spreadsheets will be staged first. Valid rows enter the Workflow Queue only after the next
            confirmation step.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
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

  return (
    <>
      <div className="space-y-5">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">
                  Drive-first import
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-600">
                  {DRIVE_IMPORT_FOLDER_NAME}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] text-slate-600">
                  {DRIVE_IMPORT_KEYWORD}
                </Badge>
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  Scan Drive, stage spreadsheets, then move valid rows into the Workflow Queue.
                </h1>
                <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
                  The editorial copy stays read-only in Google Sheets. This surface discovers spreadsheet records,
                  stages them in the platform, and sends valid rows into operational queue items.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => {
                    setScanState("armed");
                    void performScan();
                  }}
                  disabled={isScanning}
                  className="transition-default disabled:opacity-50"
                  style={{ backgroundColor: "#E8584A", color: "white" }}
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Scanning Drive...
                    </>
                  ) : (
                    "Scan Drive for spreadsheets"
                  )}
                </Button>
                <Button variant="outline" asChild className="border-slate-300 text-slate-700 hover:bg-slate-50">
                  <Link href="/queue">Open Workflow Queue</Link>
                </Button>
                <span className="text-sm text-slate-500">
                  {scanState === "idle"
                    ? "Click scan to arm import mode."
                    : scanState === "armed"
                      ? "Drive scan armed and ready."
                      : "Staged spreadsheets are retained until queue send."}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[30rem]">
              <SummaryCard
                label="Spreadsheets found"
                value={String(foundCount)}
                detail={scanState === "ready" ? "Matched by pipeline guidance" : "Waiting for Drive scan"}
              />
              <SummaryCard
                label="Spreadsheets staged"
                value={String(stagedCount)}
                detail="Imported records already resident in the app"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Rows detected" value={String(detectedRows)} detail="Auto-picked worksheets and row discovery" />
          <SummaryCard label="Rows queued" value={String(queuedRows)} detail="Valid rows already sent downstream" />
          <SummaryCard label="Conflicts detected" value={String(conflictCount)} detail="Duplicate and reimport suggestions surfaced" />
          <SummaryCard label="Already published" value={String(alreadyPublishedCount)} detail="Rows imported as concluded work" />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeading>Drive scan results</SectionHeading>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <label className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Search</label>
              <div className="mt-1 flex gap-2">
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
                    placeholder="Search by spreadsheet name, owner, region, tags, or file path"
                    className="h-11 border-slate-200 pl-9"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAppliedQuery(query);
                    setPage(1);
                  }}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Scan
                </Button>
              </div>
            </div>

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
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-default",
                      isActive
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    {formatSourceGroupLabel(group)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <p>{buildSelectionLabel(selectedSpreadsheetIds.size, "spreadsheet")}</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={selectCurrentPage}
                disabled={!scanResult || scanResult.results.length === 0}
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Select page
              </Button>
              <Button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={selectedSpreadsheetIds.size === 0}
                className="transition-default disabled:opacity-50"
                style={{ backgroundColor: "#E8584A", color: "white" }}
              >
                Import selected
              </Button>
            </div>
          </div>

          <div className="mt-4 max-h-[34rem] min-h-0 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
            {visibleScanRecords.length ? (
              visibleScanRecords.map((record) => (
                <SpreadsheetResultRow
                  key={record.driveFileId}
                  record={record}
                  selected={selectedSpreadsheetIds.has(record.driveFileId)}
                  onToggle={() => toggleSpreadsheetSelection(record)}
                />
              ))
            ) : scanState === "ready" ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-900">No spreadsheets found</p>
                <p className="mt-2 text-sm text-slate-500">
                  Try another search term or a different source filter.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-900">Drive scan is not active yet</p>
                <p className="mt-2 text-sm text-slate-500">
                  Click <span className="font-medium text-slate-900">Scan Drive for spreadsheets</span> to discover
                  matching files inside the configured folder.
                </p>
              </div>
            )}
          </div>

          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1));
                }}
                disabled={page <= 1 || isScanning}
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Previous
              </Button>
              <p className="text-sm text-slate-500">
                Page {page} of {pageCount}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setPage((current) => Math.min(pageCount, current + 1));
                }}
                disabled={page >= pageCount || isScanning}
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Next
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeading>Imported / staged spreadsheets</SectionHeading>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-3xl text-sm text-slate-500">
              Imported spreadsheets are staged here first. Review the summaries, then send the selected items into the
              Workflow Queue when you are ready.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => void sendSelectedToWorkflowQueue()}
                disabled={selectedStagedIds.size === 0 || isSending}
                className="transition-default disabled:opacity-50"
                style={{ backgroundColor: "#E8584A", color: "white" }}
              >
                {isSending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send selected to Workflow Queue"
                )}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <p>{buildSelectionLabel(selectedStagedIds.size, "staged spreadsheet")}</p>
            <p>
              {stagedCount === 0
                ? "Nothing staged yet"
                : `${stagedCount} staged spreadsheet${stagedCount === 1 ? "" : "s"} available`}
            </p>
          </div>

          <div className="mt-4 max-h-[30rem] min-h-0 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
            {stagedSpreadsheets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-900">No spreadsheets staged yet</p>
                <p className="mt-2 text-sm text-slate-500">
                  Stage one or more selected spreadsheets to make them available for queue ingestion.
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

        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <SectionHeading>Activity</SectionHeading>
          {activity.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              Drive scans, staging, and queue sends will appear here.
            </div>
          ) : (
            <div className="space-y-3">
              {activity.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{entry.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{entry.detail}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(entry.occurredAt)}</p>
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
        <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{modalError}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
