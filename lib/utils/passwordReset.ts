import type { ActionCodeSettings } from "firebase/auth";

export function getPasswordResetActionCodeSettings(): ActionCodeSettings {
  return {
    url: `${window.location.origin}/reset-password`,
    handleCodeInApp: true,
  };
}
