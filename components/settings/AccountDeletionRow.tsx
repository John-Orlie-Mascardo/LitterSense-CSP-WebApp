"use client";

import { AlertTriangle, Clock, Loader2, XSquare } from "lucide-react";
import type { AccountDeletionStatus } from "@/lib/utils/accountDeletion";

interface AccountDeletionRowProps {
  status: AccountDeletionStatus;
  requestedAt: Date | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onRequest: () => void;
}

export function AccountDeletionRow({
  status,
  requestedAt,
  isLoading,
  isSubmitting,
  onRequest,
}: AccountDeletionRowProps) {
  if (status === "pending") {
    return (
      <div className="p-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-800 dark:bg-amber-950/30">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Deletion requested
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
              Your request is awaiting admin review. You can continue using the app in the meantime.
            </p>
            {requestedAt && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
                Submitted {requestedAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
            <button
              type="button"
              disabled
              className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 opacity-70 dark:border-amber-700 dark:text-amber-300"
            >
              Request pending
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "processing" || status === "failed") {
    const failed = status === "failed";
    return (
      <div className="p-4">
        <div className="flex items-start gap-3 rounded-xl border border-litter-border bg-litter-bg p-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-litter-muted" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-litter-text">
              {failed ? "Deletion needs admin attention" : "Deletion processing"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-litter-muted">
              {failed
                ? "Deletion did not complete. An admin can retry it; some account data may already have been removed."
                : "An administrator is processing your request."}
            </p>
            <button type="button" disabled className="mt-3 text-xs font-semibold text-litter-muted">
              {failed ? "Request retained" : "Processing"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRequest}
      disabled={isLoading || isSubmitting}
      className="flex w-full items-center justify-between border-none bg-transparent p-4 text-left transition-colors hover:bg-theme-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex items-center gap-3">
        {isSubmitting ? (
          <Loader2 className="h-5 w-5 animate-spin text-red-500" />
        ) : (
          <XSquare className="h-5 w-5 text-red-500" />
        )}
        <span className="text-sm font-medium text-red-500">
          {isLoading
            ? "Checking deletion request…"
            : isSubmitting
              ? "Submitting request…"
              : "Request Account Deletion"}
        </span>
      </span>
    </button>
  );
}
