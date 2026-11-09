/**
 * POST /api/auth/password-reset/confirm  { token, password }
 *
 * Sets a new password from a LitterSense reset link (QA #11). The password policy is
 * checked first, so a weak password doesn't use up the link. The link is then claimed
 * atomically (unused and under 30 minutes), the password set, and all sessions revoked.
 */
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { claimResetToken } from "@/lib/server/passwordResetTokens";
import { PASSWORD_POLICY_MESSAGE, isPasswordPolicySatisfied } from "@/lib/utils/passwordPolicy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown; password?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!token || token.length > 200) {
    return Response.json({ error: "This reset link is invalid. Request a new one." }, { status: 400 });
  }
  if (!isPasswordPolicySatisfied(password)) {
    return Response.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 });
  }

  try {
    const owner = await claimResetToken(token);
    if (!owner) {
      return Response.json({ error: "This reset link has expired or was already used. Request a new one." }, { status: 410 });
    }
    const adminAuth = getAdminAuth();
    await adminAuth.updateUser(owner.uid, { password });
    await adminAuth.revokeRefreshTokens(owner.uid);
  } catch (error) {
    console.error("[password-reset] Password not updated:", error);
    return Response.json({ error: "Could not update your password. Request a new link and try again." }, { status: 503 });
  }
  return Response.json({ success: true });
}
