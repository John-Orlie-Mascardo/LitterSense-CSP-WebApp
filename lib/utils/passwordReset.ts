/**
 * Browser helpers for LitterSense's own single-use, 30-minute reset links (QA #11).
 * Firebase's reset-link lifetime can't be configured, so the forgot-password pages
 * use /api/auth/password-reset instead of sendPasswordResetEmail.
 */
export class PasswordResetError extends Error {
  constructor(message: string, readonly expired = false) {
    super(message);
  }
}

async function postJson(fetcher: typeof fetch, url: string, body: unknown, fallback: string) {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new PasswordResetError(payload.error ?? fallback, response.status === 410);
}

export function requestPasswordReset(email: string, fetcher: typeof fetch = fetch) {
  return postJson(fetcher, "/api/auth/password-reset", { email }, "We couldn't send the reset link. Please try again.");
}

export function confirmPasswordResetToken(token: string, password: string, fetcher: typeof fetch = fetch) {
  return postJson(fetcher, "/api/auth/password-reset/confirm", { token, password }, "Could not update your password. Please try again.");
}
