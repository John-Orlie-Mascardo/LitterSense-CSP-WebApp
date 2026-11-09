/**
 * Permanent account deletion for the Supabase primary store, shared by admin approval
 * (/api/admin/delete-user) and owner self-delete (/api/account/delete).
 *
 * The profile must already hold a deletion request: `start` claims it, then sessions,
 * media, legacy Firebase data and the Auth user are removed, and `finish` writes the
 * final audit. A failure after `start` marks the request failed so it can be retried.
 */
import {
  getAdminAuth,
  getAdminFirestore,
  getAdminStorageBucket,
} from "@/lib/configs/firebase-admin";
import { OperationalError } from "@/lib/server/operationalStore";
import { operationalAdminTransition } from "@/lib/server/operationalAdmin";
import { deleteOwnerMedia } from "@/lib/server/operationalDeletion";

function isMissingAuthUser(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "auth/user-not-found"
  );
}

function isMissingBucket(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && Number(error.code) === 404;
}

export async function deletePrimaryAccount(
  userId: string,
  actorIdentity: { uid: string; email: string | null },
): Promise<Response> {
  const actor = { userId, actorUid: actorIdentity.uid, actorEmail: actorIdentity.email };
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
    try { await getAdminStorageBucket().deleteFiles({ prefix: `users/${userId}/` }); }
    // No Firebase Storage bucket (photos live in Supabase now) means there are no files to remove.
    catch (error) { if (!isMissingBucket(error)) throw error; }
    await userRef.delete();
    stage = 'deleting the Firebase Auth user';
    try { await getAdminAuth().deleteUser(userId); }
    catch (error) { if (!isMissingAuthUser(error)) throw error; }
    stage = 'finalizing deletion and audit';
    await operationalAdminTransition({ ...actor, action: 'finish' });
    return Response.json({ success: true });
  } catch (error) {
    if (!started) return Response.json({ error: error instanceof OperationalError ? error.message : 'Unable to start account deletion.' }, { status: error instanceof OperationalError ? error.status : 503 });
    try { await operationalAdminTransition({ ...actor, action: 'fail', error: `Deletion failed while ${stage}. Retry the request or review the audit log.` }); }
    catch (statusError) { console.error('[delete-account] Failed to retain failed request:', statusError); }
    console.error('[delete-account] Primary deletion failed:', stage, error instanceof Error ? error.message.slice(0, 300) : error);
    return Response.json({ error: 'Account deletion failed. The request remains available for retry.' }, { status: 500 });
  }
}
