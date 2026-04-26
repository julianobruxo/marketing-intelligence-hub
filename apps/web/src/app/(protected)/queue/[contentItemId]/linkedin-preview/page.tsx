import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle, Globe, Lock, Image as ImageIcon, Video, XCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { getPrisma } from "@/shared/lib/prisma";
import { withoutDeleted } from "@/shared/lib/soft-delete";
import { resolveLinkedInTarget, extractOwnerFromSpreadsheetName, isTargetAcceptableForMock } from "@/modules/linkedin/domain/linkedin-targets";
import { resolvePublishCopy } from "@/modules/linkedin/domain/resolve-publish-copy";
import { resolvePublishAsset } from "@/modules/linkedin/domain/resolve-publish-asset";
import { ConfirmPostButton } from "./confirm-post-button";

export const maxDuration = 60;

function extractSpreadsheetName(planningSnapshot: unknown): string | null {
  if (!planningSnapshot || typeof planningSnapshot !== "object") return null;
  const snap = planningSnapshot as Record<string, unknown>;
  const source =
    snap.source && typeof snap.source === "object"
      ? (snap.source as Record<string, unknown>)
      : null;
  const val = source?.spreadsheetName;
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

function getOwnerInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function languageLabel(lang: string): string {
  if (lang === "ENG") return "English";
  if (lang === "PT_BR") return "Portuguese (BR)";
  if (lang === "FR") return "French";
  return lang;
}

type Props = {
  params: Promise<{ contentItemId: string }>;
};

export default async function LinkedInPreviewPage({ params }: Props) {
  const { contentItemId } = await params;

  const db = getPrisma();
  const item = await db.contentItem.findFirst({
    where: withoutDeleted({ id: contentItemId }),
    include: {
      assets: { where: { deletedAt: null } },
      sourceLinks: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!item) notFound();

  const isPostable =
    item.currentStatus === "READY_TO_POST" || item.currentStatus === "READY_TO_PUBLISH";

  // Resolve LinkedIn target
  const spreadsheetName = extractSpreadsheetName(item.planningSnapshot);
  const ownerName = extractOwnerFromSpreadsheetName(spreadsheetName);
  const target = resolveLinkedInTarget(ownerName);
  const targetOk = !!target && isTargetAcceptableForMock(target);

  // Resolve copy
  const copyResult = resolvePublishCopy(item);

  // Resolve asset (optional)
  const assetResult = resolvePublishAsset(item.assets);

  // Derive disabled state + reason
  const readinessIssues: string[] = [];
  if (!isPostable) {
    readinessIssues.push(
      `Item must be in READY_TO_POST or READY_TO_PUBLISH state (current: ${item.currentStatus}).`,
    );
  }
  if (!targetOk) {
    readinessIssues.push(
      target
        ? `LinkedIn target "${target.ownerName}" is not configured for mock posting.`
        : `No LinkedIn target found for owner "${ownerName ?? "(unknown)"}".`,
    );
  }
  if (!copyResult.ok) {
    const msgs: Record<string, string> = {
      NO_LANGUAGE_SELECTED: "No publish language is selected on this item.",
      TRANSLATION_NOT_APPROVED: `The ${copyResult.language ?? "selected"} translation has not been approved yet.`,
      TRANSLATION_COPY_MISSING: `The ${copyResult.language ?? "selected"} translation copy is missing.`,
    };
    readinessIssues.push(msgs[copyResult.reason] ?? "Copy could not be resolved.");
  }

  const canPost = readinessIssues.length === 0;
  const disabledReason = readinessIssues[0] ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in-up">
      {/* Back nav */}
      <Link
        href={`/queue/${contentItemId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to item
      </Link>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0A66C2] mb-1 dark:text-[#5BA4F5]">
            Mock LinkedIn Post
          </p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-snug">
            {item.title}
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/95 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-[rgba(191,141,57,0.48)] dark:bg-[rgba(62,42,8,0.8)] dark:text-[#F1CC88] flex-shrink-0 mt-0.5">
          MOCK
        </span>
      </div>

      {/* Readiness checklist */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-[rgba(255,255,255,0.08)] dark:bg-[rgba(255,255,255,0.03)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-[rgba(255,255,255,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
            Readiness
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-[rgba(255,255,255,0.05)]">
          {/* Status */}
          <ChecklistRow
            ok={isPostable}
            label="Item status"
            okText={item.currentStatus}
            failText={`${item.currentStatus} — must be READY_TO_POST or READY_TO_PUBLISH`}
          />
          {/* Target */}
          <ChecklistRow
            ok={targetOk}
            label="LinkedIn target"
            okText={target ? `${target.targetLabel} (${target.connectionStatus})` : ""}
            failText={
              target
                ? `${target.ownerName} — not accepted for mock`
                : `No target for owner "${ownerName ?? "(unknown)"}"`
            }
          />
          {/* Copy */}
          <ChecklistRow
            ok={copyResult.ok}
            label="Publish copy"
            okText={`${languageLabel(copyResult.ok ? copyResult.language : (copyResult.language ?? "?"))} — ${copyResult.ok ? copyResult.copy.slice(0, 48) + (copyResult.copy.length > 48 ? "…" : "") : ""}`}
            failText={
              !copyResult.ok
                ? {
                    NO_LANGUAGE_SELECTED: "No publish language selected",
                    TRANSLATION_NOT_APPROVED: `${copyResult.language} translation not approved`,
                    TRANSLATION_COPY_MISSING: `${copyResult.language} translation copy missing`,
                  }[copyResult.reason] ?? "Copy unavailable"
                : ""
            }
          />
          {/* Asset (optional) */}
          <div className="flex items-center gap-3 px-4 py-3">
            {assetResult.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
            ) : (
              <Globe className="h-4 w-4 text-slate-400 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">Asset</span>{" "}
                {assetResult.ok ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {assetResult.assetType} ready
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">
                    None — text-only post
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* LinkedIn preview card */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-[rgba(255,255,255,0.08)] dark:bg-[rgba(255,255,255,0.03)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
            Preview
          </p>
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 rounded px-1.5 py-0.5">
            mock only
          </span>
        </div>

        <div className="p-4 space-y-3">
          {/* Profile row */}
          <div className="flex items-center gap-3">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ backgroundColor: "#0A66C2" }}
            >
              {target ? getOwnerInitials(target.targetLabel) : "?"}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {target?.targetLabel ?? "Unknown target"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {target?.targetType === "COMPANY_PAGE"
                  ? "Company Page"
                  : "Personal Profile"}
              </p>
              {target?.connectionStatus === "MOCK_CONNECTED" && (
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  MOCK CONNECTION
                </p>
              )}
              {target?.connectionStatus === "PENDING_ORGANIZATION_ACCESS" && (
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                  PENDING ORG ACCESS
                </p>
              )}
            </div>
          </div>

          {/* Copy */}
          <div className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
            {copyResult.ok ? copyResult.copy : (
              <span className="italic text-slate-400 dark:text-slate-500">
                Copy unavailable
              </span>
            )}
          </div>

          {/* Asset block */}
          {assetResult.ok && (
            <div className="mt-2">
              {assetResult.assetType === "VIDEO" ? (
                <div className="rounded-lg border border-slate-200 dark:border-[rgba(255,255,255,0.08)] bg-slate-50 dark:bg-[rgba(255,255,255,0.03)] px-4 py-3 flex items-center gap-3">
                  <Video className="h-5 w-5 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Video reference
                    </p>
                    <a
                      href={assetResult.assetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-sky-600 dark:text-sky-400 hover:underline truncate block max-w-xs"
                    >
                      {assetResult.assetUrl}
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-[rgba(255,255,255,0.08)] bg-slate-50 dark:bg-[rgba(255,255,255,0.03)] px-4 py-3 flex items-center gap-3">
                  <ImageIcon className="h-5 w-5 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {assetResult.assetType} asset
                    </p>
                    <a
                      href={assetResult.assetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-sky-600 dark:text-sky-400 hover:underline truncate block max-w-xs"
                    >
                      {assetResult.assetUrl}
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-[rgba(255,255,255,0.08)] dark:bg-[rgba(255,255,255,0.03)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-[rgba(255,255,255,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
            Publishing metadata
          </p>
        </div>
        <dl className="divide-y divide-slate-100 dark:divide-[rgba(255,255,255,0.05)]">
          <MetaRow label="Mode" value="MOCK" />
          <MetaRow label="Target" value={target?.targetLabel ?? "—"} />
          <MetaRow
            label="Connection"
            value={target?.connectionStatus ?? "—"}
          />
          <MetaRow
            label="Language"
            value={
              copyResult.ok ? languageLabel(copyResult.language) : "—"
            }
          />
          <MetaRow
            label="Asset"
            value={assetResult.ok ? assetResult.assetType : "None (text only)"}
          />
        </dl>
      </div>

      {/* Issues banner */}
      {!canPost && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 dark:border-[rgba(244,63,94,0.25)] dark:bg-[rgba(127,29,29,0.2)]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              {readinessIssues.map((issue) => (
                <p key={issue} className="text-sm text-rose-700 dark:text-rose-300">
                  {issue}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <ConfirmPostButton
        contentItemId={contentItemId}
        disabled={!canPost}
        disabledReason={disabledReason}
      />
    </div>
  );
}

function ChecklistRow({
  ok,
  label,
  okText,
  failText,
}: {
  ok: boolean;
  label: string;
  okText: string;
  failText: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-4 w-4 text-rose-500 dark:text-rose-400 flex-shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-medium">{label}:</span>{" "}
          {ok ? (
            <span className="text-emerald-700 dark:text-emerald-400">{okText}</span>
          ) : (
            <span className="text-rose-700 dark:text-rose-300">{failText}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-4">
      <dt className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</dt>
      <dd className="text-xs font-medium text-slate-800 dark:text-slate-200 text-right">
        {value}
      </dd>
    </div>
  );
}
