import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Globe,
  MoreHorizontal,
  ThumbsUp,
  MessageSquare,
  Repeat2,
  Send,
  Play,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getPrisma } from "@/shared/lib/prisma";
import { withoutDeleted } from "@/shared/lib/soft-delete";
import {
  resolveLinkedInTarget,
  extractOwnerFromSpreadsheetName,
  isTargetAcceptableForMock,
} from "@/modules/linkedin/domain/linkedin-targets";
import { resolvePublishCopy } from "@/modules/linkedin/domain/resolve-publish-copy";
import { resolvePublishAsset } from "@/modules/linkedin/domain/resolve-publish-asset";
import { ConfirmPostButton } from "./confirm-post-button";
import { LinkedInImagePreview } from "./linkedin-image-preview";

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

function languageLabel(lang: string | null | undefined): string {
  if (lang === "ENG") return "English";
  if (lang === "PT_BR") return "Portuguese (Brazil)";
  if (lang === "FR") return "French";
  return lang ?? "—";
}

function statusLabel(status: string): string {
  if (status === "READY_TO_POST") return "Ready to post";
  if (status === "READY_TO_PUBLISH") return "Ready to publish";
  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function connectionLabel(status: string): string {
  if (status === "MOCK_CONNECTED") return "Mock connection";
  if (status === "PENDING_ORGANIZATION_ACCESS") return "Pending org access";
  if (status === "NOT_CONNECTED") return "Not connected";
  if (status === "MANUAL_ONLY") return "Manual only";
  return status;
}

function assetTypeLabel(type: string): string {
  if (type === "STATIC_IMAGE") return "Image";
  if (type === "VIDEO") return "Video";
  return type;
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

  const spreadsheetName = extractSpreadsheetName(item.planningSnapshot);
  const ownerName = extractOwnerFromSpreadsheetName(spreadsheetName);
  const target = resolveLinkedInTarget(ownerName);
  const targetOk = !!target && isTargetAcceptableForMock(target);

  const copyResult = resolvePublishCopy(item);
  const assetResult = resolvePublishAsset(item.assets);

  const readinessIssues: string[] = [];
  if (!isPostable) {
    readinessIssues.push(
      `Item must be in Ready to post or Ready to publish state (current: ${statusLabel(item.currentStatus)}).`,
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
      TRANSLATION_NOT_APPROVED: `The ${languageLabel(copyResult.language)} translation has not been approved yet.`,
      TRANSLATION_COPY_MISSING: `The ${languageLabel(copyResult.language)} translation copy is missing.`,
    };
    readinessIssues.push(msgs[copyResult.reason] ?? "Copy could not be resolved.");
  }

  const canPost = readinessIssues.length === 0;
  const disabledReason = readinessIssues[0] ?? null;

  const initials = target ? getOwnerInitials(target.targetLabel) : "?";
  const isPersonal = target?.targetType === "PERSONAL_PROFILE";

  const liActions: Array<{ Icon: typeof ThumbsUp; label: string }> = [
    { Icon: ThumbsUp, label: "Like" },
    { Icon: MessageSquare, label: "Comment" },
    { Icon: Repeat2, label: "Repost" },
    { Icon: Send, label: "Send" },
  ];

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
          <ChecklistRow
            ok={isPostable}
            label="Item status"
            okText={statusLabel(item.currentStatus)}
            failText={`${statusLabel(item.currentStatus)} — must be Ready to post or Ready to publish`}
          />
          <ChecklistRow
            ok={targetOk}
            label="LinkedIn target"
            okText={
              target
                ? `${target.targetLabel} (${connectionLabel(target.connectionStatus)})`
                : ""
            }
            failText={
              target
                ? `${target.ownerName} — not accepted for mock`
                : `No target for owner "${ownerName ?? "(unknown)"}"`
            }
          />
          <ChecklistRow
            ok={copyResult.ok}
            label="Publish copy"
            okText={
              copyResult.ok
                ? `${languageLabel(copyResult.language)} — ${copyResult.copy.slice(0, 48)}${copyResult.copy.length > 48 ? "…" : ""}`
                : ""
            }
            failText={
              !copyResult.ok
                ? ({
                    NO_LANGUAGE_SELECTED: "No publish language selected",
                    TRANSLATION_NOT_APPROVED: `${languageLabel(copyResult.language)} translation not approved`,
                    TRANSLATION_COPY_MISSING: `${languageLabel(copyResult.language)} translation copy missing`,
                  }[copyResult.reason] ?? "Copy unavailable")
                : ""
            }
          />
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
                    {assetTypeLabel(assetResult.assetType)} ready
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">None — text-only post</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* LinkedIn feed preview */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
            Preview
          </p>
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 border border-amber-200 rounded px-1.5 py-0.5">
            mock only
          </span>
        </div>

        {/* LinkedIn feed background */}
        <div className="rounded-xl px-3 py-6 flex justify-center" style={{ backgroundColor: "#F3F2EF" }}>
          {/* LinkedIn post card */}
          <div
            className="w-full max-w-[600px] bg-white rounded-lg overflow-hidden"
            style={{
              border: "1px solid rgba(0,0,0,0.08)",
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
            }}
          >
            {/* Author header */}
            <div className="flex items-start gap-2.5 px-3 pt-3 pb-0">
              {/* Avatar with initials */}
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ backgroundColor: "#0A66C2" }}
              >
                {initials}
              </div>

              <div className="flex-1 min-w-0">
                {/* Name + LinkedIn badge + degree */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: "rgba(0,0,0,0.9)" }}>
                    {target?.targetLabel ?? "Unknown target"}
                  </span>
                  {/* LinkedIn "in" badge */}
                  <span
                    className="inline-flex items-center justify-center text-white text-[10px] font-bold leading-none flex-shrink-0"
                    style={{
                      backgroundColor: "#0A66C2",
                      height: "16px",
                      width: "16px",
                      borderRadius: "3px",
                    }}
                  >
                    in
                  </span>
                  {/* Connection degree — personal profiles only */}
                  {target?.targetType === "PERSONAL_PROFILE" &&
                    target.connectionStatus === "MOCK_CONNECTED" && (
                      <>
                        <span style={{ color: "rgba(0,0,0,0.6)", fontSize: "13px" }}>·</span>
                        <span style={{ color: "rgba(0,0,0,0.6)", fontSize: "13px" }}>1st</span>
                      </>
                    )}
                </div>

                {/* Subtitle / target type */}
                <p className="text-xs leading-snug mt-px" style={{ color: "rgba(0,0,0,0.6)" }}>
                  {target
                    ? isPersonal
                      ? "Personal Profile"
                      : "Company Page"
                    : "Unknown"}
                </p>

                {/* Time + privacy */}
                <div className="flex items-center gap-0.5 mt-px">
                  <span className="text-[11px]" style={{ color: "rgba(0,0,0,0.6)" }}>
                    1w
                  </span>
                  <span className="text-[11px]" style={{ color: "rgba(0,0,0,0.6)" }}>
                    {" "}
                    •{" "}
                  </span>
                  <span className="text-[12px]">🌐</span>
                </div>
              </div>

              {/* Three-dot menu */}
              <button
                disabled
                aria-label="More options"
                className="p-1.5 rounded -mt-1 -mr-1.5 flex-shrink-0 cursor-default"
                style={{ color: "rgba(0,0,0,0.6)" }}
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>

            {/* Copy body */}
            <div
              className="px-3 pt-2.5 pb-3 text-sm whitespace-pre-wrap leading-relaxed"
              style={{ color: "rgba(0,0,0,0.9)" }}
            >
              {copyResult.ok ? (
                copyResult.copy
              ) : (
                <span style={{ color: "rgba(0,0,0,0.4)", fontStyle: "italic" }}>
                  Copy unavailable
                </span>
              )}
            </div>

            {/* Image block — rendered visually, never as a raw URL */}
            {assetResult.ok && assetResult.assetType !== "VIDEO" && (
              <LinkedInImagePreview assetUrl={assetResult.assetUrl} />
            )}

            {/* Video block */}
            {assetResult.ok && assetResult.assetType === "VIDEO" && (
              <div
                className="flex items-center justify-center gap-3 py-10 px-4"
                style={{ borderTop: "1px solid rgba(0,0,0,0.08)", backgroundColor: "#000" }}
              >
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                >
                  <Play className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Video reference</p>
                  <a
                    href={assetResult.assetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs hover:underline"
                    style={{ color: "#70B5F9" }}
                  >
                    Open video
                  </a>
                </div>
              </div>
            )}

            {/* Engagement summary row */}
            <div
              className="flex items-center justify-between px-3 py-2 text-xs"
              style={{ color: "rgba(0,0,0,0.6)" }}
            >
              <div className="flex items-center gap-0.5 min-w-0">
                <span>💙</span>
                <span>👍</span>
                <span>👏</span>
                <span className="ml-1 truncate">Gabrielle Almeida Duarte and 27 others</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                <span>19 comments</span>
                <span>·</span>
                <span>5 reposts</span>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: "1px", backgroundColor: "rgba(0,0,0,0.08)", margin: "0 12px" }} />

            {/* Action bar */}
            <div className="flex items-center px-1 py-1">
              {liActions.map(({ Icon, label }) => (
                <button
                  key={label}
                  disabled
                  className="flex flex-1 items-center justify-center gap-1.5 py-3 px-1 rounded-lg text-sm font-semibold cursor-default"
                  style={{ color: "rgba(0,0,0,0.6)" }}
                >
                  <Icon className="h-5 w-5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            {/* Comment input mock */}
            <div
              className="flex items-center gap-2.5 px-3 pb-3"
              style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "10px" }}
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(0,0,0,0.1)" }}
              >
                <span className="text-[10px] font-semibold" style={{ color: "rgba(0,0,0,0.4)" }}>
                  ME
                </span>
              </div>
              <div
                className="flex-1 px-4 py-2 text-sm"
                style={{
                  border: "1px solid rgba(0,0,0,0.3)",
                  borderRadius: "9999px",
                  color: "rgba(0,0,0,0.4)",
                }}
              >
                Add a comment…
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Publishing metadata */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-[rgba(255,255,255,0.08)] dark:bg-[rgba(255,255,255,0.03)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-[rgba(255,255,255,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
            Publishing metadata
          </p>
        </div>
        <dl className="divide-y divide-slate-100 dark:divide-[rgba(255,255,255,0.05)]">
          <MetaRow label="Mode" value="Mock" />
          <MetaRow label="Target" value={target?.targetLabel ?? "—"} />
          <MetaRow
            label="Target type"
            value={
              target
                ? target.targetType === "COMPANY_PAGE"
                  ? "Company Page"
                  : "Personal Profile"
                : "—"
            }
          />
          <MetaRow
            label="Connection"
            value={target ? connectionLabel(target.connectionStatus) : "—"}
          />
          <MetaRow
            label="Language"
            value={copyResult.ok ? languageLabel(copyResult.language) : "—"}
          />
          <MetaRow
            label="Asset"
            value={assetResult.ok ? assetTypeLabel(assetResult.assetType) : "None (text only)"}
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

      {/* Confirm CTA */}
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
