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

/** The exact phrase the owner must type before self-delete (checked again on the server). */
export const DELETE_ACCOUNT_PHRASE = "I agree to delete this account.";

export class AccountDeletionError extends Error {
  constructor(message: string, readonly reauthenticate = false) {
    super(message);
  }
}

/** Permanently deletes the signed-in owner's account. Throws `reauthenticate` when sign-in is too old. */
export async function deleteOwnAccount(
  user: TokenUser,
  confirmation: string,
  fetcher: typeof fetch = fetch,
): Promise<{ success: true }> {
  const idToken = await user.getIdToken();
  const response = await fetcher("/api/account/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirmation }),
  });
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean;
    error?: string;
    reauthenticate?: boolean;
  };
  // 401 also covers a session revoked by a password reset, suspend or recovery.
  if (response.status === 401) {
    throw new AccountDeletionError(
      payload.reauthenticate === true && payload.error ? payload.error : "For your security, sign in again, then delete your account.",
      true,
    );
  }
  if (!response.ok || payload.success !== true) {
    throw new AccountDeletionError(payload.error ?? "Unable to delete the account.", payload.reauthenticate === true);
  }
  return { success: true };
}
