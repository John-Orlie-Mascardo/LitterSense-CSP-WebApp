/**
 * loginFeedback.ts
 *
 * Converts Firebase sign-in failures into plain, privacy-safe owner messages.
 *
 * DONE: email/password and Google sign-in error mappings
 * PLACEHOLDER: none
 *
 * NEXT: authentication owners should add new Firebase codes here, not expose raw errors.
 */

const NETWORK_ERROR_MESSAGE =
  "We couldn’t reach LitterSense. Check your connection and try again.";

export function getEmailLoginErrorMessage(code?: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-email":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return NETWORK_ERROR_MESSAGE;
    default:
      return "We couldn’t sign you in. Please try again.";
  }
}

export function getGoogleLoginErrorMessage(code?: string): string {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Google sign-in was canceled.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow pop-ups and try again.";
    case "auth/network-request-failed":
      return NETWORK_ERROR_MESSAGE;
    default:
      return "We couldn’t sign you in with Google. Please try again.";
  }
}
