/**
 * POST /api/admin/users/recovery
 *
 * Account recovery for an owner who lost access. The admin never sees or sets a
 * password: the server emails a Firebase password-reset link straight to the owner.
 *
 * - Registered email still works: send the reset link to it.
 * - Owner lost access to that email: the admin first sets a new email the owner
 *   controls (after checking identity offline), then the link goes to the new email.
 *
 * Every recovery revokes existing sessions and is written to the audit log with the
 * admin's identity-check note.
 */
import nodemailer from "nodemailer";
import { getAdminAuth, getAdminFirestore } from "@/lib/configs/firebase-admin";
import { authorizeAdminRequest } from "@/lib/server/adminAuth";
import { writeAuditLog } from "@/lib/server/auditLog";
import {
  commitOperational,
  readOperationalRecord,
  retryOperational,
  rfidPrimaryEnabled,
  setOperational,
} from "@/lib/server/operationalStore";

export const runtime = "nodejs";

const VALID_UID = /^[A-Za-z0-9:_-]{1,128}$/;
const VALID_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";

/** Keeps the profile document's email in step with Auth so the admin list shows it. Best effort. */
async function updateProfileEmail(uid: string, email: string): Promise<boolean> {
  try {
    if (rfidPrimaryEnabled()) {
      await retryOperational(async () => {
        const path = `users/${uid}`;
        const previous = await readOperationalRecord(uid, path);
        if (!previous) return;
        await commitOperational(uid, [setOperational(path, previous, { ...previous.data, email })]);
      });
    } else {
      await getAdminFirestore().doc(`users/${uid}`).set({ email }, { merge: true });
    }
    return true;
  } catch (error) {
    console.error("[admin-recovery] Auth email changed but the profile email was not updated:", error);
    return false;
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return authorization.response;
  const { admin } = authorization;

  const body = await request.json().catch(() => null) as
    { userId?: unknown; newEmail?: unknown; verificationNote?: unknown } | null;
  const userId = body?.userId;
  const newEmail = typeof body?.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
  const verificationNote = typeof body?.verificationNote === "string" ? body.verificationNote.trim().slice(0, 500) : "";

  if (typeof userId !== "string" || !VALID_UID.test(userId)) {
    return Response.json({ error: "A valid userId is required." }, { status: 400 });
  }
  if (verificationNote.length < 10) {
    return Response.json({ error: "Describe how you verified the owner's identity (at least 10 characters)." }, { status: 400 });
  }
  if (newEmail && !VALID_EMAIL.test(newEmail)) {
    return Response.json({ error: "Enter a valid new email address." }, { status: 400 });
  }
  if (userId === admin.uid) {
    return Response.json({ error: "Use the normal forgot-password page for your own account." }, { status: 400 });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_APP_PASSWORD;
  if (!smtpUser || !smtpPass) {
    // Never hand the reset link to the admin instead: that would let the admin take over the account.
    return Response.json({ error: "Recovery email is not configured on the server." }, { status: 503 });
  }

  const adminAuth = getAdminAuth();
  let previousEmail: string | null = null;
  let recoveryEmail: string;
  let profileUpdated = true;
  try {
    const target = await adminAuth.getUser(userId);
    previousEmail = target.email ?? null;
    if (newEmail && newEmail !== previousEmail) {
      await adminAuth.updateUser(userId, { email: newEmail, emailVerified: false });
      profileUpdated = await updateProfileEmail(userId, newEmail);
      recoveryEmail = newEmail;
    } else if (previousEmail) {
      recoveryEmail = previousEmail;
    } else {
      return Response.json({ error: "This account has no email. Enter a new email for the owner." }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const link = await adminAuth.generatePasswordResetLink(recoveryEmail, { url: `${origin}/login` });
    await nodemailer.createTransport({ service: "gmail", auth: { user: smtpUser, pass: smtpPass } }).sendMail({
      from: `LitterSense <${smtpUser}>`,
      to: recoveryEmail,
      subject: "Reset your LitterSense password",
      text: [
        "A LitterSense administrator started account recovery for you.",
        "",
        `Set a new password here: ${link}`,
        "",
        "If you did not ask for this, ignore this email and contact LitterSense support.",
      ].join("\n"),
    });
    await adminAuth.revokeRefreshTokens(userId);
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/user-not-found") return Response.json({ error: "Account not found." }, { status: 404 });
    if (code === "auth/email-already-exists") {
      return Response.json({ error: "That email already belongs to another account." }, { status: 409 });
    }
    console.error("[admin-recovery] Recovery failed:", error);
    return Response.json({ error: "Unable to complete account recovery." }, { status: 503 });
  }

  let auditSaved = true;
  try {
    await writeAuditLog({
      action: "account_recovery",
      actorUid: admin.uid,
      actorEmail: admin.email,
      targetUid: userId,
      targetEmail: recoveryEmail,
      details: { verificationNote, emailChanged: recoveryEmail !== previousEmail, previousEmail },
    });
  } catch (error) {
    auditSaved = false;
    console.error("[admin-recovery] Recovery sent but the audit entry was not saved:", error);
  }

  return Response.json({ success: true, emailChanged: recoveryEmail !== previousEmail, profileUpdated, auditSaved });
}
