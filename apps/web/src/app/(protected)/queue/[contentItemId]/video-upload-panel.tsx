"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { useTheme } from "@/shared/ui/theme-provider";
import { saveVideoReferenceAction } from "@/modules/design-orchestration/application/save-video-reference";

type VideoUploadPanelProps = {
  contentItemId: string;
  existingVideoUrl: string | null;
  onClose: () => void;
};

function isGoogleDriveUrl(url: string): boolean {
  return url.startsWith("https://drive.google.com/");
}

export function VideoUploadPanel({ contentItemId, existingVideoUrl, onClose }: VideoUploadPanelProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState(existingVideoUrl ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedUrl = url.trim();
  const urlDriveInvalid = trimmedUrl.length > 0 && !isGoogleDriveUrl(trimmedUrl);
  const urlValid = trimmedUrl.length > 0 && isGoogleDriveUrl(trimmedUrl);
  const canSave = urlValid && confirmed && !isPending;

  function handleSave() {
    if (!trimmedUrl) {
      setError("Please paste a Google Drive link.");
      return;
    }
    if (!isGoogleDriveUrl(trimmedUrl)) {
      setError("Please paste a valid Google Drive link.");
      return;
    }
    if (!confirmed) {
      setError("Please confirm Zazmic-only access before saving.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const fd = new FormData();
      fd.append("contentItemId", contentItemId);
      fd.append("videoUrl", trimmedUrl);
      fd.append("accessConfirmed", "true");

      const result = await saveVideoReferenceAction(fd);
      if (!result.success) {
        setError(result.error ?? "Failed to save video reference.");
        return;
      }

      setSaved(true);
      router.refresh();
      setTimeout(() => {
        onClose();
      }, 900);
    });
  }

  // ── Modal shell styles ────────────────────────────────────────────────────
  const backdropStyle = isDark
    ? { background: "rgba(6,5,15,0.72)", backdropFilter: "blur(4px)" }
    : undefined;

  const panelStyle = isDark
    ? {
        background: "linear-gradient(145deg, #1a1736 0%, #13112a 60%, #0f0d20 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "18px",
        boxShadow: "0 8px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,92,252,0.08)",
      }
    : undefined;

  const inputStyle = isDark
    ? {
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "10px",
        color: "rgba(255,255,255,0.9)",
      }
    : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-transparent"
      style={backdropStyle}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl dark:bg-transparent dark:border-transparent"
        style={panelStyle}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-[0.14em] text-[#E11D48] mb-1"
              style={isDark ? { color: "#9b6dff" } : undefined}
            >
              Video asset
            </p>
            <h2
              className="text-lg font-semibold text-slate-900 dark:text-white"
              style={isDark ? { color: "rgba(255,255,255,0.95)" } : undefined}
            >
              {existingVideoUrl ? "Change video reference" : "Add video reference"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(255,255,255,0.06)] dark:text-[rgba(255,255,255,0.5)] dark:hover:bg-[rgba(255,255,255,0.12)] dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Existing URL display */}
        {existingVideoUrl && !saved && (
          <div className="mb-4 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-[rgba(255,255,255,0.08)] dark:bg-[rgba(255,255,255,0.04)]">
            <p
              className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 mb-1"
              style={isDark ? { color: "rgba(155,109,255,0.8)" } : undefined}
            >
              Current video reference
            </p>
            <p
              className="text-xs text-slate-600 break-all"
              style={isDark ? { color: "rgba(255,255,255,0.6)" } : undefined}
            >
              {existingVideoUrl}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href={existingVideoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                style={isDark ? { color: "#9b6dff" } : { color: "#7c5cfc" }}
              >
                Open video
                <ExternalLink className="h-3 w-3" />
              </a>
              <span
                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                style={
                  isDark
                    ? {
                        background: "rgba(16,185,129,0.12)",
                        borderColor: "rgba(16,185,129,0.25)",
                        color: "rgba(52,211,153,0.9)",
                      }
                    : undefined
                }
              >
                Confirmed @zazmic.com only
              </span>
            </div>
          </div>
        )}

        {/* Success state */}
        {saved ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p
              className="text-sm font-medium text-slate-700"
              style={isDark ? { color: "rgba(255,255,255,0.85)" } : undefined}
            >
              Video reference saved.
            </p>
          </div>
        ) : (
          <>
            {/* URL input */}
            <div className="mb-4">
              <label
                htmlFor="video-url-input"
                className="mb-1.5 block text-sm font-medium text-slate-700"
                style={isDark ? { color: "rgba(255,255,255,0.75)" } : undefined}
              >
                Google Drive video link
              </label>
              <input
                id="video-url-input"
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                placeholder="Paste the Google Drive link to the approved video"
                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7c5cfc]/50"
                style={inputStyle}
                disabled={isPending}
              />
              {urlDriveInvalid || error ? (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {urlDriveInvalid ? "Please paste a valid Google Drive link." : error}
                </p>
              ) : (
                <p
                  className="mt-1.5 text-[11px] text-slate-500"
                  style={isDark ? { color: "rgba(255,255,255,0.4)" } : undefined}
                >
                  The Drive file must be shared with @zazmic.com access only. Do not use public links.
                </p>
              )}
            </div>

            {/* @zazmic.com-only confirmation */}
            <div className="mb-5 flex items-start gap-2.5">
              <input
                id="access-confirm-checkbox"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={isPending}
                className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-slate-300 accent-[#7c5cfc]"
              />
              <label
                htmlFor="access-confirm-checkbox"
                className="cursor-pointer select-none text-sm text-slate-700"
                style={isDark ? { color: "rgba(255,255,255,0.75)" } : undefined}
              >
                I confirm this video is shared only with{" "}
                <span className="font-semibold">@zazmic.com</span> users.
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="flex-1 rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-[rgba(255,255,255,0.12)] dark:bg-[rgba(255,255,255,0.07)] dark:text-[rgba(255,255,255,0.7)] dark:hover:bg-[rgba(255,255,255,0.12)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{
                  background: isDark
                    ? "linear-gradient(135deg, #7c5cfc 0%, #9b6dff 100%)"
                    : "#E11D48",
                  boxShadow: isDark ? "0 4px 16px rgba(124,92,252,0.4)" : undefined,
                }}
              >
                {isPending ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "Save video"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
