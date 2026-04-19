import { cn } from "@/lib/utils";

type MetricTone = "neutral" | "progress" | "waiting" | "ready" | "overdue";

const toneClasses: Record<MetricTone, string> = {
  neutral:
    "border-[var(--surface-border)] bg-white/85 text-slate-950 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(16,23,47,0.84)] dark:text-slate-100",
  progress:
    "border-blue-200/80 bg-blue-50/80 text-blue-950 dark:border-[rgba(87,132,212,0.38)] dark:bg-[rgba(18,31,65,0.74)] dark:text-sky-100",
  waiting:
    "border-amber-200/80 bg-amber-50/80 text-amber-950 dark:border-[rgba(191,141,57,0.38)] dark:bg-[rgba(47,32,6,0.74)] dark:text-amber-100",
  ready:
    "border-emerald-200/80 bg-emerald-50/80 text-emerald-950 dark:border-[rgba(63,177,135,0.38)] dark:bg-[rgba(11,38,26,0.74)] dark:text-emerald-100",
  overdue:
    "border-rose-200/80 bg-rose-50/80 text-rose-950 dark:border-[rgba(176,74,102,0.4)] dark:bg-[rgba(52,10,22,0.74)] dark:text-rose-100",
};

interface MetricCardProps {
  label: string;
  value: string | number;
  detail?: string;
  tone?: MetricTone;
  className?: string;
}

export function MetricCard({ label, value, detail, tone = "neutral", className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3.5 transition-default hover:-translate-y-0.5 hover:shadow-sm",
        toneClasses[tone],
        className,
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-[#8B97B7]">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {detail ? (
          <p className="max-w-[12rem] text-right text-xs leading-5 text-slate-500 dark:text-[#95A7CB]">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}
