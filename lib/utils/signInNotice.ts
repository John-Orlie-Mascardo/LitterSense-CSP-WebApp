import type { User } from "firebase/auth";

type TokenUser = Pick<User, "getIdToken">;

/** Fire-and-forget request for the "new sign-in" email; never blocks or fails sign-in. */
export function requestSignInNotice(user: TokenUser, fetcher: typeof fetch = fetch): Promise<void> {
  return user.getIdToken()
    .then((idToken) => fetcher("/api/auth/sign-in-notice", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      keepalive: true,
    }))
    .then(() => undefined, () => undefined);
}
