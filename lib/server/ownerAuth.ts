import { getAdminAuth } from "@/lib/configs/firebase-admin";

export interface OwnerIdentity {
  uid: string;
  email: string | null;
}

export type OwnerAuthorizationResult =
  | { ok: true; owner: OwnerIdentity }
  | { ok: false; response: Response };

export async function authorizeOwnerRequest(
  request: Request,
): Promise<OwnerAuthorizationResult> {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(match[1], true);
    return {
      ok: true,
      owner: {
        uid: decodedToken.uid,
        email: decodedToken.email ?? null,
      },
    };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }
}
