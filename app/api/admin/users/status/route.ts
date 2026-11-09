/**
 * GET  /api/admin/users/status: suspended state of every Firebase Auth account.
 * POST /api/admin/users/status: suspend or restore one account.
 *
 * Suspending disables the Firebase Auth user and revokes its sessions, so the
 * owner is signed out everywhere and cannot sign in until restored. Board device
 * tokens are not touched.
 */
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { authorizeAdminRequest } from "@/lib/server/adminAuth";
import { writeAuditLog } from "@/lib/server/auditLog";

export const runtime = "nodejs";

const VALID_UID = /^[A-Za-z0-9:_-]{1,128}$/;

function isMissingAuthUser(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    error.code === "auth/user-not-found";
}

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return authorization.response;

  try {
    const suspended: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await getAdminAuth().listUsers(1000, pageToken);
      for (const user of page.users) if (user.disabled) suspended.push(user.uid);
      pageToken = page.pageToken;
    } while (pageToken);
    return Response.json({ suspended }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin-user-status] Failed to list account status:", error);
    return Response.json({ error: "Unable to load account status." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return authorization.response;
  const { admin } = authorization;

  const body = await request.json().catch(() => null) as { userId?: unknown; suspended?: unknown } | null;
  const userId = body?.userId;
  const suspended = body?.suspended;
  if (typeof userId !== "string" || !VALID_UID.test(userId) || typeof suspended !== "boolean") {
    return Response.json({ error: "A valid userId and suspended flag are required." }, { status: 400 });
  }
  if (userId === admin.uid) {
    return Response.json({ error: "You cannot suspend your own admin account." }, { status: 400 });
  }

  const adminAuth = getAdminAuth();
  let targetEmail: string | null = null;
  try {
    const target = await adminAuth.getUser(userId);
    targetEmail = target.email ?? null;
    await adminAuth.updateUser(userId, { disabled: suspended });
    if (suspended) await adminAuth.revokeRefreshTokens(userId);
  } catch (error) {
    if (isMissingAuthUser(error)) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }
    console.error("[admin-user-status] Failed to update account status:", error);
    return Response.json({ error: "Unable to update account status." }, { status: 503 });
  }

  // The status change already happened; a failed audit write must not undo or hide it.
  let auditSaved = true;
  try {
    await writeAuditLog({
      action: suspended ? "user_suspended" : "user_restored",
      actorUid: admin.uid,
      actorEmail: admin.email,
      targetUid: userId,
      targetEmail,
    });
  } catch (error) {
    auditSaved = false;
    console.error("[admin-user-status] Status changed but the audit entry was not saved:", error);
  }

  return Response.json({ success: true, suspended, auditSaved });
}
