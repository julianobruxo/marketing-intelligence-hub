"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { rejectDesignAction } from "@/modules/design-orchestration/application/reject-design";

type RejectDesignPanelProps = {
  contentItemId: string;
  currentStatus: string;
};

const REJECTION_REASONS = [
  "Wrong visual style",
  "Copy doesn't match",
  "Wrong format/dimensions",
  "Low quality render",
  "Other",
] as const;

export function RejectDesignPanel({ contentItemId, currentStatus }: RejectDesignPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (currentStatus !== "DESIGN_READY") {
    return null;
  }

  function handleSubmit() {
    if (!reason) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await rejectDesignAction({
        contentItemId,
        reason,
        feedback,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setOpen(false);
      setReason("");
      setFeedback("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 dark:border-[rgba(217,119,6,0.32)] dark:bg-[rgba(67,38,5,0.35)]">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Need a different design?
          </p>
          <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/85">
            Reject the current asset, explain why, and retry the design with a revised brief.
          </p>
        </div>
      </div>

      {!open ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="mt-4 border-amber-300 bg-white text-amber-900 hover:bg-amber-100 dark:border-[rgba(217,119,6,0.35)] dark:bg-[rgba(28,20,8,0.8)] dark:text-amber-100 dark:hover:bg-[rgba(52,34,10,0.88)]"
          data-testid="reject-design-button"
        >
          Reject Design
        </Button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-amber-900/80 dark:text-amber-200/80">
              Reason
            </span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              data-testid="reject-reason-select"
              className="h-10 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200 dark:border-[rgba(217,119,6,0.35)] dark:bg-[rgba(25,17,7,0.9)] dark:text-slate-100 dark:focus:ring-[rgba(217,119,6,0.2)]"
            >
              <option value="">Select a reason</option>
              {REJECTION_REASONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-amber-900/80 dark:text-amber-200/80">
              Feedback
            </span>
            <Textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Optional feedback for the operator or designer."
              className="min-h-24 border-amber-300 bg-white text-slate-900 dark:border-[rgba(217,119,6,0.35)] dark:bg-[rgba(25,17,7,0.9)] dark:text-slate-100"
              data-testid="reject-feedback-textarea"
            />
          </label>

          {error ? (
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!reason || isPending}
              className="transition-default bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
              data-testid="confirm-rejection-button"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                "Confirm Rejection"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100 dark:border-[rgba(217,119,6,0.35)] dark:bg-[rgba(28,20,8,0.8)] dark:text-amber-100 dark:hover:bg-[rgba(52,34,10,0.88)]"
              data-testid="cancel-rejection-button"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
