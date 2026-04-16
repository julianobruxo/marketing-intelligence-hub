"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  label: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  label,
  badge,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-expand hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-default hover:bg-slate-50/60"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium" style={{ color: "#0F172A" }}>
            {label}
          </span>
          {badge ? (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: "#F1F5F9", color: "#64748B" }}
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
          style={{ color: "#94A3B8" }}
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <div
        className={cn(
          "border-t border-slate-100 transition-expand",
          open ? "block" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
