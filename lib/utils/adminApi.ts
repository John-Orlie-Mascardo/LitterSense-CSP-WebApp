import type { User } from "firebase/auth";
import { auth } from "@/lib/configs/firebase";

type TokenUser = Pick<User, "getIdToken">;

interface AdminRequestDependencies {
  fetcher: typeof fetch;
  leaveAdmin: (destination: string) => void;
}

export async function runAdminRequest(
  user: TokenUser,
  input: RequestInfo | URL,
  init: RequestInit = {},
  dependencies: AdminRequestDependencies,
): Promise<Response> {
  const idToken = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${idToken}`);

  const response = await dependencies.fetcher(input, { ...init, headers });
  if (response.status === 401 || response.status === 403) {
    try {
      await user.getIdToken(true);
    } catch {
      // Revoked sessions can reject refresh; the route exit must still happen.
    } finally {
      dependencies.leaveAdmin("/dashboard");
    }
  }

  return response;
}

export async function adminApiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    window.location.replace("/login");
    throw new Error("Not signed in.");
  }

  return runAdminRequest(currentUser, input, init, {
    fetcher: fetch,
    leaveAdmin: (destination) => window.location.replace(destination),
  });
}
