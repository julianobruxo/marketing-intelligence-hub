"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ClipboardEvent } from "react";
import { X, ChevronLeft, Loader2, CheckCircle2, AlertCircle, Link2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  initiateDesignRequestAction,
  syncDesignRequestAction,
} from "@/modules/design-orchestration/application/run-design-initiation";
import { resolveDesignReferenceLinkAction } from "@/modules/design-orchestration/application/resolve-design-reference-link";
import {
  CANVA_SHAWN_STATIC_TEMPLATES,
  resolveCanvaTemplateMeta,
  buildDefaultFieldValues,
  type CanvaTemplate,
} from "@/modules/design-orchestration/domain/canva-templates";
import {
  NANO_BANANA_PRESETS,
  getDefaultNanaBananaPreset,
  getNanaBananaPresetById,
  type NanaBananaPreset,
} from "@/modules/design-orchestration/domain/nano-banana-presets";
import {
  DESIGN_REFERENCE_ASSET_LIMIT,
  DESIGN_REFERENCE_ASSET_ROLES,
  createFailedGoogleDriveReferenceAsset,
  createPendingGoogleDriveReferenceAsset,
  createUploadDesignReferenceAsset,
  normalizeDesignReferenceAssetRole,
  normalizeReferenceAssetsForGeneration,
  validateReferenceAssetCount,
  validateReferenceAssetFile,
  type DesignReferenceAsset,
  type DesignReferenceAssetRole,
} from "@/modules/design-orchestration/domain/design-reference-assets";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AvailableTemplateMapping = {
  id: string;
  externalTemplateId: string;
  displayName: string;
  designProvider: "CANVA" | "GPT_IMAGE" | "AI_VISUAL" | "MANUAL";
};

type ProviderChoice = "CANVA" | "GPT_IMAGE" | "AI_VISUAL";

type DesignProviderModalProps = {
  contentItemId: string;
  title: string;
  author: string;
  copy: string;
  availableMappings: AvailableTemplateMapping[];
  isRetry?: boolean;
  lastProvider?: ProviderChoice | null;
  lastTemplateId?: string | null;
  lastPresetId?: string | null;
  lastPrompt?: string | null;
  canvaProviderMode: "MOCK" | "REAL";
  gptImageProviderMode: "MOCK" | "REAL";
  nbProviderMode: "MOCK" | "REAL";
  onClose: () => void;
};

type WizardStep = "provider" | "canva-template" | "canva-mapping" | "nb-prompt" | "submitting";

const PRESET_ICONS: Record<string, string> = {
  hook: "🎯",
  explainer: "📋",
  authority: "👑",
  threat: "⚠️",
  resource: "📥",
  map: "🗺️",
  clickbait: "⚡",
  abstract: "🎨",
};

const REFERENCE_ASSET_LIMIT_REACHED_MESSAGE = `Maximum ${DESIGN_REFERENCE_ASSET_LIMIT} reference assets reached. Remove one to add more.`;
const REFERENCE_ASSET_MAX_DIMENSION = 1024;
const REFERENCE_ASSET_JPEG_QUALITY = 0.8;

