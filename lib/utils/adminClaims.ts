import type { User } from "firebase/auth";

type ClaimUser = Pick<User, "getIdTokenResult">;

export async function resolveAdminClaim(
  user: ClaimUser,
  forceRefresh = false,
): Promise<boolean> {
  const tokenResult = await user.getIdTokenResult(forceRefresh);
  return tokenResult.claims.admin === true;
}
