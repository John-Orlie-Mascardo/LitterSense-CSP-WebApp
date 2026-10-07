import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/configs/firebase-admin";
import { buildAuditLogRecord } from "@/lib/server/auditLog";
import { authorizeOwnerRequest } from "@/lib/server/ownerAuth";

class AccountNotFoundError extends Error {}
class ActiveDeletionRequestError extends Error {}

function normalizeReason(value: unknown): string {
  if (typeof value !== "string") return "No reason provided";
  return value.trim().slice(0, 250) || "No reason provided";
}

export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request);
  if (!authorization.ok) return authorization.response;

  const body = await request.json().catch(() => null) as { reason?: unknown } | null;
  const reason = normalizeReason(body?.reason);
  const { owner } = authorization;
  const db = getAdminFirestore();

  try {
    await db.runTransaction(async (transaction) => {
      const userRef = db.doc(`users/${owner.uid}`);
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) throw new AccountNotFoundError();

      const userData = userSnapshot.data() ?? {};
      const currentStatus = userData.deletionStatus ?? "none";
      if (currentStatus !== "none") throw new ActiveDeletionRequestError();

      transaction.update(userRef, {
        deletionStatus: "pending",
        deletionRequestedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(
        db.collection("auditLogs").doc(),
        buildAuditLogRecord({
          action: "deletion_requested",
          actorUid: owner.uid,
          actorEmail: owner.email,
          targetUid: owner.uid,
          targetEmail:
            typeof userData.email === "string" ? userData.email : owner.email,
          details: { reason },
        }),
      );
    });
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      return Response.json({ error: "Account profile not found." }, { status: 404 });
    }
    if (error instanceof ActiveDeletionRequestError) {
      return Response.json(
        { error: "A deletion request is already active." },
        { status: 409 },
      );
    }
    console.error("Failed to submit account deletion request:", error);
    return Response.json(
      { error: "Unable to submit deletion request." },
      { status: 500 },
    );
  }

  return Response.json({ success: true, deletionStatus: "pending" });
}
