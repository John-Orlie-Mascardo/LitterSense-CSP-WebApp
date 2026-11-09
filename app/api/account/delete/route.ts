/**
 * POST /api/account/delete
 *
 * Owner self-delete, replacing the wait for admin approval. The owner must type the
 * exact phrase and have signed in within the last 5 minutes. The server records the
 * request, then runs the same permanent deletion as admin approval.
 */
import { authorizeOwnerRequest } from "@/lib/server/ownerAuth";
import { rfidPrimaryEnabled, OperationalError } from "@/lib/server/operationalStore";
import { operationalAdminTransition } from "@/lib/server/operationalAdmin";
import { deletePrimaryAccount } from "@/lib/server/primaryAccountDeletion";
import { DELETE_ACCOUNT_PHRASE } from "@/lib/utils/accountDeletion";

export const runtime = "nodejs";

const RECENT_SIGN_IN_SECS = 5 * 60;

export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request);
  if (!authorization.ok) return authorization.response;
  const { owner } = authorization;

  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== DELETE_ACCOUNT_PHRASE) {
    return Response.json({ error: `Type exactly: ${DELETE_ACCOUNT_PHRASE}` }, { status: 400 });
  }
  if (owner.authTime === null || Date.now() / 1000 - owner.authTime > RECENT_SIGN_IN_SECS) {
    return Response.json(
      { error: "For your security, sign in again before deleting your account.", reauthenticate: true },
      { status: 401 },
    );
  }
  // The Firestore fallback has no atomic claim for self-delete; keep its admin-approval flow.
  if (!rfidPrimaryEnabled()) {
    return Response.json({ error: "Self-delete is unavailable right now. Use Request deletion instead." }, { status: 503 });
  }

  try {
    await operationalAdminTransition({
      userId: owner.uid,
      action: "request",
      actorUid: owner.uid,
      actorEmail: owner.email,
      reason: "Owner self-delete (typed confirmation)",
    });
  } catch (error) {
    // 409: a request already exists (pending or failed); `start` below can still claim it.
    if (!(error instanceof OperationalError && error.status === 409)) {
      return Response.json(
        { error: error instanceof OperationalError ? error.message : "Unable to start account deletion." },
        { status: error instanceof OperationalError ? error.status : 503 },
      );
    }
  }

  return deletePrimaryAccount(owner.uid, owner);
}
