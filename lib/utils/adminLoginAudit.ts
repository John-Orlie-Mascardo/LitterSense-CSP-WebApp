import type { User } from "firebase/auth";
import { adminApiFetch } from "@/lib/utils/adminApi";

export type AdminSignInMethod = "password" | "google";
type AuditRequest = typeof adminApiFetch;

export async function recordAdminLogin(
  user: Pick<User, "getIdTokenResult">,
  method: AdminSignInMethod,
  request: AuditRequest = adminApiFetch,
): Promise<boolean> {
  const tokenResult = await user.getIdTokenResult();
  if (tokenResult.claims.admin !== true) return false;

  const response = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method }),
  });
  if (!response.ok) {
    throw new Error("Unable to record administrator sign-in.");
  }

  return true;
}
