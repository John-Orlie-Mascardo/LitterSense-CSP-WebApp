"use client";

import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import type { AdminDeletionRequest } from "@/lib/utils/adminDeletionRequests";

interface DeletionQueueProps {
  requests: AdminDeletionRequest[];
  isLoading: boolean;
  busyUserId: string | null;
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
}

function formatDate(iso: string) {
  if (!iso) return "Date unavailable";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DeletionQueue({
  requests,
  isLoading,
  busyUserId,
  onApprove,
  onReject,
}: DeletionQueueProps) {
  const pendingCount = requests.filter((request) => request.status === "pending").length;

  return (
    <div className="overflow-hidden rounded-2xl border border-litter-border bg-litter-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-litter-border px-6 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-litter-text">Queue</h2>
          <p className="mt-0.5 text-xs text-litter-muted">Pending and retryable requests</p>
        </div>
        {pendingCount > 0 && (
          <span className="shrink-0 rounded-full bg-status-danger px-2.5 py-1 text-xs font-semibold text-status-danger">
            {pendingCount} pending
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-litter-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading deletion requests...
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-litter-primary-light">
            <CheckCircle className="h-6 w-6 text-litter-primary" />
          </div>
          <p className="font-display font-semibold text-litter-text">All clear</p>
          <p className="mt-1 text-sm text-litter-muted">No active deletion requests</p>
        </div>
      ) : (
        <ul className="divide-y divide-litter-border">
          {requests.map((request) => {
            const busy = busyUserId === request.userId;
            const failed = request.status === "failed";
            const processing = request.status === "processing";
            return (
              <li key={request.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-litter-text">{request.userName}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        failed
                          ? "bg-litter-danger-bg text-litter-danger-text"
                          : processing
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-status-danger text-status-danger"
                      }`}
                    >
                      {failed ? "Deletion failed" : processing ? "Deletion in progress" : "Pending"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-litter-muted">{request.userEmail}</p>
                  <p className="mt-1 text-xs text-litter-muted">
                    Submitted {formatDate(request.requestedDate)}
                  </p>
                  {failed && request.error && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-litter-danger-text">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {request.error}
                    </p>
                  )}
                </div>

                {request.status === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => onApprove(request.userId)}
                      disabled={busy}
                      className="rounded-lg bg-litter-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-litter-primary-hover disabled:opacity-50"
                    >Approve</button>
                    <button
                      type="button"
                      onClick={() => onReject(request.userId)}
                      disabled={busy}
                      className="rounded-lg border border-litter-border bg-litter-card px-3 py-1.5 text-xs font-semibold text-litter-text transition-colors hover:border-litter-danger hover:text-litter-danger disabled:opacity-50"
                    >Reject</button>
                  </div>
                )}
                {failed && (
                  <button
                    type="button"
                    onClick={() => onApprove(request.userId)}
                    disabled={busy}
                    className="shrink-0 rounded-lg bg-litter-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >Retry deletion</button>
                )}
                {processing && (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-litter-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
