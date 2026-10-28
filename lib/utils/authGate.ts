/**
 * authGate.ts
 *
 * Decides when the login page must hide its form while Firebase restores a session.
 *
 * DONE: restore-in-progress and already-signed-in gating
 * PLACEHOLDER: none
 */

export interface AuthGateState {
  authLoading: boolean;
  hasUser: boolean;
  isSigningIn: boolean;
  authSucceeded: boolean;
}

/** True while a returning user's session is restoring or redirecting, so the login form never flashes. */
export function shouldShowAuthRestore({ authLoading, hasUser, isSigningIn, authSucceeded }: AuthGateState): boolean {
  // An active form submit keeps its own inline progress and success toast.
  if (isSigningIn || authSucceeded) return false;
  return authLoading || hasUser;
}