function createReferenceAssetId(source: "upload" | "drive") {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${source}-${suffix}`;
}

function getDataUrlSizeBytes(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function compressImageForReference(file: File) {
  return new Promise<{ dataUrl: string; mimeType: string; sizeBytes: number }>((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context || image.width <= 0 || image.height <= 0) {
          reject(new Error("Could not prepare this image file."));
          return;
        }

        const ratio = Math.min(
          REFERENCE_ASSET_MAX_DIMENSION / image.width,
          REFERENCE_ASSET_MAX_DIMENSION / image.height,
          1,
        );
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", REFERENCE_ASSET_JPEG_QUALITY);
        resolve({
          dataUrl,
          mimeType: "image/jpeg",
          sizeBytes: getDataUrlSizeBytes(dataUrl),
        });
      } catch {
        reject(new Error("Could not compress this image file."));
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Could not read this image file."));
    };

    image.src = imageUrl;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal shell
// ─────────────────────────────────────────────────────────────────────────────

export function DesignProviderModal({
  contentItemId,
  title,
  author,
  copy,
  availableMappings,
  isRetry = false,
  lastProvider = null,
  lastTemplateId = null,
  lastPresetId = null,
  lastPrompt = null,
  canvaProviderMode,
  gptImageProviderMode,
  nbProviderMode,
  onClose,
}: DesignProviderModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<WizardStep>(
    isRetry && lastProvider ? (lastProvider === "CANVA" ? "canva-template" : "nb-prompt") : "provider",
  );
  const [selectedProvider, setSelectedProvider] = useState<ProviderChoice | null>(
    isRetry ? lastProvider : null,
  );
  const [selectedTemplate, setSelectedTemplate] = useState<CanvaTemplate | null>(
    lastTemplateId ? resolveCanvaTemplateMeta(lastTemplateId) : null,
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [selectedPreset, setSelectedPreset] = useState<NanaBananaPreset>(
    () => getNanaBananaPresetById(lastPresetId ?? "") ?? getDefaultNanaBananaPreset(),
  );
  const [customPrompt, setCustomPrompt] = useState<string>(lastPrompt ?? "");
  const [variationCount, setVariationCount] = useState(3);
  const [referenceAssets, setReferenceAssets] = useState<DesignReferenceAsset[]>([]);
  const [referenceAssetError, setReferenceAssetError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingElapsed, setSubmittingElapsed] = useState(0);
  const [referenceAssetsFlash, setReferenceAssetsFlash] = useState(false);
  const referenceAssetsFlashTimeoutRef = useRef<number | null>(null);

  const canvaTemplates = availableMappings
    .filter((m) => m.designProvider === "CANVA")
    .map((m) => resolveCanvaTemplateMeta(m.externalTemplateId));

  // Fallback: if no DB mappings, show the static catalog (for dev with fresh DB)
  const displayTemplates =
    canvaTemplates.length > 0 ? canvaTemplates : CANVA_SHAWN_STATIC_TEMPLATES;

  const presetPreviewPrompt = selectedPreset.prompt;

  useEffect(() => {
    if (step !== "submitting") {
      return;
    }

    const interval = window.setInterval(() => {
      setSubmittingElapsed((seconds) => seconds + 1);
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [step]);

  useEffect(() => {
    return () => {
      if (referenceAssetsFlashTimeoutRef.current !== null) {
        window.clearTimeout(referenceAssetsFlashTimeoutRef.current);
      }
    };
  }, []);

  function handleProviderChoice(p: ProviderChoice) {
    setSelectedProvider(p);
    if (p === "CANVA") {
      // Auto-select first template if only one exists
      if (displayTemplates.length === 1) {
        const t = displayTemplates[0];
        setSelectedTemplate(t);
        setFieldValues(buildDefaultFieldValues(t, title, copy));
        setStep("canva-mapping");
      } else {
        setStep("canva-template");
      }
    } else {
      setStep("nb-prompt");
    }
  }

  function handleTemplateSelect(t: CanvaTemplate) {
    setSelectedTemplate(t);
    setFieldValues(buildDefaultFieldValues(t, title, copy));
    setStep("canva-mapping");
  }

  function handleFieldChange(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  const triggerReferenceAssetsFlash = useCallback(() => {
    setReferenceAssetsFlash(true);

    if (referenceAssetsFlashTimeoutRef.current !== null) {
      window.clearTimeout(referenceAssetsFlashTimeoutRef.current);
    }

    referenceAssetsFlashTimeoutRef.current = window.setTimeout(() => {
      setReferenceAssetsFlash(false);
      referenceAssetsFlashTimeoutRef.current = null;
    }, 1_200);
  }, []);

  const addReferenceFiles = useCallback(async (
    selectedFiles: File[],
    options: {
      allowPartial?: boolean;
      flashOnSuccess?: boolean;
      role?: DesignReferenceAssetRole;
    } = {},
  ) => {
    if (selectedFiles.length === 0) {
      return 0;
    }

    let filesToAdd = selectedFiles;
    let hitLimit = false;

    if (options.allowPartial) {
      const availableSlots = DESIGN_REFERENCE_ASSET_LIMIT - referenceAssets.length;
      if (availableSlots <= 0) {
        setReferenceAssetError(REFERENCE_ASSET_LIMIT_REACHED_MESSAGE);
        return 0;
      }

      filesToAdd = selectedFiles.slice(0, availableSlots);
      hitLimit = selectedFiles.length > availableSlots;
    } else {
      const countError = validateReferenceAssetCount(referenceAssets.length, selectedFiles.length);
      if (countError) {
        setReferenceAssetError(countError);
        return 0;
      }
    }

    const validationError = filesToAdd
      .map((file) => validateReferenceAssetFile({
        mimeType: file.type,
      }))
      .find((error): error is string => !!error);

    if (validationError) {
      setReferenceAssetError(validationError);
      return 0;
    }

    try {
      const nextAssets = await Promise.all(
        filesToAdd.map(async (file) => {
          const compressedImage = await compressImageForReference(file);
          const compressedValidationError = validateReferenceAssetFile({
            mimeType: compressedImage.mimeType,
            sizeBytes: compressedImage.sizeBytes,
          });

          if (compressedValidationError) {
            throw new Error(compressedValidationError);
          }

          return createUploadDesignReferenceAsset({
            id: createReferenceAssetId("upload"),
            fileName: file.name,
            mimeType: compressedImage.mimeType,
            sizeBytes: compressedImage.sizeBytes,
            dataUrl: compressedImage.dataUrl,
            role: options.role,
          });
        }),
      );

      setReferenceAssets((prev) => [...prev, ...nextAssets]);
      setReferenceAssetError(hitLimit ? REFERENCE_ASSET_LIMIT_REACHED_MESSAGE : null);
      if (options.flashOnSuccess) {
        triggerReferenceAssetsFlash();
      }
      return nextAssets.length;
    } catch (error) {
      setReferenceAssetError(error instanceof Error ? error.message : "Could not read this image file.");
      return 0;
    }
  }, [referenceAssets.length, triggerReferenceAssetsFlash]);

  async function handleReferenceFiles(files: FileList | null) {
    await addReferenceFiles(Array.from(files ?? []));
  }

  const handleCustomPromptPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void addReferenceFiles(imageFiles, {
      allowPartial: true,
      flashOnSuccess: true,
      role: "general_reference",
    });
  }, [addReferenceFiles]);

  async function handleReferenceDriveLink(url: string) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setReferenceAssetError("Paste a Google Drive image link first.");
      return;
    }

    const countError = validateReferenceAssetCount(referenceAssets.length, 1);
    if (countError) {
      setReferenceAssetError(countError);
      return;
    }

    const id = createReferenceAssetId("drive");
    const pendingAsset = createPendingGoogleDriveReferenceAsset({
      id,
      originalUrl: trimmedUrl,
    });

    setReferenceAssets((prev) => [...prev, pendingAsset]);
    setReferenceAssetError(null);

    try {
      const result = await resolveDesignReferenceLinkAction({
        id,
        url: trimmedUrl,
        role: pendingAsset.role,
      });
      setReferenceAssets((prev) =>
        prev.map((asset) => (asset.id === id ? result.asset : asset)),
      );
      setReferenceAssetError(result.ok ? null : result.errorMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Could not resolve this Google Drive image.";
      setReferenceAssets((prev) =>
        prev.map((asset) =>
          asset.id === id
            ? createFailedGoogleDriveReferenceAsset({
                id,
                originalUrl: trimmedUrl,
                role: pendingAsset.role,
                errorMessage,
              })
            : asset,
        ),
      );
      setReferenceAssetError(errorMessage);
    }
  }

  function handleReferenceAssetRemove(id: string) {
    setReferenceAssets((prev) => prev.filter((asset) => asset.id !== id));
    setReferenceAssetError(null);
  }

  function handleReferenceAssetRoleChange(id: string, role: DesignReferenceAssetRole) {
    const normalizedRole = normalizeDesignReferenceAssetRole(role);
    setReferenceAssets((prev) =>
      prev.map((asset) =>
        asset.id === id
          ? {
              ...asset,
              role: normalizedRole,
            }
          : asset,
      ),
    );
  }

  function handleSubmit() {
    setSubmitError(null);
    if (referenceAssets.some((asset) => asset.status === "resolving")) {
      setReferenceAssetError("Wait for Google Drive assets to finish resolving before generating.");
      return;
    }

    const formData = new FormData();
    formData.set("contentItemId", contentItemId);
    formData.set("retryRequested", isRetry ? "true" : "false");

    const activeProviderMode =
      selectedProvider === "CANVA"
        ? canvaProviderMode
        : selectedProvider === "GPT_IMAGE"
          ? gptImageProviderMode
          : selectedProvider === "AI_VISUAL"
            ? nbProviderMode
            : "MOCK";
    if (activeProviderMode === "MOCK") {
      formData.set("designScenario", "SUCCESS");
    }

    if (selectedProvider === "CANVA" && selectedTemplate) {
      formData.set("provider", "CANVA");
      formData.set("templateId", selectedTemplate.id);
      formData.set("fieldMappings", JSON.stringify(fieldValues));
    } else if (selectedProvider === "GPT_IMAGE" || selectedProvider === "AI_VISUAL") {
      formData.set("provider", selectedProvider);
      formData.set("presetId", selectedPreset.id);
      formData.set("author", author);
      formData.set("customPrompt", customPrompt.trim());
      formData.set("variationCount", String(variationCount));
      formData.set(
        "referenceAssets",
        JSON.stringify(normalizeReferenceAssetsForGeneration(referenceAssets)),
      );
    } else {
      return;
    }

    startTransition(async () => {
      try {
        setSubmittingElapsed(0);
        setStep("submitting");
        await initiateDesignRequestAction(formData);
        const syncFormData = new FormData();
        syncFormData.set("contentItemId", contentItemId);
        await syncDesignRequestAction(syncFormData);
        onClose();
        router.replace(`/queue/${contentItemId}`, { scroll: false });
      } catch {
        setSubmitError(
          selectedProvider === "GPT_IMAGE"
            ? "GPT Image is taking longer than expected. The request may still finish in the background. Refresh this item and use Sync Design to recover the saved result."
            : "Something went wrong. Please try again.",
        );
        setStep(selectedProvider === "CANVA" ? "canva-mapping" : "nb-prompt");
        router.refresh();
        window.setTimeout(() => router.refresh(), 5_000);
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      data-testid="design-provider-modal"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 mx-auto w-full max-w-2xl rounded-t-2xl border border-border bg-popover px-4 pb-5 pt-4 text-popover-foreground shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step !== "provider" && step !== "submitting" && (
              <button
                type="button"
                onClick={() => {
                  if (step === "canva-template") setStep("provider");
                  else if (step === "canva-mapping") setStep(displayTemplates.length === 1 ? "provider" : "canva-template");
                  else if (step === "nb-prompt") setStep("provider");
                }}
                className="mr-1 rounded-lg p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isRetry ? "Retry Design" : "Generate Design"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Steps */}
        {step === "provider" && (
          <ProviderStep onSelect={handleProviderChoice} />
        )}

        {step === "canva-template" && (
          <CanvaTemplateStep
            templates={displayTemplates}
            selected={selectedTemplate}
            onSelect={handleTemplateSelect}
          />
        )}

        {step === "canva-mapping" && selectedTemplate && (
          <CanvaMappingStep
            template={selectedTemplate}
            fieldValues={fieldValues}
            onFieldChange={handleFieldChange}
            onSubmit={handleSubmit}
            isPending={isPending}
            submitError={submitError}
          />
        )}

        {step === "nb-prompt" && (
          <NanaBananaPromptStep
            presets={NANO_BANANA_PRESETS}
            selectedPreset={selectedPreset}
            onSelectPreset={setSelectedPreset}
            customPrompt={customPrompt}
            onCustomPromptChange={setCustomPrompt}
            onCustomPromptPaste={handleCustomPromptPaste}
            presetPrompt={presetPreviewPrompt}
            referenceAssets={referenceAssets}
            referenceAssetError={referenceAssetError}
            referenceAssetsFlash={referenceAssetsFlash}
            onReferenceFiles={handleReferenceFiles}
            onReferenceDriveLink={handleReferenceDriveLink}
            onReferenceAssetRemove={handleReferenceAssetRemove}
            onReferenceAssetRoleChange={handleReferenceAssetRoleChange}
            providerLabel={selectedProvider === "GPT_IMAGE" ? "GPT Image 2" : "Nano Banana 2"}
            variationCount={variationCount}
            onVariationCountChange={setVariationCount}
            onSubmit={handleSubmit}
            onCancel={onClose}
            isPending={isPending}
            submitError={submitError}
          />
        )}

        {step === "submitting" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Generating design... ({submittingElapsed}s)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedProvider === "GPT_IMAGE"
                  ? "GPT Image may take up to 2 minutes. Keep this window open while it finishes."
                  : "This can take a moment."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step: Provider choice
// ─────────────────────────────────────────────────────────────────────────────

function ProviderStep({ onSelect }: { onSelect: (p: ProviderChoice) => void }) {
  return (
    <div className="space-y-2.5">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Choose a design provider
      </h2>
      <p className="text-xs text-muted-foreground">
        Select how you want this post to be visually produced.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <ProviderCard
          name="Canva"
          description="Brand templates with autofill."
          badge="Coming Soon"
          badgeColor="blue"
          icon="🎨"
          testId="provider-option-canva"
          disabled
          onClick={() => onSelect("CANVA")}
        />
        <ProviderCard
          name="GPT Image 2"
          description="OpenAI - best quality, precise layout."
          badge="Primary"
          badgeColor="violet"
          icon="✨"
          testId="provider-option-gpt-image"
          onClick={() => onSelect("GPT_IMAGE")}
        />
        <ProviderCard
          name="Nano Banana 2"
          description="Google Gemini - fast AI visuals."
          badge="Fallback"
          badgeColor="blue"
          icon="🍌"
          testId="provider-option-nb"
          onClick={() => onSelect("AI_VISUAL")}
        />
      </div>
    </div>
  );
}

function ProviderCard({
  name,
  description,
  badge,
  badgeColor,
  icon,
  testId,
  onClick,
  disabled = false,
}: {
  name: string;
  description: string;
  badge: string;
  badgeColor: "blue" | "violet";
  icon: string;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const badgeClass =
    badgeColor === "blue"
      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
      : "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
  const disabledBadgeClass = "bg-muted text-muted-foreground";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-testid={testId}
      className={`group relative flex min-w-0 flex-col gap-1.5 rounded-lg border p-3 text-left transition ${
        disabled
          ? "cursor-not-allowed border-border bg-card opacity-50 hover:shadow-none"
          : "border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.7)] dark:hover:border-[rgba(122,138,218,0.5)]"
      }`}
    >
      {disabled && (
        <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${disabledBadgeClass}`}>
          {badge}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1 pr-0">
        <span className="text-[18px] leading-none" aria-hidden="true">{icon}</span>
        <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">{name}</span>
        {!disabled && (
          <span className={`w-fit rounded-full px-1.5 py-0.5 text-[9px] font-medium ${badgeClass}`}>
          {badge}
          </span>
        )}
      </div>
      <p className="text-xs leading-4 text-muted-foreground">{description}</p>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step: Canva template picker
