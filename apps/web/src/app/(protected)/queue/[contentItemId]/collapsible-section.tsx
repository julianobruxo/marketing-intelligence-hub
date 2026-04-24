"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  label: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  buttonTestId?: string;
}

export function CollapsibleSection({
  label,
  badge,
  children,
  defaultOpen = false,
  buttonTestId,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="app-surface-panel overflow-hidden rounded-xl transition-expand hover:shadow-md dark:border-[rgba(88,108,186,0.3)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-default hover:bg-white/50 dark:hover:bg-[rgba(99,102,241,0.08)]"
        data-testid={buttonTestId}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-[#1F2E57] dark:text-slate-100">
            {label}
          </span>
          {badge ? (
            <span
              className="inline-flex items-center rounded-full border border-[var(--surface-border)] bg-white/76 px-2 py-0.5 text-[11px] font-medium text-[#5E749B] dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(23,30,58,0.8)] dark:text-[#95A7CB]"
            >
              {badge}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "transition-default flex-shrink-0",
            open ? "rotate-0" : "-rotate-90",
          )}
        >
          <ChevronDown className="h-4 w-4 text-[#8EA3C8] dark:text-[#7F90B3]" />
        </span>
      </button>
      <div
        className={cn(
          "border-t border-[var(--surface-border)] transition-expand dark:border-[rgba(88,108,186,0.24)]",
          open ? "block" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
