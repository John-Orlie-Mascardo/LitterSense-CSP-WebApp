import { FirebaseError } from "firebase/app";
import type { User } from "firebase/auth";

export const ADMIN_LOGIN_PATH = "/admin/littersense-1cbada72815d574ac7beddfe";

// The URL is an entry point, never an authorization credential.
export async function requireAdminLogin(
  user: Pick<User, "getIdTokenResult">,
  signOut: () => Promise<void>,
): Promise<void> {
  try {
    const token = await user.getIdTokenResult(true);
    if (token.claims.admin === true) return;
  } catch (error) {
    await signOut();
    throw error;
  }
  await signOut();
  throw new FirebaseError("auth/admin-required", "Administrator access required.");
}