// ─────────────────────────────────────────────────────────────────────────────

function CanvaTemplateStep({
  templates,
  selected,
  onSelect,
}: {
  templates: CanvaTemplate[];
  selected: CanvaTemplate | null;
  onSelect: (t: CanvaTemplate) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Choose a Canva template
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Select a numbered template. Field mappings are configured on the next screen.
      </p>

      <div className="mt-4 space-y-2">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            data-testid={`template-option-${t.id}`}
            data-selected={selected?.id === t.id ? "true" : "false"}
            className={`group w-full rounded-xl border px-4 py-3 text-left transition hover:shadow-sm ${
              selected?.id === t.id
                ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
                : "border-slate-200 bg-white hover:border-slate-300 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.7)] dark:hover:border-[rgba(122,138,218,0.5)]"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Template number badge */}
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {t.number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t.displayName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t.description}
                </p>
                <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                  Fields: {t.fields.map((f) => f.label).join(" · ")}
                </p>
              </div>
              {selected?.id === t.id && (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step: Canva field mapping
// ─────────────────────────────────────────────────────────────────────────────

function CanvaMappingStep({
  template,
  fieldValues,
  onFieldChange,
  onSubmit,
  isPending,
  submitError,
}: {
  template: CanvaTemplate;
  fieldValues: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  submitError: string | null;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Template {template.number} — {template.displayName}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Review and edit the text that will be injected into each template field. Pre-filled from the item content.
        </p>
      </div>

      <div className="space-y-3">
        {template.fields.map((field) => {
          const value = fieldValues[field.key] ?? "";
          const limit = field.characterLimit;
          const tooLong = limit !== undefined && value.length > limit;

          return (
            <div key={field.key}>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor={`field-${field.key}`}
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {field.label}
                </label>
                {limit !== undefined && (
                  <span
                    className={`text-[10px] tabular-nums ${
                      tooLong ? "text-rose-500" : "text-slate-400"
                    }`}
                  >
                    {value.length}/{limit}
                  </span>
                )}
              </div>
              {field.key === "BODY" || value.length > 80 ? (
                <Textarea
                  id={`field-${field.key}`}
                  value={value}
                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                  rows={3}
                  className={`min-h-0 resize-none text-sm dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100 ${
                    tooLong ? "border-rose-300 focus:ring-rose-300" : ""
                  }`}
                  disabled={isPending}
                />
              ) : (
                <Input
                  id={`field-${field.key}`}
                  value={value}
                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                  className={`text-sm dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(22,30,58,0.84)] dark:text-slate-100 ${
                    tooLong ? "border-rose-300 focus:ring-rose-300" : ""
                  }`}
                  disabled={isPending}
                />
              )}
            </div>
          );
        })}
      </div>

      {submitError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {submitError}
        </div>
      )}

      <Button
        type="button"
        onClick={onSubmit}
        disabled={isPending}
        className="w-full"
        data-testid="submit-design-button"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          "Generate with Canva"
        )}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step: Nano Banana prompt
// ─────────────────────────────────────────────────────────────────────────────

function NanaBananaPromptStep({
  presets,
  selectedPreset,
  onSelectPreset,
  customPrompt,
  onCustomPromptChange,
  onCustomPromptPaste,
  presetPrompt,
  referenceAssets,
  referenceAssetError,
  referenceAssetsFlash,
  onReferenceFiles,
  onReferenceDriveLink,
  onReferenceAssetRemove,
  onReferenceAssetRoleChange,
  providerLabel,
  variationCount,
  onVariationCountChange,
  onSubmit,
  onCancel,
  isPending,
  submitError,
}: {
  presets: NanaBananaPreset[];
  selectedPreset: NanaBananaPreset;
  onSelectPreset: (p: NanaBananaPreset) => void;
  customPrompt: string;
  onCustomPromptChange: (v: string) => void;
  onCustomPromptPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  presetPrompt: string;
  referenceAssets: DesignReferenceAsset[];
  referenceAssetError: string | null;
  referenceAssetsFlash: boolean;
  onReferenceFiles: (files: FileList | null) => void | Promise<void>;
  onReferenceDriveLink: (url: string) => void | Promise<void>;
  onReferenceAssetRemove: (id: string) => void;
  onReferenceAssetRoleChange: (id: string, role: DesignReferenceAssetRole) => void;
  providerLabel: string;
  variationCount: number;
  onVariationCountChange: (n: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  submitError: string | null;
}) {
  const selectedPresetId = selectedPreset.id;
  const hasResolvingReferenceAsset = referenceAssets.some((asset) => asset.status === "resolving");

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {providerLabel} — AI Visual
        </h2>
        <p className="hidden">
          Choose a preset prompt or write your own. We will generate {variationCount} variation
          {variationCount !== 1 ? "s" : ""} to review.
        </p>
      </div>

      {/* Preset cards */}
      <div className="grid grid-cols-4 gap-1.5">
          {presets.map((preset) => {
            const isSelected = selectedPresetId === preset.id;

            return (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => onSelectPreset(preset)}
              data-testid={`preset-card-${preset.id}`}
              data-selected={isSelected ? "true" : "false"}
              aria-pressed={isSelected}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition-default [&>span:first-child]:text-xl ${
                isSelected
                  ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                  : "border-border bg-card text-card-foreground hover:border-primary/60 hover:bg-accent"
              }`}
              disabled={isPending}
            >
              <span className="text-2xl leading-none">{PRESET_ICONS[preset.id] ?? "🖼️"}</span>
              {isSelected && (
                <span
                  className="sr-only"
                  aria-hidden="true"
                >
                  ✓
                </span>
              )}
              <div className="w-full min-w-0">
                <span className="block w-full text-xs font-bold leading-tight">{preset.label}</span>
                <span
                  className="hidden"
                  style={{
                    display: "none",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2,
                    overflow: "hidden",
                  }}
                >
                  {preset.description}
                </span>
              </div>
            </button>
            );
          })}
        </div>

      {/* Custom prompt textarea */}
      {(
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">
              Custom prompt
            </label>
          </div>
          <Textarea
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            onPaste={onCustomPromptPaste}
            placeholder="Add custom instructions... (paste images with Ctrl+V)"
            rows={2}
            className="min-h-16 max-h-48 resize-none overflow-y-auto border-input bg-background text-sm text-foreground"
            disabled={isPending}
            data-testid="custom-prompt-input"
          />
        </div>
      )}

      {/* Resolved prompt preview */}
      <details className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          View full prompt
        </summary>
        <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap">
          {presetPrompt || "Select a preset above."}
        </div>
      </details>

      <ReferenceAssetsSection
        assets={referenceAssets}
        errorMessage={referenceAssetError}
        isHighlighted={referenceAssetsFlash}
        isPending={isPending}
        onFilesSelected={onReferenceFiles}
        onDriveLinkAdd={onReferenceDriveLink}
        onRemove={onReferenceAssetRemove}
        onRoleChange={onReferenceAssetRoleChange}
      />

      {/* Variation count */}
      <div className="flex items-center justify-between" data-testid="variation-count-input">
        <span className="text-xs font-medium text-foreground">
          Variations
        </span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onVariationCountChange(n)}
              data-testid="variation-count-option"
              className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-semibold transition-default ${
                variationCount === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-card-foreground hover:border-primary/60 hover:bg-accent"
              }`}
              disabled={isPending}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {submitError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
        Cancel
      </Button>
      <Button
        type="button"
        onClick={onSubmit}
        disabled={isPending || hasResolvingReferenceAsset}
        data-testid="submit-design-button"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          `Generate ${variationCount}`
        )}
      </Button>
      </div>
    </div>
  );
}

function getReferenceAssetPreviewUrl(asset: DesignReferenceAsset) {
  return asset.thumbnailUrl || asset.dataUrl || asset.resolvedUrl || null;
}

function ReferenceAssetsSection({
  assets,
  errorMessage,
  isHighlighted,
  isPending,
  onFilesSelected,
  onDriveLinkAdd,
  onRemove,
  onRoleChange,
}: {
  assets: DesignReferenceAsset[];
  errorMessage: string | null;
  isHighlighted: boolean;
  isPending: boolean;
  onFilesSelected: (files: FileList | null) => void | Promise<void>;
  onDriveLinkAdd: (url: string) => void | Promise<void>;
  onRemove: (id: string) => void;
  onRoleChange: (id: string, role: DesignReferenceAssetRole) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [driveLink, setDriveLink] = useState("");
  const [isAddingDriveLink, setIsAddingDriveLink] = useState(false);
  const isAtLimit = assets.length >= DESIGN_REFERENCE_ASSET_LIMIT;
  const controlsDisabled = isPending || isAddingDriveLink || isAtLimit;

  async function handleDriveLinkAdd() {
    setIsAddingDriveLink(true);
    try {
      await onDriveLinkAdd(driveLink);
      setDriveLink("");
    } finally {
      setIsAddingDriveLink(false);
    }
  }

  return (
    <section
      className={`flex flex-col gap-2 rounded-lg border p-3 transition-[border-color,background-color,box-shadow] duration-500 ${
        isHighlighted
          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
          : "border-border bg-muted/30"
      }`}
      data-highlighted={isHighlighted ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-foreground">Reference Assets</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Upload up to 5 images or paste Google Drive links for logos, photos, QR codes, or style references.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {assets.length} / {DESIGN_REFERENCE_ASSET_LIMIT} assets
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={controlsDisabled}
          onChange={(event) => {
            void onFilesSelected(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
          data-testid="reference-asset-file-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={controlsDisabled}
          data-testid="reference-asset-upload-button"
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Upload images
        </Button>
        <div className="flex min-w-0 flex-1 gap-1.5">
          <Input
            value={driveLink}
            onChange={(event) => setDriveLink(event.target.value)}
            placeholder="Paste Google Drive image link"
            disabled={controlsDisabled}
            className="h-8 min-w-0 text-xs"
            data-testid="reference-asset-drive-link-input"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleDriveLinkAdd()}
            disabled={controlsDisabled || driveLink.trim().length === 0}
            data-testid="reference-asset-add-link-button"
          >
            {isAddingDriveLink ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Add
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
          data-testid="reference-asset-error"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {assets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background/60 px-3 py-3 text-center text-xs text-muted-foreground">
          No reference assets added yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-testid="reference-asset-list">
          {assets.map((asset) => {
            const previewUrl = getReferenceAssetPreviewUrl(asset);
            const isFailed = asset.status === "failed";
            const isResolving = asset.status === "resolving";

            return (
              <div
                key={asset.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
                data-testid="reference-asset-item"
                data-status={asset.status}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-muted bg-cover bg-center text-muted-foreground"
                  style={previewUrl && !isFailed ? { backgroundImage: `url(${previewUrl})` } : undefined}
                  aria-hidden="true"
                >
                  {isResolving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isFailed && <AlertCircle className="h-4 w-4" />}
                  {!previewUrl && !isResolving && !isFailed && <Upload className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {asset.displayName}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {isResolving
                      ? "Resolving Google Drive asset..."
                      : isFailed
                        ? asset.errorMessage ?? "Could not use this asset."
                        : `${asset.source === "upload" ? "Upload" : "Google Drive"} image`}
                  </p>
                </div>
                <select
                  value={asset.role}
                  onChange={(event) =>
                    onRoleChange(asset.id, event.target.value as DesignReferenceAssetRole)
                  }
                  disabled={isPending || isResolving}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  aria-label={`Role for ${asset.displayName}`}
                  data-testid="reference-asset-role-select"
                >
                  {DESIGN_REFERENCE_ASSET_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(asset.id)}
                  disabled={isPending}
                  aria-label={`Remove ${asset.displayName}`}
                  data-testid="reference-asset-remove-button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
