"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AvailableSheetProfile } from "@/modules/content-intake/infrastructure/mock-import-provider";
import {
  previewImportAction,
  commitImportAction,
  type PreviewResult,
  type CommitResult,
  type RowOutcome,
} from "@/modules/content-intake/application/import-wizard-actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = "source" | "preview" | "commit";

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
      return profile.toLowerCase().replace(/_/g, " ");
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

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// ─── Step 1 — Source selection ────────────────────────────────────────────────

function SourceStep({
  profiles,
  onPreview,
}: {
  profiles: AvailableSheetProfile[];
  onPreview: (profileKey: string, worksheetName: string) => void;
}) {
  const [profileKey, setProfileKey] = useState(profiles[0]?.key ?? "");
  const [worksheetName, setWorksheetName] = useState("");
  const [orchestrator, setOrchestrator] = useState("MANUAL");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!profileKey.trim()) {
      setError("Please select a sheet profile.");
      return;
    }
    if (!worksheetName.trim()) {
      setError("Please enter a worksheet name.");
      return;
    }

    startTransition(() => {
      onPreview(profileKey, worksheetName.trim());
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Import from Google Sheets
        </h1>
        <p className="mt-1.5 text-sm leading-6 text-slate-500">
          Select a sheet profile and worksheet to import content into the
          platform. A preview will show you exactly what will be created before
          anything is committed.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-[20px] border border-slate-200 bg-white px-6 py-5"
      >
        {/* A) Sheet profile */}
        <div className="space-y-2">
          <label
            htmlFor="profileKey"
            className="block text-sm font-medium text-slate-700"
          >
            Sheet profile
          </label>
          <select
            id="profileKey"
            value={profileKey}
            onChange={(e) => setProfileKey(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            {profiles.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key}
              </option>
            ))}
          </select>
          {profileKey && (
            <p className="text-xs text-slate-500">
              {profiles.find((p) => p.key === profileKey)?.description}
            </p>
          )}
        </div>

        {/* B) Worksheet name */}
        <div className="space-y-2">
          <label
            htmlFor="worksheetName"
            className="block text-sm font-medium text-slate-700"
          >
            Worksheet name or tab
          </label>
          <input
            id="worksheetName"
            type="text"
            value={worksheetName}
            onChange={(e) => setWorksheetName(e.target.value)}
            placeholder="e.g., April 2026"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>

        {/* C) Orchestrator */}
        <div className="space-y-2">
          <label
            htmlFor="orchestrator"
            className="block text-sm font-medium text-slate-700"
          >
            Orchestrator
          </label>
          <select
            id="orchestrator"
            value={orchestrator}
            onChange={(e) => setOrchestrator(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="MANUAL">Manual</option>
            <option value="ZAPIER">Zapier</option>
            <option value="N8N">n8n</option>
          </select>
          <p className="text-xs text-slate-500">
            UI-triggered imports default to Manual. This is recorded in the
            import receipt for tracing.
          </p>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-rose-600">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={isPending}
          className="transition-default"
          style={{ backgroundColor: '#E8584A', color: 'white' }}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Running preview…
            </>
          ) : (
            "Preview import"
          )}
        </Button>
      </form>
    </div>
  );
}

// ─── Step 2 — Preview ─────────────────────────────────────────────────────────

