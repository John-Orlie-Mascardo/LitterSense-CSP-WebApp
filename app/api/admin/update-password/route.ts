/**
 * POST /api/admin/update-password
 *
 * Updates any Firebase Auth user's password.
 * Caller must supply a valid Firebase ID token belonging to an admin.
 *
 * Body: { idToken: string; targetEmail: string; newPassword: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { getApps } from "firebase-admin/app";

const MASTER_ADMIN_EMAIL = "maclaurenz.cultura@gmail.com";

async function isAdminEmail(email: string): Promise<boolean> {
  if (email === MASTER_ADMIN_EMAIL) return true;
  try {
    // Check the admins collection
    const { getFirestore: _gfs, ..._ } = await import("firebase-admin/firestore");
    void _;
    const db = getFirestore(getApps()[0]);
    const snap = await db.collection("admins").doc(email).get();
    return snap.exists;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { idToken, targetEmail, newPassword } = await req.json() as {
      idToken?: string;
      targetEmail?: string;
      newPassword?: string;
    };

    if (!idToken || !targetEmail || !newPassword) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const adminAuth = getAdminAuth();

    // 1. Verify the caller's ID token
    let callerEmail: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      callerEmail = decoded.email ?? "";
    } catch {
      return NextResponse.json({ error: "Unauthorized: invalid token." }, { status: 401 });
    }

    // 2. Confirm the caller is an admin
    const callerIsAdmin = await isAdminEmail(callerEmail);
    if (!callerIsAdmin) {
      return NextResponse.json({ error: "Forbidden: caller is not an admin." }, { status: 403 });
    }

    // 3. Look up the target user by email
    let targetUid: string;
    try {
      const targetUser = await adminAuth.getUserByEmail(targetEmail);
      targetUid = targetUser.uid;
    } catch {
      return NextResponse.json({ error: `No account found for ${targetEmail}.` }, { status: 404 });
    }

    // 4. Update the password
    await adminAuth.updateUser(targetUid, { password: newPassword });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[update-password]", err);
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
