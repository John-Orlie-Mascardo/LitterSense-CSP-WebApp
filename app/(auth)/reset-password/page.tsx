"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { auth } from "@/lib/configs/firebase";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import {
  PASSWORD_POLICY_MESSAGE,
  isPasswordPolicySatisfied,
} from "@/lib/utils/passwordPolicy";
import { PasswordResetError, confirmPasswordResetToken } from "@/lib/utils/passwordReset";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // `token`: LitterSense's own 30-minute link. `oobCode`: Firebase links sent before the switch.
  const token = searchParams.get("token");
  const code = searchParams.get("oobCode");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [linkError, setLinkError] = useState("");
  const [formError, setFormError] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const passwordMeetsPolicy = isPasswordPolicySatisfied(password);

  useEffect(() => {
    let active = true;

    const checkCode = async () => {
      // A LitterSense token is checked when the new password is submitted (checking uses it up).
      if (token) {
        setIsChecking(false);
        return;
      }
      if (!code) {
        setLinkError("This password reset link is missing or invalid.");
        setIsChecking(false);
        return;
      }

      try {
        const accountEmail = await verifyPasswordResetCode(auth, code);
        if (active) setEmail(accountEmail);
      } catch {
        if (active) {
          setLinkError("This password reset link has expired or was already used.");
        }
      } finally {
        if (active) setIsChecking(false);
      }
    };

    void checkCode();
    return () => {
      active = false;
    };
  }, [code, token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving || (!code && !token)) return;

    if (!passwordMeetsPolicy) {
      setFormError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (password !== confirmation) {
      setFormError("The passwords do not match.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    if (token) {
      try {
        await confirmPasswordResetToken(token, password);
        setSaved(true);
      } catch (caughtError) {
        if (caughtError instanceof PasswordResetError && caughtError.expired) setLinkError(caughtError.message);
        else setFormError(caughtError instanceof Error ? caughtError.message : "Could not update your password. Check your connection and try again.");
      } finally {
        setIsSaving(false);
      }
      return;
    }
    if (!code) return;
    try {
      await confirmPasswordReset(auth, code, password);
      setSaved(true);
    } catch (caughtError) {
      const firebaseCode = caughtError instanceof FirebaseError ? caughtError.code : undefined;
      if (
        firebaseCode === "auth/weak-password" ||
        firebaseCode === "auth/password-does-not-meet-requirements"
      ) {
        setFormError(PASSWORD_POLICY_MESSAGE);
      } else if (
        firebaseCode === "auth/expired-action-code" ||
        firebaseCode === "auth/invalid-action-code" ||
        firebaseCode === "auth/user-disabled" ||
        firebaseCode === "auth/user-not-found"
      ) {
        setLinkError("This reset link is invalid or has expired. Request a new one.");
      } else {
        // Network or temporary errors: keep the form so the user can retry with the same link.
        setFormError("Could not update your password. Check your connection and try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dark min-h-screen bg-litter-bg flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-litter-border bg-litter-card px-6 py-8 shadow-2xl shadow-black/30">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-litter-primary-light">
          <LockKeyhole className="h-8 w-8 text-litter-primary" />
        </div>

        {saved ? (
          <div className="text-center">
            <h1 className="mb-3 text-2xl font-bold text-litter-text">Password updated</h1>
            <p className="mb-6 text-sm text-litter-muted">You can now sign in with your new password.</p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="w-full rounded-xl bg-litter-primary py-4 font-semibold text-white"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-center text-2xl font-bold text-litter-text">Create a new password</h1>
            <p className="mb-6 text-center text-sm text-litter-muted">
              {isChecking ? "Checking your reset link..." : email ? `Set a new password for ${email}.` : "Set your new password."}
            </p>

            {linkError && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-300">{linkError}</div>}

            {!isChecking && !linkError && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && <div className="rounded-xl border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-300">{formError}</div>}
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFormError("");
                  }}
                  placeholder="New password"
                  minLength={8}
                  maxLength={128}
                  required
                  className="w-full rounded-xl border border-litter-border bg-litter-input px-4 py-4 text-litter-text focus:border-litter-primary focus:outline-none"
                />
                <PasswordChecklist password={password} />
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setFormError("");
                  }}
                  placeholder="Confirm new password"
                  minLength={8}
                  maxLength={128}
                  required
                  className="w-full rounded-xl border border-litter-border bg-litter-input px-4 py-4 text-litter-text focus:border-litter-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSaving || !passwordMeetsPolicy}
                  className="w-full rounded-xl bg-litter-primary py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Updating..." : "Update Password"}
                </button>
              </form>
            )}

            {linkError && <Link href="/forgot-password" className="mt-5 block text-center text-sm text-litter-primary hover:underline">Request a new reset link</Link>}
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="dark min-h-screen bg-litter-bg" />}><ResetPasswordContent /></Suspense>;
}
