/**
 * POST /api/admin/update-password
 *
 * Updates any Firebase Auth user's password.
 * Caller must supply a valid Firebase bearer token belonging to an admin.
 *
 * Body: { targetEmail: string; newPassword: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { authorizeAdminRequest } from "@/lib/server/adminAuth";

export async function POST(req: NextRequest) {
  try {
    const authorization = await authorizeAdminRequest(req);
    if (!authorization.ok) return authorization.response;

    const { targetEmail, newPassword } = await req.json() as {
      targetEmail?: string;
      newPassword?: string;
    };

    if (!targetEmail || !newPassword) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    // 1. Look up the target user by email
    let targetUid: string;
    try {
      const targetUser = await adminAuth.getUserByEmail(targetEmail);
      targetUid = targetUser.uid;
    } catch {
      return NextResponse.json({ error: `No account found for ${targetEmail}.` }, { status: 404 });
    }

    // 2. Update the password
    await adminAuth.updateUser(targetUid, { password: newPassword });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[update-password]", err);
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
