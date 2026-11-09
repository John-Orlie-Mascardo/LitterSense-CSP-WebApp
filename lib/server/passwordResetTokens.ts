/**
 * Single-use, 30-minute password-reset tokens (QA #11).
 *
 * Firebase's own reset links cannot be shortened, so LitterSense issues its own.
 * Only the SHA-256 of a token is stored; the raw token exists only in the owner's email.
 * Table: public.password_reset_tokens (service role only, see the migration).
 */
import { createHash, randomBytes } from "node:crypto";
import { smsStoreRequest } from "@/lib/utils/smsAccountSync";

export const PASSWORD_RESET_TTL_MINUTES = 30;
const RESEND_COOLDOWN_MS = 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createResetToken(uid: string, email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const response = await smsStoreRequest("password_reset_tokens", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      token_hash: hashToken(token),
      uid,
      email,
      expires_at: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000).toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Reset token could not be saved (${response.status})`);
  return token;
}

/** True when a link was already sent to this account in the last minute. */
export async function hasRecentResetToken(uid: string): Promise<boolean> {
  const since = new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString();
  const response = await smsStoreRequest(
    `password_reset_tokens?uid=eq.${encodeURIComponent(uid)}&created_at=gt.${encodeURIComponent(since)}&select=token_hash&limit=1`,
  );
  if (!response.ok) throw new Error(`Reset token lookup failed (${response.status})`);
  const rows = await response.json() as unknown[];
  return rows.length > 0;
}

/**
 * Marks the token used and returns its owner, only if it is unused and unexpired.
 * One conditional update, so two clicks on the same link cannot both succeed.
 */
export async function claimResetToken(token: string): Promise<{ uid: string; email: string } | null> {
  const now = new Date().toISOString();
  const response = await smsStoreRequest(
    `password_reset_tokens?token_hash=eq.${hashToken(token)}&used_at=is.null&expires_at=gt.${encodeURIComponent(now)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ used_at: now }),
    },
  );
  if (!response.ok) throw new Error(`Reset token claim failed (${response.status})`);
  const rows = await response.json() as Array<{ uid: string; email: string }>;
  return rows[0] ? { uid: rows[0].uid, email: rows[0].email } : null;
}
