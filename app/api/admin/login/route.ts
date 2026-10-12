import { authorizeAdminRequest } from "@/lib/server/adminAuth";
import { writeAuditLog } from "@/lib/server/auditLog";

type SignInMethod = "password" | "google";

function isSignInMethod(value: unknown): value is SignInMethod {
  return value === "password" || value === "google";
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return authorization.response;

  const body = await request.json().catch(() => null) as { method?: unknown } | null;
  if (!body || !isSignInMethod(body.method)) {
    return Response.json({ error: "Invalid sign-in method." }, { status: 400 });
  }

  const { admin } = authorization;
  await writeAuditLog({
    action: "admin_login",
    actorUid: admin.uid,
    actorEmail: admin.email,
    targetUid: admin.uid,
    targetEmail: admin.email,
    details: { signInMethod: body.method },
  });

  return Response.json({ success: true });
}
