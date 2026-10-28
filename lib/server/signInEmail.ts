/**
 * signInEmail.ts
 *
 * Pure rules and copy for the "new sign-in" security email.
 *
 * DONE: fresh-sign-in check, method/device/time labels, plain-text and HTML body
 * PLACEHOLDER: none
 *
 * A real sign-in sets a new Firebase `auth_time`; session restores and token
 * refreshes keep the old one, so only a fresh `auth_time` may send an email.
 */

export const SIGN_IN_FRESH_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_SIGN_IN_TIME_ZONE = "Asia/Manila";

export interface SignInTokenClaims {
  email?: string;
  auth_time: number;
  firebase?: { sign_in_provider?: string };
}

export interface SignInEmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SignInNoticeDecision =
  | { send: true; message: SignInEmailMessage }
  | { send: false; reason: "no-email" | "not-fresh" };

export function isFreshSignIn(authTimeSeconds: number, nowMs: number): boolean {
  const ageMs = nowMs - authTimeSeconds * 1000;
  // Small negative ages cover clock skew between Firebase and this server.
  return ageMs >= -60_000 && ageMs <= SIGN_IN_FRESH_WINDOW_MS;
}

export function describeSignInMethod(provider: string | undefined): string {
  if (provider === "password") return "Email and password";
  if (provider === "google.com") return "Google";
  return provider || "Unknown";
}

export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
      : /OPR\/|Opera/.test(userAgent) ? "Opera"
        : /SamsungBrowser\//.test(userAgent) ? "Samsung Internet"
          : /Firefox\/|FxiOS\//.test(userAgent) ? "Firefox"
            : /Chrome\/|CriOS\//.test(userAgent) ? "Chrome"
              : /Safari\//.test(userAgent) ? "Safari"
                : null;
  const os =
    /Windows/.test(userAgent) ? "Windows"
      : /Android/.test(userAgent) ? "Android"
        : /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
          : /Mac OS X|Macintosh/.test(userAgent) ? "macOS"
            : /Linux/.test(userAgent) ? "Linux"
              : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

export function resolveTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== "string" || !timeZone) return DEFAULT_SIGN_IN_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_SIGN_IN_TIME_ZONE;
  }
}

export function formatSignInTime(date: Date, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted} (${timeZone})`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function decideSignInNotice(
  claims: SignInTokenClaims,
  context: { userAgent: string | null; timeZone: unknown; nowMs: number },
): SignInNoticeDecision {
  if (!claims.email) return { send: false, reason: "no-email" };
  if (!isFreshSignIn(claims.auth_time, context.nowMs)) return { send: false, reason: "not-fresh" };

  const details: Array<[string, string]> = [
    ["Time", formatSignInTime(new Date(claims.auth_time * 1000), resolveTimeZone(context.timeZone))],
    ["Method", describeSignInMethod(claims.firebase?.sign_in_provider)],
    ["Device", describeDevice(context.userAgent)],
  ];
  const intro = "A new sign-in to your LitterSense account just happened.";
  const outro = "If this was you, no action is needed. If not, reset your password right away.";

  return {
    send: true,
    message: {
      to: claims.email,
      subject: "New sign-in to your LitterSense account",
      text: [intro, "", ...details.map(([label, value]) => `${label}: ${value}`), "", outro].join("\n"),
      html: [
        `<p>${intro}</p>`,
        `<ul>${details.map(([label, value]) => `<li><strong>${label}:</strong> ${escapeHtml(value)}</li>`).join("")}</ul>`,
        `<p>${outro}</p>`,
      ].join(""),
    },
  };
}
