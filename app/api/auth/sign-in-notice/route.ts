/**
 * Sign-in notice route
 *
 * Emails the account owner after a real sign-in. The ID token's `auth_time`
 * proves freshness, so session restores and replays older than the window are ignored.
 */

import nodemailer from "nodemailer";
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { decideSignInNotice } from "@/lib/server/signInEmail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return Response.json({ error: "Unauthorized." }, { status: 401 });

  let claims;
  try {
    claims = await getAdminAuth().verifyIdToken(match[1], true);
  } catch {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { timeZone?: unknown } | null;
  const decision = decideSignInNotice(claims, {
    userAgent: request.headers.get("user-agent"),
    timeZone: body?.timeZone,
    nowMs: Date.now(),
  });
  if (!decision.send) return Response.json({ sent: false, reason: decision.reason });

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) {
    console.warn("Sign-in email skipped: SMTP_USER or SMTP_APP_PASSWORD is not set.");
    return Response.json({ sent: false, reason: "not-configured" });
  }

  try {
    await nodemailer.createTransport({ service: "gmail", auth: { user, pass } }).sendMail({
      from: `LitterSense <${user}>`,
      ...decision.message,
    });
  } catch (error) {
    console.error("Sign-in email failed:", error instanceof Error ? error.message : error);
    return Response.json({ sent: false, reason: "send-failed" }, { status: 502 });
  }

  return Response.json({ sent: true });
}
