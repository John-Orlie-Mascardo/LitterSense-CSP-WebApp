import type { User } from "firebase/auth";

export type AccountDeletionStatus = "none" | "pending" | "processing" | "failed";

export interface AccountDeletionState {
  status: AccountDeletionStatus;
  requestedAt: Date | null;
}

type TokenUser = Pick<User, "getIdToken">;
type TimestampLike = { toDate: () => Date };

const isTimestampLike = (value: unknown): value is TimestampLike =>
  typeof value === "object" &&
  value !== null &&
  "toDate" in value &&
  typeof value.toDate === "function";

export function readAccountDeletionState(
  data: Record<string, unknown> | undefined,
): AccountDeletionState {
  const rawStatus = data?.deletionStatus;
  const status: AccountDeletionStatus =
    rawStatus === "pending" || rawStatus === "processing" || rawStatus === "failed"
      ? rawStatus
      : "none";
  const requestedAt = isTimestampLike(data?.deletionRequestedAt)
    ? data.deletionRequestedAt.toDate()
    : null;

  return { status, requestedAt };
}

export async function requestAccountDeletion(
  user: TokenUser,
  reason: string,
  fetcher: typeof fetch = fetch,
): Promise<{ success: true; deletionStatus: "pending" }> {
  const idToken = await user.getIdToken();
  const response = await fetcher("/api/account/deletion-request", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean;
    deletionStatus?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to submit deletion request.");
  }
  if (payload.success !== true || payload.deletionStatus !== "pending") {
    throw new Error("Deletion request returned an invalid response.");
  }

  return { success: true, deletionStatus: "pending" };
}
