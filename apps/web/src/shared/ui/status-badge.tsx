import { cn } from "@/lib/utils";
import { formatOperationalLabel, getOperationalTone, type OperationalTone } from "./operational-status";

const BADGE_CLASSES: Record<OperationalTone, string> = {
  slate:
    "border-slate-200/95 bg-[linear-gradient(180deg,rgba(244,247,253,1),rgba(231,237,248,0.96))] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-[rgba(104,120,186,0.42)] dark:bg-[linear-gradient(180deg,rgba(34,42,75,0.94),rgba(23,31,58,0.98))] dark:text-[#C3CFEF]",
  blue:
    "border-sky-200/95 bg-[linear-gradient(180deg,rgba(238,247,255,1),rgba(218,231,254,0.98))] text-sky-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-[rgba(87,132,212,0.48)] dark:bg-[linear-gradient(180deg,rgba(22,40,82,0.94),rgba(18,31,65,0.98))] dark:text-[#BFD4FF]",
  amber:
    "border-amber-200/95 bg-[linear-gradient(180deg,rgba(255,251,236,1),rgba(254,236,183,0.96))] text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(191,141,57,0.48)] dark:bg-[linear-gradient(180deg,rgba(62,42,8,0.94),rgba(47,32,6,0.98))] dark:text-[#F1CC88]",
  emerald:
    "border-emerald-200/95 bg-[linear-gradient(180deg,rgba(236,253,245,1),rgba(198,246,214,0.94))] text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(63,177,135,0.48)] dark:bg-[linear-gradient(180deg,rgba(16,48,34,0.94),rgba(11,38,26,0.98))] dark:text-[#9CE6CA]",
  rose:
    "border-rose-200/95 bg-[linear-gradient(180deg,rgba(255,241,245,1),rgba(255,224,232,0.98))] text-rose-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] dark:border-[rgba(176,74,102,0.52)] dark:bg-[linear-gradient(180deg,rgba(66,14,28,0.95),rgba(52,10,22,0.98))] dark:text-[#F4A7BA]",
  violet:
    "border-violet-200/95 bg-[linear-gradient(180deg,rgba(246,242,255,1),rgba(231,218,255,0.95))] text-violet-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(117,99,196,0.54)] dark:bg-[linear-gradient(180deg,rgba(43,20,86,0.95),rgba(31,15,66,0.98))] dark:text-[#CAB7FF]",
  orange:
    "border-orange-200/95 bg-[linear-gradient(180deg,rgba(255,247,238,1),rgba(255,223,186,0.96))] text-orange-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-[rgba(189,118,64,0.5)] dark:bg-[linear-gradient(180deg,rgba(64,32,10,0.95),rgba(49,24,7,0.98))] dark:text-[#F1BF93]",
};

const DOT_CLASSES: Record<OperationalTone, string> = {
  slate: "bg-slate-400 dark:bg-slate-500",
  blue: "bg-sky-500 dark:bg-sky-400",
  amber: "bg-amber-400 dark:bg-amber-400",
  emerald: "bg-emerald-500 dark:bg-emerald-400",
  rose: "bg-rose-500 dark:bg-rose-400",
  violet: "bg-violet-500 dark:bg-violet-400",
  orange: "bg-orange-500 dark:bg-orange-400",
};

type StatusBadgeProps =
  | {
      status: string;
      label?: string;
      variant?: never;
      dot?: boolean;
      size?: "xs" | "sm";
      className?: string;
    }
  | {
      status?: never;
      label: string;
      variant: OperationalTone;
      dot?: boolean;
      size?: "xs" | "sm";
      className?: string;
    };

export function StatusBadge({
  status,
  label,
  variant,
  dot = true,
  size = "sm",
  className,
}: StatusBadgeProps) {
  const tone: OperationalTone = variant ?? getOperationalTone(status);
  const resolvedLabel = label ?? formatOperationalLabel(status ?? "");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-[0.01em]",
        size === "xs" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1 text-xs",
        BADGE_CLASSES[tone],
        className,
      )}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.85)]", DOT_CLASSES[tone])} /> : null}
      {resolvedLabel}
    </span>
  );
}
