"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { DeletionQueue } from "@/components/admin/DeletionQueue";
import { ToastContainer } from "@/components/ui/Toast";
import { useAdmin } from "@/lib/contexts/AdminContext";
import { useDeleteRequest } from "@/lib/contexts/DeleteRequestContext";

export default function AdminRequestsPage() {
  const { toasts, dismissToast, addToast } = useAdmin();
  const { requests, isLoading, approveRequest, rejectRequest } = useDeleteRequest();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);

  const confirmTarget = confirmUserId
    ? requests.find((request) => request.userId === confirmUserId)
    : null;

  async function handleApprove(userId: string) {
    setConfirmUserId(null);
    setBusyUserId(userId);
    try {
      await approveRequest(userId);
      addToast("Account and associated data permanently deleted.", "success");
    } catch (error) {
      console.error("Failed to approve deletion request:", error);
      addToast(
        error instanceof Error ? error.message : "Failed to delete account.",
        "error",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleReject(userId: string) {
    setBusyUserId(userId);
    try {
      await rejectRequest(userId);
      addToast("Deletion request rejected. The account remains active.", "info");
    } catch (error) {
      console.error("Failed to reject deletion request:", error);
      addToast(
        error instanceof Error ? error.message : "Failed to reject request.",
        "error",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <main className="flex-1 space-y-6 overflow-auto p-6 lg:p-8">
      <ToastContainer toasts={toasts} onClose={dismissToast} />

      <div>
        <h1 className="font-display text-2xl font-bold text-litter-text">Delete Requests</h1>
        <p className="mt-0.5 text-sm text-litter-muted">
          Review pending requests and retry failed deletions
        </p>
      </div>

      <DeletionQueue
        requests={requests}
        isLoading={isLoading}
        busyUserId={busyUserId}
        onApprove={setConfirmUserId}
        onReject={(userId) => void handleReject(userId)}
      />

      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmUserId(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-litter-border bg-litter-card p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-litter-danger-bg">
                <AlertTriangle className="h-5 w-5 text-litter-danger" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-litter-text">
                  Permanently Delete Account?
                </h2>
                <p className="mt-0.5 text-xs text-litter-muted">This action cannot be undone.</p>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-litter-border bg-litter-bg px-4 py-3">
              <p className="text-sm font-semibold text-litter-text">{confirmTarget.userName}</p>
              <p className="mt-0.5 text-xs text-litter-muted">{confirmTarget.userEmail}</p>
            </div>
            <p className="mb-5 text-xs leading-relaxed text-litter-muted">
              Approval removes the Firebase Auth account, USER document, all linked Firestore
              data, backup data, and files under this user&apos;s Storage directory.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmUserId(null)}
                className="flex-1 rounded-xl border border-litter-border py-2.5 text-sm font-medium text-litter-text hover:bg-litter-bg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleApprove(confirmTarget.userId)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" /> Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
