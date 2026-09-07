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

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("oobCode");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;

    const checkCode = async () => {
      if (!code) {
        setError("This password reset link is missing or invalid.");
        setIsChecking(false);
        return;
      }

      try {
        const accountEmail = await verifyPasswordResetCode(auth, code);
        if (active) setEmail(accountEmail);
      } catch {
        if (active) {
          setError("This password reset link has expired or was already used.");
        }
      } finally {
        if (active) setIsChecking(false);
      }
    };

    void checkCode();
    return () => {
      active = false;
    };
  }, [code]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving || !code) return;

    if (password.length < 6) {
      setError("Your password must be at least 6 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await confirmPasswordReset(auth, code, password);
      setSaved(true);
    } catch (caughtError) {
      const firebaseCode = caughtError instanceof FirebaseError ? caughtError.code : undefined;
      setError(
        firebaseCode === "auth/weak-password"
          ? "Choose a stronger password."
          : "This reset link is invalid or has expired. Request a new one.",
      );
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

            {error && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}

            {!isChecking && !error && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="New password"
                  minLength={6}
                  required
                  className="w-full rounded-xl border border-litter-border bg-litter-input px-4 py-3.5 text-litter-text focus:border-litter-primary focus:outline-none"
                />
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="Confirm new password"
                  minLength={6}
                  required
                  className="w-full rounded-xl border border-litter-border bg-litter-input px-4 py-3.5 text-litter-text focus:border-litter-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full rounded-xl bg-litter-primary py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Updating..." : "Update Password"}
                </button>
              </form>
            )}

            {error && <Link href="/forgot-password" className="mt-5 block text-center text-sm text-litter-primary hover:underline">Request a new reset link</Link>}
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="dark min-h-screen bg-litter-bg" />}><ResetPasswordContent /></Suspense>;
}
