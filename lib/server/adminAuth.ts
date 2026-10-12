import { getAdminAuth } from "@/lib/configs/firebase-admin";

export interface AdminIdentity {
  uid: string;
  email: string | null;
}

export type AdminAuthorizationResult =
  | { ok: true; admin: AdminIdentity }
  | { ok: false; response: Response };

const errorResponse = (status: 401 | 403, error: string) =>
  Response.json({ error }, { status });

export async function authorizeAdminRequest(
  request: Request,
): Promise<AdminAuthorizationResult> {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    return { ok: false, response: errorResponse(401, "Unauthorized.") };
  }

  let decodedToken;
  try {
    decodedToken = await getAdminAuth().verifyIdToken(match[1], true);
  } catch {
    return { ok: false, response: errorResponse(401, "Unauthorized.") };
  }

  if (decodedToken.admin !== true) {
    return { ok: false, response: errorResponse(403, "Forbidden.") };
  }

  return {
    ok: true,
    admin: {
      uid: decodedToken.uid,
      email: decodedToken.email ?? null,
    },
  };
}
