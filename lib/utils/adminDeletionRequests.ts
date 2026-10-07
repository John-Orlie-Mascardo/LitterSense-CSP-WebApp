import { adminApiFetch } from "@/lib/utils/adminApi";

export type AdminDeletionStatus = "pending" | "processing" | "failed";

export interface AdminDeletionRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedDate: string;
  status: AdminDeletionStatus;
  error?: string;
}

type TimestampLike = { toDate: () => Date };

function timestampIso(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return (value as TimestampLike).toDate().toISOString();
  }
  return typeof value === "string" ? value : "";
}

export function readAdminDeletionRequest(
  userId: string,
  data: Record<string, unknown>,
): AdminDeletionRequest | null {
  const status = data.deletionStatus;
  if (status !== "pending" && status !== "processing" && status !== "failed") {
    return null;
  }

  const email = typeof data.email === "string" ? data.email : "No email";
  const name =
    (typeof data.fullName === "string" && data.fullName.trim()) ||
    (typeof data.displayName === "string" && data.displayName.trim()) ||
    email.split("@")[0] ||
    "Unknown User";
  const deletionError =
    typeof data.deletionError === "string" && data.deletionError.trim()
      ? data.deletionError
      : undefined;

  return {
    id: userId,
    userId,
    userName: name,
    userEmail: email,
    requestedDate: timestampIso(data.deletionRequestedAt),
    status,
    ...(deletionError ? { error: deletionError } : {}),
  };
}

export async function runAdminDeletionAction(
  action: "approve" | "reject",
  userId: string,
): Promise<void> {
  const endpoint =
    action === "approve"
      ? "/api/admin/delete-user"
      : "/api/admin/deletion-request/reject";
  const response = await adminApiFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Unable to ${action} deletion request.`);
  }
}
