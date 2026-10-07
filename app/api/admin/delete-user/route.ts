import { NextRequest, NextResponse } from "next/server";
import {
  getAdminAuth,
  getAdminFirestore,
  getAdminStorageBucket,
} from "@/lib/configs/firebase-admin";
import { authorizeAdminRequest } from "@/lib/server/adminAuth";
import { writeAuditLog } from "@/lib/server/auditLog";
import { smsStoreRequest } from "@/lib/utils/smsAccountSync";

export const runtime = "nodejs";

const VALID_UID = /^[A-Za-z0-9:_-]{1,128}$/;

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown error").slice(0, 300);
}

function isMissingAuthUser(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "auth/user-not-found"
  );
}

export async function POST(req: NextRequest) {
  const authorization = await authorizeAdminRequest(req);
  if (!authorization.ok) return authorization.response;

  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!VALID_UID.test(userId)) {
    return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  }

  const db = getAdminFirestore();
  const userRef = db.doc(`users/${userId}`);
  const snapshot = await userRef.get();
  if (!snapshot.exists) {
    return NextResponse.json({ error: "Deletion request not found." }, { status: 404 });
  }

  const userData = snapshot.data() ?? {};
  if (userData.deletionStatus !== "pending" && userData.deletionStatus !== "failed") {
    return NextResponse.json(
      { error: "This account has no actionable deletion request." },
      { status: 409 },
    );
  }

  const targetEmail = typeof userData.email === "string" ? userData.email : null;
  const requestProfile = {
    email: targetEmail,
    fullName: typeof userData.fullName === "string" ? userData.fullName : null,
    displayName: typeof userData.displayName === "string" ? userData.displayName : null,
    deletionRequestedAt: userData.deletionRequestedAt ?? null,
  };
  let stage = "setting processing status";

  try {
    await userRef.update({ deletionStatus: "processing", deletionError: null });

    stage = "deleting linked data";
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      const removed = await smsStoreRequest(
        `sms_accounts?owner_id=eq.${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!removed.ok) throw new Error("Backup account data could not be removed");
    }

    for (const nestedCollection of await userRef.listCollections()) {
      await db.recursiveDelete(nestedCollection);
    }
    for (const collectionName of ["deviceConfigs", "cameraDevices", "deleteRequests"]) {
      const ownerField = collectionName === "deleteRequests" ? "userId" : "ownerId";
      const linked = await db.collection(collectionName).where(ownerField, "==", userId).get();
      for (const linkedDoc of linked.docs) {
        await db.recursiveDelete(linkedDoc.ref ?? linkedDoc);
      }
    }
    await db.doc(`predictiveHealthLimits/${userId}`).delete();

    stage = "deleting Storage files";
    await getAdminStorageBucket().deleteFiles({ prefix: `users/${userId}/` });

    stage = "deleting the USER document";
    await userRef.delete();

    stage = "deleting the Firebase Auth user";
    try {
      await getAdminAuth().deleteUser(userId);
    } catch (error) {
      if (!isMissingAuthUser(error)) throw error;
    }

    stage = "writing the approval audit entry";
    // NOTE(manuscript): target identity stays in the audit log after permanent deletion.
    await writeAuditLog({
      action: "deletion_approved",
      actorUid: authorization.admin.uid,
      actorEmail: authorization.admin.email,
      targetUid: userId,
      targetEmail,
      details: { result: "permanently_deleted" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const deletionError = `Deletion failed while ${stage}. Retry the request or review the audit log.`;
    try {
      await userRef.set(
        {
          ...requestProfile,
          deletionStatus: "failed",
          deletionError,
        },
        { merge: true },
      );
    } catch (statusError) {
      console.error("[delete-user] Failed to retain failed request:", statusError);
    }
    try {
      await writeAuditLog({
        action: "deletion_failed",
        actorUid: authorization.admin.uid,
        actorEmail: authorization.admin.email,
        targetUid: userId,
        targetEmail,
        details: { stage, error: errorText(error) },
      });
    } catch (auditError) {
      console.error("[delete-user] Failed to write failure audit:", auditError);
    }
    console.error("[delete-user]", deletionError);
    return NextResponse.json(
      { error: "Account deletion failed. The request remains available for retry." },
      { status: 500 },
    );
  }
}
