/**
 * POST /api/admin/delete-user
 *
 * Permanently deletes a Firebase Auth user and their Firestore data,
 * then marks the deleteRequest document as "deleted".
 *
 * Caller must be an admin (verified via Firebase ID token).
 *
 * Body: { idToken: string; userId: string; requestId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { getApps } from "firebase-admin/app";

const MASTER_ADMIN_EMAIL = "maclaurenz.cultura@gmail.com";

async function isAdminEmail(email: string): Promise<boolean> {
  if (email === MASTER_ADMIN_EMAIL) return true;
  try {
    const db = getFirestore(getApps()[0]);
    const snap = await db.collection("admins").doc(email).get();
    return snap.exists;
  } catch {
    return false;
  }
}

/** Recursively deletes all documents in a Firestore collection reference. */
async function deleteCollection(
  db: FirebaseFirestore.Firestore,
  collectionPath: string,
  batchSize = 100,
) {
  const colRef = db.collection(collectionPath);
  const query = colRef.limit(batchSize);

  let snapshot = await query.get();
  while (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    snapshot = await query.get();
  }
}

export async function POST(req: NextRequest) {
  try {
    const { idToken, userId, requestId } = (await req.json()) as {
      idToken?: string;
      userId?: string;
      requestId?: string;
    };

    if (!idToken || !userId || !requestId) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 },
      );
    }

    const adminAuth = getAdminAuth();

    // 1. Verify the caller's ID token
    let callerEmail: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      callerEmail = decoded.email ?? "";
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: invalid token." },
        { status: 401 },
      );
    }

    // 2. Confirm the caller is an admin
    const callerIsAdmin = await isAdminEmail(callerEmail);
    if (!callerIsAdmin) {
      return NextResponse.json(
        { error: "Forbidden: caller is not an admin." },
        { status: 403 },
      );
    }

    const db = getFirestore(getApps()[0]);

    // 3. Delete Firestore sub-collections first (cats, catDetails)
    await deleteCollection(db, `users/${userId}/cats`);
    await deleteCollection(db, `users/${userId}/catDetails`);

    // 4. Delete the root user document
    await db.collection("users").doc(userId).delete();

    // 5. Delete the Firebase Auth account
    try {
      await adminAuth.deleteUser(userId);
    } catch (authErr: unknown) {
      // If the auth user was already removed, treat it as a no-op
      const code =
        typeof authErr === "object" &&
        authErr !== null &&
        "code" in authErr &&
        typeof (authErr as { code?: unknown }).code === "string"
          ? (authErr as { code: string }).code
          : "";
      if (code !== "auth/user-not-found") {
        throw authErr;
      }
    }

    // 6. Mark the deleteRequest as "deleted"
    await db.collection("deleteRequests").doc(requestId).update({
      status: "deleted",
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[delete-user]", err);
    const message =
      err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
