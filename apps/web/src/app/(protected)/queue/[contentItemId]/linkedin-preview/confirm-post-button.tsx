"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { confirmMockLinkedInPostAction } from "@/modules/linkedin/application/confirm-mock-post-action";

type Props = {
  contentItemId: string;
  disabled: boolean;
  disabledReason: string | null;
};

type State =
  | { kind: "idle" }
  | { kind: "done"; publishAttemptId: string }
  | { kind: "error"; error: string };

export function ConfirmPostButton({ contentItemId, disabled, disabledReason }: Props) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<State>({ kind: "idle" });

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmMockLinkedInPostAction(contentItemId);
      if (result.ok) {
        setState({ kind: "done", publishAttemptId: result.publishAttemptId });
      } else {
        setState({ kind: "error", error: result.error });
      }
    });
  }

  if (state.kind === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 dark:border-[rgba(63,177,135,0.3)] dark:bg-[rgba(16,48,34,0.5)]">
        <div className="flex items-center gap-2.5 mb-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Mock post confirmed
          </p>
        </div>
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-4">
          Attempt ID: <span className="font-mono">{state.publishAttemptId}</span>
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/queue"
            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "#0A66C2" }}
          >
            Back to queue
          </Link>
          <Link
            href={`/queue/${contentItemId}`}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(255,255,255,0.06)] dark:text-[rgba(255,255,255,0.85)] dark:hover:bg-[rgba(255,255,255,0.12)]"
          >
            View item
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleConfirm}
        disabled={disabled || isPending}
        className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: "#0A66C2" }}
        data-testid="confirm-mock-post-button"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? "Confirming..." : "Confirm mock post"}
      </button>

      {state.kind === "error" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-[rgba(244,63,94,0.25)] dark:bg-[rgba(127,29,29,0.2)] dark:text-rose-200">
          {state.error}
        </div>
      )}

      {disabled && disabledReason && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{disabledReason}</p>
      )}
    </div>
  );
}
