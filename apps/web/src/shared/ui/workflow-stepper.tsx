import { Check, CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type StepState = "complete" | "current" | "upcoming";

export interface PipelineStepDef {
  key: string;
  label: string;
}

export interface WorkflowStepDef {
  key: string;
  label: string;
  detail: string;
  state: StepState;
}

type WorkflowStepperProps =
  | {
      mode?: "pipeline";
      steps: PipelineStepDef[];
      currentKey: string;
      className?: string;
    }
  | {
      mode: "steps";
      steps: WorkflowStepDef[];
      currentKey?: never;
      className?: string;
    };

function derivePipelineState(index: number, currentIndex: number): StepState {
  if (index < currentIndex) return "complete";
  if (index === currentIndex) return "current";
  return "upcoming";
}

export function WorkflowStepper(props: WorkflowStepperProps) {
  const { className } = props;

  if (props.mode === "steps") {
    return (
      <div className={cn("flex flex-wrap items-center gap-3 lg:flex-nowrap", className)}>
        {props.steps.map((step, index) => {
          const isComplete = step.state === "complete";
          const isCurrent = step.state === "current";
          return (
            <div key={step.key} className="flex min-w-0 items-center gap-3">
              {index > 0 ? <div className="hidden h-px flex-1 bg-slate-200 dark:bg-[rgba(88,108,186,0.34)] lg:block" /> : null}
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-default",
                    isComplete
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isCurrent
                        ? "border-slate-950 bg-slate-950 text-white shadow-sm dark:border-indigo-400 dark:bg-indigo-500"
                      : "border-slate-300 bg-white text-slate-500 dark:border-[rgba(88,108,186,0.34)] dark:bg-[rgba(22,30,58,0.84)] dark:text-[#95A7CB]",
                  )}
                >
                  {isComplete ? <CheckCircle2 className="h-4 w-4" /> : null}
                  {isCurrent ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
                  {!isComplete && !isCurrent ? (
                    <span className="h-2.5 w-2.5 rounded-full border border-current" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isCurrent ? "text-slate-950 dark:text-slate-100" : "text-slate-700 dark:text-slate-300",
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-[#95A7CB]">{step.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Pipeline mode (default) — compact horizontal display
  const currentIndex = props.steps.findIndex((s) => s.key === props.currentKey);
  const resolvedIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {props.steps.map((step, index) => {
        const state = derivePipelineState(index, resolvedIndex);
        return (
          <span key={step.key} className="flex items-center gap-2">
            {index > 0 ? <ChevronRight className="h-3 w-3 text-slate-300 dark:text-[#6F7FA3]" /> : null}
            {state === "complete" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-emerald-500/50 dark:bg-emerald-900/40 dark:text-emerald-200">
                <Check className="h-3 w-3" />
                {step.label}
              </span>
            ) : state === "current" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white shadow-[0_18px_36px_-28px_rgba(15,23,42,0.8)] dark:border-indigo-400 dark:bg-indigo-600 dark:text-white dark:shadow-[0_18px_36px_-28px_rgba(99,102,241,0.5)]">
                <Circle className="h-3 w-3 fill-current" />
                {step.label}
              </span>
            ) : (
              <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium dark:border-[rgba(88,108,186,0.5)] dark:bg-[rgba(15,20,40,0.6)]", step.key === "post" ? "border-slate-300 bg-slate-50 text-slate-500 font-semibold dark:border-[rgba(88,108,186,0.7)] dark:text-white" : "border-slate-200 bg-white text-slate-400 dark:text-[#AABCE0]")}>
                {step.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
