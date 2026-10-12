import { NextRequest, NextResponse } from "next/server";
import {
  getAdminAuth,
  getAdminFirestore,
  getAdminStorageBucket,
} from "@/lib/configs/firebase-admin";
import { authorizeAdminRequest } from "@/lib/server/adminAuth";
import { writeAuditLog } from "@/lib/server/auditLog";
import { smsStoreRequest } from "@/lib/utils/smsAccountSync";

import { rfidPrimaryEnabled, OperationalError } from '@/lib/server/operationalStore';
import { operationalAdminTransition } from '@/lib/server/operationalAdmin';
import { deleteOwnerMedia } from '@/lib/server/operationalDeletion';

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

async function deletePrimaryUser(userId: string, admin: { uid: string; email: string | null }) {
  const actor = { userId, actorUid: admin.uid, actorEmail: admin.email };
  let started = false;
  let stage = 'claiming the deletion request';
  try {
    await operationalAdminTransition({ ...actor, action: 'start' });
    started = true;
    stage = 'revoking account sessions';
    try { await getAdminAuth().revokeRefreshTokens(userId); }
    catch (error) { if (!isMissingAuthUser(error)) throw error; }
    stage = 'deleting Supabase media';
    await deleteOwnerMedia(userId);
    stage = 'deleting legacy Firebase data';
    const db = getAdminFirestore();
    const userRef = db.doc(`users/${userId}`);
    for (const nested of await userRef.listCollections()) await db.recursiveDelete(nested);
    for (const name of ['deviceConfigs', 'cameraDevices', 'deleteRequests']) {
      const linked = await db.collection(name).where(name === 'deleteRequests' ? 'userId' : 'ownerId', '==', userId).get();
      for (const linkedDoc of linked.docs) await db.recursiveDelete(linkedDoc.ref);
    }
    await db.doc(`predictiveHealthLimits/${userId}`).delete();
    await getAdminStorageBucket().deleteFiles({ prefix: `users/${userId}/` });
    await userRef.delete();
    stage = 'deleting the Firebase Auth user';
    try { await getAdminAuth().deleteUser(userId); }
    catch (error) { if (!isMissingAuthUser(error)) throw error; }
    stage = 'finalizing deletion and audit';
    await operationalAdminTransition({ ...actor, action: 'finish' });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (!started) return NextResponse.json({ error: error instanceof OperationalError ? error.message : 'Unable to start account deletion.' }, { status: error instanceof OperationalError ? error.status : 503 });
    try { await operationalAdminTransition({ ...actor, action: 'fail', error: `Deletion failed while ${stage}. Retry the request or review the audit log.` }); }
    catch (statusError) { console.error('[delete-user] Failed to retain failed request:', statusError); }
    console.error('[delete-user] Primary deletion failed:', stage);
    return NextResponse.json({ error: 'Account deletion failed. The request remains available for retry.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authorization = await authorizeAdminRequest(req);
  if (!authorization.ok) return authorization.response;

  const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!VALID_UID.test(userId)) {
    return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  }

  if (rfidPrimaryEnabled()) return deletePrimaryUser(userId, authorization.admin);

  const db = getAdminFirestore();
  const userRef = db.doc(`users/${userId}`);
  let userData: FirebaseFirestore.DocumentData;
  try {
    userData = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists) throw Object.assign(new Error('Deletion request not found.'), { status: 404 });
      const data = snapshot.data() ?? {};
      const expired = data.deletionStatus === 'processing' && (typeof data.deletionStartedAt !== 'string' || Date.parse(data.deletionStartedAt) < Date.now() - 600000);
      if (data.deletionStatus !== 'pending' && data.deletionStatus !== 'failed' && !expired) throw Object.assign(new Error('This account has no actionable deletion request.'), { status: 409 });
      transaction.update(userRef, { deletionStatus: 'processing', deletionError: null, deletionStartedAt: new Date().toISOString() });
      return data;
    });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to claim deletion request.' }, { status });
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
