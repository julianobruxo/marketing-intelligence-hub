import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ActionVariant = "primary" | "secondary" | "ghost" | "danger" | "waiting" | "ready";
type ActionSize = "sm" | "md" | "lg";

const variantClasses: Record<ActionVariant, string> = {
  primary: "text-white shadow-sm",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:border-slate-600",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
  danger:
    "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800/50 dark:bg-[rgba(225,29,72,0.08)] dark:text-rose-300 dark:hover:bg-[rgba(225,29,72,0.15)]",
  waiting:
    "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-[rgba(245,158,11,0.08)] dark:text-amber-300 dark:hover:bg-[rgba(245,158,11,0.15)]",
  ready:
    "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/50 dark:bg-[rgba(16,185,129,0.08)] dark:text-emerald-300 dark:hover:bg-[rgba(16,185,129,0.15)]",
};

const sizeClasses: Record<ActionSize, string> = {
  sm: "h-8 px-3 text-xs rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-5 text-sm rounded-xl font-semibold",
};

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ActionVariant;
  size?: ActionSize;
  loading?: boolean;
  children: ReactNode;
}

export function ActionButton({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-default hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      style={variant === "primary" ? { backgroundColor: "#E8584A" } : undefined}
      {...props}
    >
      {children}
    </button>
  );
}
