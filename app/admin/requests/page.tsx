"use client";

import { useMemo } from "react";
import { Check, X, CheckCircle } from "lucide-react";
import { useAdmin } from "@/lib/contexts/AdminContext";
import { useDeleteRequest } from "@/lib/contexts/DeleteRequestContext";
import { ToastContainer } from "@/components/ui/Toast";

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Requests Page ────────────────────────────────────────────────────────────

export default function AdminRequestsPage() {
  const { toasts, dismissToast, addToast } = useAdmin();
  const { requests, approveRequest, rejectRequest } = useDeleteRequest();

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );
  const resolvedRequests = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "approved" || r.status === "rejected"
      ),
    [requests]
  );

  async function handleApprove(id: string) {
    try {
      await approveRequest(id);
      addToast("Account deletion approved. User removed.", "success");
    } catch (error) {
      console.error("Failed to approve request:", error);
      addToast("Failed to approve request.", "error");
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectRequest(id);
      addToast("Request rejected. User has been notified.", "info");
    } catch (error) {
      console.error("Failed to reject request:", error);
      addToast("Failed to reject request.", "error");
    }
  }

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 overflow-auto">
      <ToastContainer toasts={toasts} onClose={dismissToast} />

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="font-display font-bold text-2xl text-litter-text">
          Delete Requests
        </h1>
        <p className="text-sm text-litter-muted mt-0.5">
          Manage user account deletion requests
        </p>
      </div>

      {/* ── Requests queue ──────────────────────────────────────────── */}
      <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-litter-border flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-litter-text text-base">
              Queue
            </h2>
            <p className="text-xs text-litter-muted mt-0.5">
              Pending and recent requests
            </p>
          </div>
          {pendingRequests.length > 0 && (
            <span className="shrink-0 px-2.5 py-1 bg-status-danger text-status-danger text-xs font-semibold rounded-full">
              {pendingRequests.length} pending
            </span>
          )}
        </div>

        {pendingRequests.length === 0 && resolvedRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-litter-primary-light flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6 text-litter-primary" />
            </div>
            <p className="font-display font-semibold text-litter-text">
              All clear
            </p>
            <p className="text-sm text-litter-muted mt-1">
              No pending deletion requests
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-litter-border">
            {[...pendingRequests, ...resolvedRequests].map((req) => (
              <li
                key={req.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-litter-text">
                      {req.userName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                        req.status === "pending"
                          ? "bg-status-danger text-status-danger"
                          : req.status === "approved"
                          ? "bg-litter-primary-light text-litter-primary"
                          : "bg-litter-bg text-litter-muted border border-litter-border"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <p className="text-xs text-litter-muted mt-0.5">
                    {req.userEmail}
                  </p>
                  <p className="text-xs text-litter-muted mt-1 leading-relaxed">
                    <span className="font-medium text-litter-text-secondary">
                      Reason:
                    </span>{" "}
                    {req.reason ?? "Account deletion request"}
                    {" · "}
                    <span className="font-medium text-litter-text-secondary">
                      Requested:
                    </span>{" "}
                    {formatDate(req.requestedDate)}
                    {req.resolvedDate && (
                      <>
                        {" · "}
                        <span className="font-medium text-litter-text-secondary">
                          {req.status === "approved"
                            ? "Approved:"
                            : "Rejected:"}
                        </span>{" "}
                        {formatDate(req.resolvedDate)}
                      </>
                    )}
                  </p>
                </div>

                {/* Actions */}
                {req.status === "pending" ? (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(req.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-litter-primary text-white text-xs font-semibold rounded-lg hover:bg-litter-primary-hover transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(req.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-litter-card border border-litter-border text-litter-text text-xs font-semibold rounded-lg hover:border-litter-danger hover:text-litter-danger transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-litter-muted shrink-0 italic capitalize">
                    {req.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
