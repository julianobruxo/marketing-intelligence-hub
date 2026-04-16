"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DRIVE_IMPORT_KEYWORD,
  MOCK_DRIVE_IMPORT_FOLDER,
  getDriveImportSourceGroups,
  groupDriveImportSpreadsheets,
  listDriveImportSpreadsheets,
  type DriveSourceGroup,
  type DriveSpreadsheetRecord,
} from "@/modules/content-intake/infrastructure/drive-import-catalog";
import {
  commitImportAction,
  previewImportAction,
  type CommitResult,
  type PreviewResult,
  type RowOutcome,
} from "@/modules/content-intake/application/import-wizard-actions";

type WizardStep = "drive" | "worksheet" | "preview" | "commit";

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

function outcomeLabel(outcome: RowOutcome): string {
  switch (outcome) {
    case "IMPORTED":
      return "Will import";
    case "REPROCESSED":
      return "Reprocess";
    case "DUPLICATE":
      return "Duplicate";
    case "SKIPPED":
      return "Skipped";
    case "REJECTED":
      return "Rejected";
  }
}

function outcomeBadgeClass(outcome: RowOutcome): string {
  switch (outcome) {
    case "IMPORTED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "REPROCESSED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "DUPLICATE":
      return "border-slate-200 bg-slate-100 text-slate-500";
    case "SKIPPED":
      return "border-slate-200 bg-slate-50 text-slate-400";
    case "REJECTED":
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

function outcomeRowClass(outcome: RowOutcome): string {
  switch (outcome) {
    case "IMPORTED":
      return "hover:bg-slate-50/60";
    case "REPROCESSED":
      return "border-l-2 border-amber-300 bg-amber-50/30 hover:bg-amber-50/60";
    case "DUPLICATE":
      return "opacity-60 hover:opacity-80";
    case "SKIPPED":
      return "opacity-50 hover:opacity-70";
    case "REJECTED":
      return "border-l-2 border-rose-300 bg-rose-50/30 hover:bg-rose-50/60";
  }
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatSourceGroup(group: DriveSourceGroup | "ALL") {
  return group === "ALL" ? "All" : group;
}

function SourceContextPills({ record }: { record: DriveSpreadsheetRecord }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
        <FolderOpen className="h-3 w-3" />
        {record.folderName}
      </span>
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
        {record.sourceContext.sourceGroup}
      </span>
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
        {record.sourceContext.region}
      </span>
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
        {record.sourceContext.audience}
      </span>
    </div>
  );
}

function SpreadsheetRow({
  record,
  selected,
  onSelect,
}: {
  record: DriveSpreadsheetRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-default",
        selected
          ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_36px_rgba(15,23,42,0.16)]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className={cn("h-4 w-4", selected ? "text-white" : "text-slate-500")} />
          <p className="truncate font-medium">{record.spreadsheetName}</p>
        </div>
        <p className={cn("text-sm leading-6", selected ? "text-slate-300" : "text-slate-500")}>
          {record.description}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-1 font-medium",
              selected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600",
            )}
          >
            {record.sourceContext.owner}
          </span>
          {record.sourceContext.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 font-medium",
                selected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600",
              )}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="shrink-0 space-y-2 text-right">
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
            selected
              ? "border-white/20 bg-white/10 text-white"
              : "border-slate-200 bg-slate-50 text-slate-500",
          )}
        >
          {record.worksheets.length} tabs
        </span>
        <div className="text-[11px] leading-5 text-slate-400">
          {record.sourceContext.sourceGroup}
          <br />
          {record.sourceContext.region}
        </div>
      </div>
    </button>
  );
}

