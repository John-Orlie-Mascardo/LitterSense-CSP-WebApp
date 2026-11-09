/**
 * POST /api/auth/password-reset  { email }
 *
 * Emails a single-use LitterSense reset link valid for 30 minutes (QA #11).
 * Always answers the same way whether or not the email has an account, so the
 * endpoint can't be used to discover which emails are registered.
 */
import nodemailer from "nodemailer";
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import {
  PASSWORD_RESET_TTL_MINUTES,
  createResetToken,
  hasRecentResetToken,
} from "@/lib/server/passwordResetTokens";

export const runtime = "nodejs";

const VALID_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const SAME_ANSWER = { sent: true };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!VALID_EMAIL.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  if (!smtpUser || !smtpPass) {
    return Response.json({ error: "Password reset email is not configured." }, { status: 503 });
  }

  let uid: string;
  try {
    uid = (await getAdminAuth().getUserByEmail(email)).uid;
  } catch (error) {
    const missing = typeof error === "object" && error !== null && "code" in error && error.code === "auth/user-not-found";
    if (missing) return Response.json(SAME_ANSWER);
    console.error("[password-reset] Account lookup failed:", error);
    return Response.json({ error: "We couldn't send the reset link. Please try again." }, { status: 503 });
  }

  try {
    if (await hasRecentResetToken(uid)) return Response.json(SAME_ANSWER);
    const token = await createResetToken(uid, email);
    const link = `${new URL(request.url).origin}/reset-password?token=${encodeURIComponent(token)}`;
    await nodemailer.createTransport({ service: "gmail", auth: { user: smtpUser, pass: smtpPass } }).sendMail({
      from: `LitterSense <${smtpUser}>`,
      to: email,
      subject: "Reset your LitterSense password",
      text: [
        "Someone asked to reset your LitterSense password.",
        "",
        `Set a new password here: ${link}`,
        "",
        `This link works once and expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`,
        "If you didn't ask for this, you can ignore this email.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("[password-reset] Reset link not sent:", error);
    return Response.json({ error: "We couldn't send the reset link. Please try again." }, { status: 503 });
  }
  return Response.json(SAME_ANSWER);
}
