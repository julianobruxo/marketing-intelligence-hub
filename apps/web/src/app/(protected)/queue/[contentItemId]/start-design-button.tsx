"use client";

import { useState } from "react";
import { ExternalLink, Image as ImageIcon, Video, X } from "lucide-react";
import { useTheme } from "@/shared/ui/theme-provider";
import { DesignProviderModal, type AvailableTemplateMapping } from "./design-provider-modal";
import { VideoUploadPanel } from "./video-upload-panel";

type StartDesignButtonProps = {
  contentItemId: string;
  title: string;
  author: string;
  copy: string;
  availableMappings: AvailableTemplateMapping[];
  existingVideoUrl: string | null;
  canvaProviderMode: "MOCK" | "REAL";
  gptImageProviderMode: "MOCK" | "REAL";
  nbProviderMode: "MOCK" | "REAL";
};

type Step = "idle" | "picking" | "image" | "video";

export function StartDesignButton({
  contentItemId,
  title,
  author,
  copy,
  availableMappings,
  existingVideoUrl,
  canvaProviderMode,
  gptImageProviderMode,
  nbProviderMode,
}: StartDesignButtonProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [step, setStep] = useState<Step>("idle");

  function reset() {
    setStep("idle");
  }

  // ── Asset-type picker modal ───────────────────────────────────────────────
  const backdropStyle = isDark
    ? { background: "rgba(6,5,15,0.62)", backdropFilter: "blur(4px)" }
    : undefined;

  const pickerPanelStyle = isDark
    ? {
        background: "linear-gradient(145deg, #1a1736 0%, #13112a 60%, #0f0d20 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "18px",
        boxShadow: "0 8px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,92,252,0.08)",
      }
    : undefined;

  const optionBaseStyle = isDark
    ? {
        background: "linear-gradient(135deg, rgba(38,32,72,0.8) 0%, rgba(28,24,56,0.9) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "12px",
      }
    : undefined;

  const optionHoverClass = isDark
    ? ""
    : "hover:border-[#7c5cfc]/40 hover:bg-slate-50";

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Primary trigger */}
        <button
          type="button"
          data-testid="start-design-button"
          onClick={() => setStep("picking")}
          className="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-default"
          style={{
            background: isDark
              ? "linear-gradient(135deg, #7c5cfc 0%, #9b6dff 100%)"
              : "#E11D48",
            boxShadow: isDark ? "0 4px 16px rgba(124,92,252,0.35)" : undefined,
          }}
        >
          Start Design
        </button>

        {/* Saved video reference card */}
        {existingVideoUrl && (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3"
            style={
              isDark
                ? {
                    background: "rgba(16,185,129,0.07)",
                    borderColor: "rgba(16,185,129,0.2)",
                    borderRadius: "12px",
                  }
                : undefined
            }
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600 mb-1.5"
              style={isDark ? { color: "rgba(52,211,153,0.85)" } : undefined}
            >
              Current video reference
            </p>
            <a
              href={existingVideoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
              style={isDark ? { color: "rgba(52,211,153,0.9)" } : undefined}
            >
              Open video
              <ExternalLink className="h-3 w-3" />
            </a>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span
                className="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
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
              <button
                type="button"
                onClick={() => setStep("video")}
                className="text-xs font-medium text-slate-500 underline hover:text-slate-700"
                style={
                  isDark
                    ? { color: "rgba(255,255,255,0.4)" }
                    : undefined
                }
              >
                Change video link
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Asset-type picker */}
      {step === "picking" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-transparent"
          style={backdropStyle}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border bg-white p-6 shadow-xl dark:bg-transparent dark:border-transparent"
            style={pickerPanelStyle}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[#E11D48] mb-1"
                  style={isDark ? { color: "#9b6dff" } : undefined}
                >
                  Start design
                </p>
                <h2
                  className="text-lg font-semibold text-slate-900"
                  style={isDark ? { color: "rgba(255,255,255,0.95)" } : undefined}
                >
                  Choose asset type
                </h2>
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={isDark ? { color: "rgba(255,255,255,0.5)" } : undefined}
                >
                  What kind of asset will this post use?
                </p>
              </div>
              <button
                onClick={reset}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(255,255,255,0.06)] dark:text-[rgba(255,255,255,0.5)] dark:hover:bg-[rgba(255,255,255,0.12)] dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setStep("image")}
                className={`flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition-default ${optionHoverClass}`}
                style={optionBaseStyle}
              >
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100"
                  style={
                    isDark
                      ? { background: "rgba(124,92,252,0.18)", borderRadius: "10px" }
                      : undefined
                  }
                >
                  <ImageIcon
                    className="h-5 w-5 text-slate-600"
                    style={isDark ? { color: "#9b6dff" } : undefined}
                  />
                </span>
                <div>
                  <p
                    className="text-sm font-semibold text-slate-900"
                    style={isDark ? { color: "rgba(255,255,255,0.9)" } : undefined}
                  >
                    Image
                  </p>
                  <p
                    className="mt-0.5 text-xs text-slate-500"
                    style={isDark ? { color: "rgba(255,255,255,0.45)" } : undefined}
                  >
                    Generate or upload an image design
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStep("video")}
                className={`flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition-default ${optionHoverClass}`}
                style={optionBaseStyle}
              >
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100"
                  style={
                    isDark
                      ? { background: "rgba(124,92,252,0.18)", borderRadius: "10px" }
                      : undefined
                  }
                >
                  <Video
                    className="h-5 w-5 text-slate-600"
                    style={isDark ? { color: "#9b6dff" } : undefined}
                  />
                </span>
                <div>
                  <p
                    className="text-sm font-semibold text-slate-900"
                    style={isDark ? { color: "rgba(255,255,255,0.9)" } : undefined}
                  >
                    Video
                  </p>
                  <p
                    className="mt-0.5 text-xs text-slate-500"
                    style={isDark ? { color: "rgba(255,255,255,0.45)" } : undefined}
                  >
                    {existingVideoUrl ? "Change the uploaded video reference" : "Provide a video URL reference"}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image path → DesignProviderModal */}
      {step === "image" && (
        <DesignProviderModal
          contentItemId={contentItemId}
          title={title}
          author={author}
          copy={copy}
          availableMappings={availableMappings}
          isRetry={false}
          lastProvider={null}
          lastTemplateId={null}
          lastPresetId={null}
          lastPrompt={null}
          canvaProviderMode={canvaProviderMode}
          gptImageProviderMode={gptImageProviderMode}
          nbProviderMode={nbProviderMode}
          onClose={reset}
        />
      )}

      {/* Video path → VideoUploadPanel */}
      {step === "video" && (
        <VideoUploadPanel
          contentItemId={contentItemId}
          existingVideoUrl={existingVideoUrl}
          onClose={reset}
        />
      )}
    </>
  );
}
