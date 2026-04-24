"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ImageIcon } from "lucide-react";
import { selectDesignVariationAction } from "@/modules/design-orchestration/application/select-design-variation";
import { type NanaBananaVariation } from "./nano-banana-variation-utils";

type NanaBananaVariationChooserProps = {
  contentItemId: string;
  variations: NanaBananaVariation[];
  selectedVariationId: string | null;
};

export function NanaBananaVariationChooser({
  contentItemId,
  variations,
  selectedVariationId,
}: NanaBananaVariationChooserProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (variations.length === 0) return null;

  const selectedIndex = variations.findIndex((v) => v.id === selectedVariationId);
  const selectedVariation = selectedIndex >= 0 ? variations[selectedIndex] : null;

  function handleSelect(variation: NanaBananaVariation) {
    const formData = new FormData();
    formData.set("contentItemId", contentItemId);
    formData.set("variationId", variation.id);
    formData.set("variationLabel", variation.label);
    formData.set("thumbnailUrl", variation.thumbnailUrl);
    formData.set("editUrl", variation.editUrl);

    startTransition(async () => {
      await selectDesignVariationAction(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3" data-testid="variation-chooser">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-[#8B97B7]">
          Nano Banana variations
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Select the variation to use, then approve below.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {variations.map((v) => {
          const isSelected = v.id === selectedVariationId;

          return (
            <button
              key={v.id}
              type="button"
              onClick={() => handleSelect(v)}
              disabled={isPending || isSelected}
              data-testid="variation-option"
              data-selected={isSelected ? "true" : "false"}
              className={`group relative flex flex-col overflow-hidden rounded-xl border transition ${
                isSelected
                  ? "border-emerald-400 shadow-sm dark:border-emerald-500"
                  : "border-slate-200 hover:border-slate-400 dark:border-[rgba(88,108,186,0.3)] dark:hover:border-[rgba(122,138,218,0.5)]"
              }`}
              aria-label={`Select ${v.label}`}
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-slate-100 dark:bg-[rgba(22,30,58,0.7)]">
                {v.thumbnailUrl.startsWith("https://mock.design.local") ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                  </div>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- Generated previews and data URLs are dynamic, so next/image is not a good fit here. */}
                    <img
                      src={v.thumbnailUrl}
                      alt={v.label}
                      className="h-full w-full object-cover"
                    />
                  </>
                )}

                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/10">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500">
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    </span>
                  </div>
                )}

                {isPending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-black/40">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                  </div>
                )}
              </div>

              <div
                className={`flex items-center justify-between px-2.5 py-2 ${
                  isSelected
                    ? "bg-emerald-50 dark:bg-emerald-900/20"
                    : "bg-white dark:bg-[rgba(22,30,58,0.7)]"
                }`}
              >
                <span
                  className={`text-xs font-medium ${
                    isSelected
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {v.label}
                </span>
                {isSelected ? (
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    Selected
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300">
                    Use this
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedVariation && (
        <div className="mt-4 space-y-2" data-testid="variation-preview">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Preview - {selectedVariation.label ?? `Variation ${selectedIndex + 1}`}
            </span>
            <a
              href={selectedVariation.thumbnailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              View full size ↗
            </a>
          </div>

          {selectedVariation.thumbnailUrl.startsWith("https://mock.design.local") ? (
            <div className="flex min-h-64 w-full items-center justify-center rounded-lg border border-border bg-muted">
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- Generated previews and data URLs are dynamic, so next/image is not a good fit here. */}
              <img
                src={selectedVariation.thumbnailUrl}
                alt="Selected variation preview"
                className="max-h-[500px] w-full rounded-lg border border-border object-contain"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
