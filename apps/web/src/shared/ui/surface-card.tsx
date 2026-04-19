import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type SurfaceVariant = "default" | "subtle" | "elevated" | "command";

const variantClasses: Record<SurfaceVariant, string> = {
  default: "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[rgba(99,102,241,0.12)] dark:bg-[#0F172A]",
  subtle: "rounded-2xl border border-slate-100 bg-slate-50 dark:border-[rgba(99,102,241,0.08)] dark:bg-[#0B1020]",
  elevated: "rounded-2xl border border-slate-200 bg-white shadow-md dark:border-[rgba(99,102,241,0.15)] dark:bg-[#111827] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]",
  command: "rounded-[28px] border border-slate-200 bg-slate-950 text-white shadow-[0_22px_60px_-40px_rgba(15,23,42,0.65)] dark:border-[rgba(99,102,241,0.2)] dark:bg-[#070C1A]",
};

interface SurfaceCardProps {
  variant?: SurfaceVariant;
  hover?: boolean;
  className?: string;
  children: ReactNode;
}

export function SurfaceCard({
  variant = "default",
  hover = false,
  className,
  children,
}: SurfaceCardProps) {
  return (
    <div
      className={cn(
        variantClasses[variant],
        hover && "transition-default hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.4)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
