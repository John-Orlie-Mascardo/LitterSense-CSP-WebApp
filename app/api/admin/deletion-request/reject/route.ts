import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/configs/firebase-admin";
import { authorizeAdminRequest } from "@/lib/server/adminAuth";
import { buildAuditLogRecord } from "@/lib/server/auditLog";

const VALID_UID = /^[A-Za-z0-9:_-]{1,128}$/;

class RequestNotFoundError extends Error {}
class RequestNotPendingError extends Error {}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return authorization.response;

  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!VALID_UID.test(userId)) {
    return Response.json({ error: "Invalid user ID." }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    await db.runTransaction(async (transaction) => {
      const userRef = db.doc(`users/${userId}`);
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists) throw new RequestNotFoundError();

      const userData = snapshot.data() ?? {};
      if (userData.deletionStatus !== "pending") throw new RequestNotPendingError();

      transaction.update(userRef, {
        deletionStatus: "none",
        deletionRequestedAt: FieldValue.delete(),
        deletionError: FieldValue.delete(),
      });
      transaction.set(
        db.collection("auditLogs").doc(),
        buildAuditLogRecord({
          action: "deletion_rejected",
          actorUid: authorization.admin.uid,
          actorEmail: authorization.admin.email,
          targetUid: userId,
          targetEmail: typeof userData.email === "string" ? userData.email : null,
          details: { result: "returned_to_normal" },
        }),
      );
    });
  } catch (error) {
    if (error instanceof RequestNotFoundError) {
      return Response.json({ error: "Deletion request not found." }, { status: 404 });
    }
    if (error instanceof RequestNotPendingError) {
      return Response.json(
        { error: "Only pending deletion requests can be rejected." },
        { status: 409 },
      );
    }
    console.error("Failed to reject account deletion request:", error);
    return Response.json({ error: "Unable to reject deletion request." }, { status: 500 });
  }

  return Response.json({ success: true, deletionStatus: "none" });
}
