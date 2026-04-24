"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DesignProviderModal,
  type AvailableTemplateMapping,
} from "./design-provider-modal";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DesignInitiationButtonProps = {
  contentItemId: string;
  title: string;
  author: string;
  copy: string;
  availableMappings: AvailableTemplateMapping[];
  /** "start" = READY_FOR_DESIGN, "retry" = DESIGN_FAILED */
  mode: "start" | "retry";
  label: string;
  /** Provider and config from the last attempt — pre-populates the modal on retry. */
  lastProvider?: "CANVA" | "GPT_IMAGE" | "AI_VISUAL" | null;
  lastTemplateId?: string | null;
  lastPresetId?: string | null;
  lastPrompt?: string | null;
  canvaProviderMode: "MOCK" | "REAL";
  gptImageProviderMode: "MOCK" | "REAL";
  nbProviderMode: "MOCK" | "REAL";
  disabled?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DesignInitiationButton({
  contentItemId,
  title,
  author,
  copy,
  availableMappings,
  mode,
  label,
  lastProvider = null,
  lastTemplateId = null,
  lastPresetId = null,
  lastPrompt = null,
  canvaProviderMode,
  gptImageProviderMode,
  nbProviderMode,
  disabled = false,
}: DesignInitiationButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="transition-default"
        data-testid={mode === "retry" ? "retry-design-button" : "generate-design-button"}
        style={{ backgroundColor: "#E11D48", color: "white" }}
      >
        {label}
      </Button>

      {open && (
        <DesignProviderModal
          contentItemId={contentItemId}
          title={title}
          author={author}
          copy={copy}
          availableMappings={availableMappings}
          isRetry={mode === "retry"}
          lastProvider={lastProvider}
          lastTemplateId={lastTemplateId}
          lastPresetId={lastPresetId}
          lastPrompt={lastPrompt}
          canvaProviderMode={canvaProviderMode}
          gptImageProviderMode={gptImageProviderMode}
          nbProviderMode={nbProviderMode}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