function SourceContextCard({ record }: { record: DriveSpreadsheetRecord }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            Source context
          </p>
          <h2 className="mt-2 text-base font-semibold text-slate-950">{record.spreadsheetName}</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
          {record.sheetProfileKey}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetaCard label="Owner" value={record.sourceContext.owner} />
        <MetaCard label="Source group" value={record.sourceContext.sourceGroup} />
        <MetaCard label="Region" value={record.sourceContext.region} />
        <MetaCard label="Audience" value={record.sourceContext.audience} />
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Tags</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {record.sourceContext.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function DirectoryStep({
  spreadsheets,
  selectedSpreadsheet,
  selectedSpreadsheetId,
  onSelectSpreadsheet,
  onContinue,
}: {
  spreadsheets: DriveSpreadsheetRecord[];
  selectedSpreadsheet: DriveSpreadsheetRecord | null;
  selectedSpreadsheetId: string;
  onSelectSpreadsheet: (spreadsheet: DriveSpreadsheetRecord) => void;
  onContinue: () => void;
}) {
  const grouped = useMemo(() => groupDriveImportSpreadsheets(spreadsheets), [spreadsheets]);
  const sourceGroups = getDriveImportSourceGroups();

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Google Drive-first import
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Select a spreadsheet, then choose a worksheet.
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-500">
          Browse the designated Drive folder, search across all files, and filter to spreadsheets
          that match{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
            {DRIVE_IMPORT_KEYWORD}
          </code>
          .
        </p>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Browse Drive folder</p>
            <p className="text-sm text-slate-500">{MOCK_DRIVE_IMPORT_FOLDER}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500">
            <Search className="h-3 w-3" />
            {spreadsheets.length} matching spreadsheets
          </span>
        </div>

        <div className="mt-4 space-y-5">
          {sourceGroups.map((group) => {
            const groupRows = group === "ALL" ? spreadsheets : grouped[group];

            if (groupRows.length === 0) {
              return null;
            }

            return (
              <div key={group} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    {formatSourceGroup(group)}
                  </p>
                  <span className="text-xs text-slate-400">{groupRows.length}</span>
                </div>
                <div className="space-y-3">
                  {groupRows.map((record) => (
                    <SpreadsheetRow
                      key={record.driveFileId}
                      record={record}
                      selected={selectedSpreadsheetId === record.driveFileId}
                      onSelect={() => onSelectSpreadsheet(record)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selectedSpreadsheet ? <SourceContextCard record={selectedSpreadsheet} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {selectedSpreadsheet
            ? `Selected: ${selectedSpreadsheet.spreadsheetName}`
            : "Choose a spreadsheet from the folder to continue."}
        </p>
        <Button
          onClick={onContinue}
          disabled={!selectedSpreadsheet}
          className="transition-default disabled:opacity-50"
          style={{ backgroundColor: "#E8584A", color: "white" }}
        >
          Select worksheet
        </Button>
      </div>
    </div>
  );
}

function WorksheetStep({
  spreadsheet,
  selectedWorksheetId,
  onSelectWorksheet,
  onBack,
  onPreview,
  isLoading,
}: {
  spreadsheet: DriveSpreadsheetRecord;
  selectedWorksheetId: string;
  onSelectWorksheet: (worksheetId: string) => void;
  onBack: () => void;
  onPreview: () => void;
  isLoading: boolean;
}) {
  const selectedWorksheet =
    spreadsheet.worksheets.find((worksheet) => worksheet.worksheetId === selectedWorksheetId) ??
    spreadsheet.worksheets[0] ??
    null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Worksheet selection
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Choose a tab in {spreadsheet.spreadsheetName}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-500">
          Select the worksheet you want to normalize. Switching spreadsheets clears this selection
          and any dependent preview state.
        </p>
      </div>

      <SourceContextCard record={spreadsheet} />

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {spreadsheet.worksheets.map((worksheet) => {
            const selected = worksheet.worksheetId === selectedWorksheetId;

            return (
              <button
                key={worksheet.worksheetId}
                type="button"
                onClick={() => onSelectWorksheet(worksheet.worksheetId)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-sm transition-default",
                  selected
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">
                    {worksheet.worksheetName.slice(0, 1)}
                  </span>
                  <span className="font-medium">{worksheet.worksheetName}</span>
                </div>
                {selected ? <p className="mt-1 text-xs text-slate-300">Selected for preview</p> : null}
              </button>
            );
          })}
        </div>

        {selectedWorksheet ? (
          <p className="mt-4 text-sm text-slate-500">
            Selected tab: <span className="font-medium text-slate-900">{selectedWorksheet.worksheetName}</span>
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          onClick={onBack}
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Drive
        </Button>
        <Button
          onClick={onPreview}
          disabled={isLoading}
          className="transition-default disabled:opacity-50"
          style={{ backgroundColor: "#E8584A", color: "white" }}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Loading preview...
            </>
          ) : (
            "Preview normalized rows"
          )}
        </Button>
      </div>
    </div>
  );
}

function PreviewStep({
  preview,
  onCommit,
  onBack,
  isLoading,
}: {
  preview: PreviewResult;
  onCommit: () => void;
  onBack: () => void;
  isLoading: boolean;
}) {
  const hasCommittable = preview.counts.imported + preview.counts.reprocessed > 0;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Preview</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Review normalized rows before importing
        </h1>
        <p className="text-sm text-slate-500">
          Source: {preview.source.sourceContext.sourceGroup} · {preview.source.spreadsheetName} ·{" "}
          {preview.source.worksheetName}
        </p>
      </div>

      <SourceContextCard
        record={{
          driveFileId: preview.source.driveFileId,
          spreadsheetId: preview.source.spreadsheetId,
          spreadsheetName: preview.source.spreadsheetName,
          folderName: preview.source.folderName,
          description: preview.source.sourceContext.audience,
          sourceContext: preview.source.sourceContext,
          sheetProfileKey: "preview",
          sheetProfileVersion: 1,
          worksheets: [],
        }}
      />

      <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <span className="font-semibold text-emerald-600">{preview.counts.imported}</span>
            <span className="ml-1 text-slate-500">will import</span>
          </div>
          {preview.counts.reprocessed > 0 ? (
            <div>
              <span className="font-semibold text-amber-500">{preview.counts.reprocessed}</span>
              <span className="ml-1 text-slate-500">reprocess</span>
            </div>
          ) : null}
          <div>
            <span className="font-semibold text-slate-400">{preview.counts.duplicate}</span>
            <span className="ml-1 text-slate-500">duplicate</span>
          </div>
          <div>
            <span className="font-semibold text-slate-400">{preview.counts.skipped}</span>
            <span className="ml-1 text-slate-500">skipped</span>
          </div>
          <div>
            <span className="font-semibold text-rose-500">{preview.counts.rejected}</span>
            <span className="ml-1 text-slate-500">rejected</span>
          </div>
          <div className="ml-auto text-slate-500">{preview.counts.total} total rows</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto_auto_7rem_minmax(0,1fr)] items-center gap-x-4 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
          <span>#</span>
          <span>Title</span>
          <span>Profile</span>
          <span>Type</span>
          <span>Outcome</span>
          <span>Reason</span>
        </div>

        <div>
          {preview.rows.map((row) => (
            <div
              key={row.rowId}
              className={cn(
                "grid grid-cols-[3rem_minmax(0,1fr)_auto_auto_7rem_minmax(0,1fr)] items-center gap-x-4 border-b border-slate-100 px-5 py-3 text-sm last:border-b-0 transition",
                outcomeRowClass(row.outcome),
              )}
            >
              <span className="text-xs text-slate-400">{row.rowNumber}</span>
              <p className="truncate font-medium text-slate-900">{row.title}</p>
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                style={profileBadgeStyle(row.profile)}
              >
                {formatProfileLabel(row.profile)}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 whitespace-nowrap">
                {row.contentType === "STATIC_POST" ? "Static" : "Carousel"}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                  outcomeBadgeClass(row.outcome),
                )}
              >
                {outcomeLabel(row.outcome)}
              </span>
              <p
                className={cn(
                  "truncate text-xs",
                  row.outcome === "REJECTED" ? "text-rose-600" : "text-slate-500",
                )}
              >
                {row.reason || "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onCommit}
          disabled={!hasCommittable || isLoading}
          className="transition-default disabled:opacity-50"
          style={{ backgroundColor: "#E8584A", color: "white" }}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Importing rows...
            </>
          ) : (
            "Import into platform"
          )}
        </Button>
        <Button
          onClick={onBack}
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to worksheet
        </Button>
        {!hasCommittable ? (
          <p className="text-sm text-slate-500">
            No importable rows remain. Everything in this tab is duplicate, skipped, or rejected.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CommitResultStep({
  result,
  onImportMore,
}: {
  result: CommitResult;
  onImportMore: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 flex-shrink-0 text-emerald-500" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Import complete</h1>
          <p className="mt-1 text-sm text-slate-500">
            Content is now in the queue and ready for the next Pipeline #1 workflow step.
          </p>
        </div>
      </div>

      <SourceContextCard
        record={{
          driveFileId: result.source.driveFileId,
          spreadsheetId: result.source.spreadsheetId,
          spreadsheetName: result.source.spreadsheetName,
          folderName: result.source.folderName,
          description: result.source.sourceContext.audience,
          sourceContext: result.source.sourceContext,
          sheetProfileKey: "result",
          sheetProfileVersion: 1,
          worksheets: [],
        }}
      />

      <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 space-y-3 shadow-sm">
        <SummaryRow
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          label="Imported"
          value={`${result.counts.imported} item${result.counts.imported !== 1 ? "s" : ""}`}
        />
        {result.counts.reprocessed > 0 ? (
          <SummaryRow
            icon={<span className="inline-block h-4 w-4 text-center text-amber-500">↻</span>}
            label="Reprocessed"
            value={`${result.counts.reprocessed} item${result.counts.reprocessed !== 1 ? "s" : ""}`}
          />
        ) : null}
        <SummaryRow
          icon={<span className="inline-block h-4 w-4 text-center text-slate-400">—</span>}
          label="Skipped"
          value={`${result.counts.skipped} row${result.counts.skipped !== 1 ? "s" : ""}`}
        />
        <SummaryRow
          icon={<AlertTriangle className="h-4 w-4 text-rose-400" />}
          label="Rejected"
          value={`${result.counts.rejected} row${result.counts.rejected !== 1 ? "s" : ""}`}
        />
        <div className="border-t border-slate-100 pt-3 text-sm text-slate-500">
          {result.counts.total} total rows processed
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 space-y-2 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Drive source
        </p>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Folder</span>
            <span className="text-slate-900">{result.source.folderName}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Spreadsheet</span>
            <span className="text-slate-900">{result.source.spreadsheetName}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Worksheet</span>
            <span className="text-slate-900">{result.source.worksheetName}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Source group</span>
            <span className="text-slate-900">{result.source.sourceContext.sourceGroup}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Completed</span>
            <span className="text-slate-900">{formatDateTime(result.completedAt)}</span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild className="transition-default" style={{ backgroundColor: "#E8584A", color: "white" }}>
          <Link href="/queue">View in queue</Link>
        </Button>
        <Button
          onClick={onImportMore}
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Import another spreadsheet
        </Button>
        {result.firstImportedItemId ? (
          <Link
            href={`/queue/${result.firstImportedItemId}`}
            className="flex items-center gap-1 text-sm text-slate-500 underline underline-offset-2 hover:text-slate-900"
          >
            View first imported item
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

export function ImportWizard() {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<DriveSourceGroup | "ALL">("ALL");
  const spreadsheets = useMemo(
    () =>
      listDriveImportSpreadsheets({
        query,
        sourceGroup: activeGroup,
      }),
    [query, activeGroup],
  );
  const allSpreadsheets = useMemo(() => listDriveImportSpreadsheets(), []);
  const [step, setStep] = useState<WizardStep>("drive");
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState(
    allSpreadsheets[0]?.driveFileId ?? "",
  );
  const [selectedWorksheetId, setSelectedWorksheetId] = useState(
    allSpreadsheets[0]?.worksheets[0]?.worksheetId ?? "",
  );
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const selectedSpreadsheet = useMemo(
    () =>
      allSpreadsheets.find((spreadsheet) => spreadsheet.driveFileId === selectedSpreadsheetId) ??
      null,
    [allSpreadsheets, selectedSpreadsheetId],
  );

  const selectedWorksheet = useMemo(() => {
    if (!selectedSpreadsheet) {
      return null;
    }

    return (
      selectedSpreadsheet.worksheets.find(
        (worksheet) => worksheet.worksheetId === selectedWorksheetId,
      ) ?? selectedSpreadsheet.worksheets[0] ?? null
    );
  }, [selectedSpreadsheet, selectedWorksheetId]);

  function selectSpreadsheet(spreadsheet: DriveSpreadsheetRecord) {
    setSelectedSpreadsheetId(spreadsheet.driveFileId);
    setSelectedWorksheetId(spreadsheet.worksheets[0]?.worksheetId ?? "");
    setPreview(null);
    setCommitResult(null);
    setStep("drive");
  }

  function selectWorksheet(worksheetId: string) {
    setSelectedWorksheetId(worksheetId);
    setPreview(null);
    setCommitResult(null);
  }

  function resetToDrive() {
    setStep("drive");
    setPreview(null);
    setCommitResult(null);
  }

  async function handlePreview() {
    if (!selectedSpreadsheet || !selectedWorksheet) {
      return;
    }

    setIsPreviewing(true);
    try {
      const result = await previewImportAction(
        selectedSpreadsheet.driveFileId,
        selectedWorksheet.worksheetName,
      );
      setPreview(result);
      setCommitResult(null);
      setStep("preview");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleCommit() {
    if (!selectedSpreadsheet || !selectedWorksheet) {
      return;
    }

    setIsImporting(true);
    try {
      const result = await commitImportAction(
        selectedSpreadsheet.driveFileId,
        selectedWorksheet.worksheetName,
      );
      setCommitResult(result);
      setStep("commit");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {step !== "drive" ? (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <button
            type="button"
            onClick={
              step === "worksheet" ? resetToDrive : step === "preview" ? () => setStep("worksheet") : () => setStep("worksheet")
            }
            className="flex items-center gap-1 hover:text-slate-700"
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>
          <span>·</span>
          <span>
            {step === "worksheet" ? "Spreadsheet" : step === "preview" ? "Preview" : "Result"}
          </span>
        </div>
      ) : null}

      {step === "drive" ? (
        <DirectoryStep
          spreadsheets={spreadsheets}
          selectedSpreadsheet={selectedSpreadsheet}
          selectedSpreadsheetId={selectedSpreadsheetId}
          onSelectSpreadsheet={selectSpreadsheet}
          onContinue={() => setStep("worksheet")}
        />
      ) : null}

      {step === "worksheet" && selectedSpreadsheet && selectedWorksheet ? (
        <WorksheetStep
          spreadsheet={selectedSpreadsheet}
          selectedWorksheetId={selectedWorksheetId}
          onSelectWorksheet={selectWorksheet}
          onBack={resetToDrive}
          onPreview={handlePreview}
          isLoading={isPreviewing}
        />
      ) : null}

      {step === "preview" && preview ? (
        <PreviewStep
          preview={preview}
          onCommit={handleCommit}
          onBack={() => setStep("worksheet")}
          isLoading={isImporting}
        />
      ) : null}

      {step === "commit" && commitResult ? (
        <CommitResultStep
          result={commitResult}
          onImportMore={() => {
            resetToDrive();
            setSelectedSpreadsheetId(allSpreadsheets[0]?.driveFileId ?? "");
            setSelectedWorksheetId(allSpreadsheets[0]?.worksheets[0]?.worksheetId ?? "");
          }}
        />
      ) : null}
    </div>
  );
}