function PreviewStep({
  preview,
  onCommit,
  onCancel,
}: {
  preview: PreviewResult;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const hasCommittable =
    preview.counts.imported + preview.counts.reprocessed > 0;

  function handleCommit() {
    startTransition(() => {
      onCommit();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Import preview
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Source: {preview.sheetProfileKey} · {preview.worksheetName} ·{" "}
          {preview.orchestrator}
        </p>
      </div>

      {/* Summary strip */}
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <span className="font-semibold text-emerald-600">
              {preview.counts.imported}
            </span>
            <span className="ml-1 text-slate-500">will import</span>
          </div>
          {preview.counts.reprocessed > 0 && (
            <div>
              <span className="font-semibold text-amber-500">
                {preview.counts.reprocessed}
              </span>
              <span className="ml-1 text-slate-500">reprocess</span>
            </div>
          )}
          <div>
            <span className="font-semibold text-slate-400">
              {preview.counts.duplicate}
            </span>
            <span className="ml-1 text-slate-500">duplicate</span>
          </div>
          <div>
            <span className="font-semibold text-slate-400">
              {preview.counts.skipped}
            </span>
            <span className="ml-1 text-slate-500">skipped</span>
          </div>
          <div>
            <span className="font-semibold text-rose-500">
              {preview.counts.rejected}
            </span>
            <span className="ml-1 text-slate-500">rejected</span>
          </div>
          <div className="ml-auto text-slate-500">
            {preview.counts.total} total rows
          </div>
        </div>
      </section>

      {/* Row table */}
      <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white">
        {/* Column headers */}
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
                  row.outcome === "REJECTED"
                    ? "text-rose-600"
                    : "text-slate-500",
                )}
              >
                {row.reason || "—"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleCommit}
          disabled={!hasCommittable || isPending}
          className="transition-default disabled:opacity-50"
          style={{ backgroundColor: '#E8584A', color: 'white' }}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Importing content…
            </>
          ) : (
            "Commit import"
          )}
        </Button>
        <Button
          onClick={onCancel}
          variant="outline"
          disabled={isPending}
          className="border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Button>
        {!hasCommittable && (
          <p className="text-sm text-slate-500">
            No importable rows — all rows are duplicates, skipped, or rejected.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Step 3 — Commit result ───────────────────────────────────────────────────

function CommitResultStep({
  result,
  onImportMore,
}: {
  result: CommitResult;
  onImportMore: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 flex-shrink-0 text-emerald-500" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Import complete
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Content is now in the queue with status Imported.
          </p>
        </div>
      </div>

      {/* Result summary */}
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 space-y-3">
        <SummaryRow
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          label="Imported"
          value={`${result.counts.imported} item${result.counts.imported !== 1 ? "s" : ""}`}
        />
        {result.counts.reprocessed > 0 && (
          <SummaryRow
            icon={<RefreshCw className="h-4 w-4 text-amber-500" />}
            label="Reprocessed"
            value={`${result.counts.reprocessed} item${result.counts.reprocessed !== 1 ? "s" : ""}`}
          />
        )}
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

      {/* Receipt info */}
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Import receipt
        </p>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Receipts recorded</span>
            <span className="text-slate-900">{result.receiptIds.length}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Mode</span>
            <span className="text-slate-900">COMMIT</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Orchestrator</span>
            <span className="text-slate-900">{result.orchestrator}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Source</span>
            <span className="text-slate-900">
              {result.sheetProfileKey} · {result.worksheetName}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-slate-500">Completed</span>
            <span className="text-slate-900">{formatDateTime(result.completedAt)}</span>
          </div>
        </div>
      </section>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild className="transition-default" style={{ backgroundColor: '#E8584A', color: 'white' }}>
          <Link href="/queue">View in queue</Link>
        </Button>
        <Button
          onClick={onImportMore}
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Import more
        </Button>
        {result.firstImportedItemId && (
          <Link
            href={`/queue/${result.firstImportedItemId}`}
            className="flex items-center gap-1 text-sm text-slate-500 underline underline-offset-2 hover:text-slate-900"
          >
            View first imported item
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
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

// ─── Main wizard ──────────────────────────────────────────────────────────────

interface ImportWizardProps {
  profiles: AvailableSheetProfile[];
}

export function ImportWizard({ profiles }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("source");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [pendingProfile, setPendingProfile] = useState<string>("");
  const [pendingWorksheet, setPendingWorksheet] = useState<string>("");

  // Step 1 → Step 2
  async function handlePreview(profileKey: string, worksheetName: string) {
    setPendingProfile(profileKey);
    setPendingWorksheet(worksheetName);
    const result = await previewImportAction(profileKey, worksheetName);
    setPreview(result);
    setStep("preview");
  }

  // Step 2 → Step 3
  async function handleCommit() {
    if (!preview) return;
    const result = await commitImportAction(
      preview.sheetProfileKey,
      preview.worksheetName,
    );
    setCommitResult(result);
    setStep("commit");
  }

  // Step 2 → Step 1
  function handleCancel() {
    setPreview(null);
    setStep("source");
  }

  // Step 3 → Step 1
  function handleImportMore() {
    setPreview(null);
    setCommitResult(null);
    setPendingProfile("");
    setPendingWorksheet("");
    setStep("source");
  }

  return (
    <>
      {/* Breadcrumb / step indicator */}
      {step !== "source" && (
        <div className="mb-4 flex items-center gap-1.5 text-xs text-slate-400">
          <button
            type="button"
            onClick={step === "preview" ? handleCancel : handleImportMore}
            className="flex items-center gap-1 hover:text-slate-700"
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>
          <span>·</span>
          <span>
            Step {step === "preview" ? "2" : "3"} of 3 —{" "}
            {step === "preview" ? "Preview" : "Result"}
          </span>
        </div>
      )}

      {step === "source" && (
        <SourceStep profiles={profiles} onPreview={handlePreview} />
      )}

      {step === "preview" && preview && (
        <PreviewStep
          preview={preview}
          onCommit={handleCommit}
          onCancel={handleCancel}
        />
      )}

      {step === "commit" && commitResult && (
        <CommitResultStep
          result={commitResult}
          onImportMore={handleImportMore}
        />
      )}
    </>
  );
}
