import { adminApiFetch } from "@/lib/utils/adminApi";

const ENDPOINT = "/api/admin/users/status";

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return new Error(payload.error ?? fallback);
}

/** UIDs of Firebase Auth accounts that are currently suspended (disabled). */
export async function fetchSuspendedUserIds(): Promise<Set<string>> {
  const response = await adminApiFetch(ENDPOINT);
  if (!response.ok) throw await readError(response, "Unable to load account status.");
  const payload = (await response.json()) as { suspended?: unknown };
  return new Set(Array.isArray(payload.suspended) ? payload.suspended.filter((id): id is string => typeof id === "string") : []);
}

/** Suspends or restores one account. `auditSaved` is false when the activity log could not record it. */
export async function setUserSuspended(userId: string, suspended: boolean): Promise<{ auditSaved: boolean }> {
  const response = await adminApiFetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, suspended }),
  });
  if (!response.ok) throw await readError(response, "Unable to update account status.");
  const payload = (await response.json()) as { auditSaved?: unknown };
  return { auditSaved: payload.auditSaved !== false };
}

/** Emails the owner a password-reset link (optionally to a new email). The admin never sees the link. */
export async function recoverUserAccount(input: { userId: string; newEmail?: string; verificationNote: string }) {
  const response = await adminApiFetch("/api/admin/users/recovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response, "Unable to complete account recovery.");
  return (await response.json()) as { emailChanged: boolean; profileUpdated: boolean; auditSaved: boolean };
}
