/**
 * Forgot Password — Step 1 (03.01.03)
 *
 * User enters email to request a password reset link.
 * Currently mocks the request — replace with Firebase sendPasswordResetEmail.
 * On submit, navigates to check-email page with email as query param.
 */

"use client";

import { useState, useEffect } from "react";
import { Mail, ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/lib/contexts/AuthContext";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/dashboard");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    
    try {
      await sendPasswordResetEmail(auth, email);
      router.push(
        `/forgot-password/check-email?email=${encodeURIComponent(email)}`,
      );
    } catch (err) {
      const message = err instanceof FirebaseError ? err.message : "Failed to send reset email.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#E8F5F1] to-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-litter-card rounded-2xl shadow-sm border border-litter-border/50 px-6 py-8">
          {/* Back arrow + Title */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/login"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-litter-text" />
            </Link>
            <h2 className="font-bold text-lg text-litter-text">
              Forgot Password
            </h2>
          </div>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-litter-primary-light flex items-center justify-center">
              <KeyRound className="w-8 h-8 text-litter-primary" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-6">
            <h1 className="font-bold text-2xl text-litter-text mb-2">
              Reset Password
            </h1>
            <p className="text-[#6B7280] text-sm leading-relaxed">
              Enter the email associated with your account and we&apos;ll send
              you a reset link.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl">
                {error}
              </div>
            )}
            
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-litter-text mb-2"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-litter-card border border-litter-border rounded-xl text-litter-text placeholder-[#6B7280]/60 transition-all duration-200 focus:border-litter-primary focus:ring-4 focus:ring-[#1B7A6E]/10 hover:border-litter-primary/40"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-litter-primary text-white font-semibold rounded-xl shadow-lg shadow-[#1B7A6E]/25 hover:shadow-xl hover:shadow-[#1B7A6E]/30 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Sending...</span>
                </>
              ) : (
                "Send Reset Link"
              )}
            </button>
          </form>

          {/* Back to Sign In */}
          <div className="text-center mt-6">
            <Link
              href="/login"
              className="text-sm text-[#6B7280] hover:text-litter-primary transition-colors inline-flex items-center gap-1"
            >
              <span>‹</span> Back to Sign In
            </Link>
          </div>
        </div>

        {/* Bottom teal accent line */}
        <div className="mt-6 mx-auto w-3/4 h-1 bg-litter-primary rounded-full" />
      </div>
    </div>
  );
}
