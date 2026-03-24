/**
 * Forgot Password — Step 2 (03.01.03)
 *
 * Confirmation screen after reset link is sent.
 * Displays the user's email (from URL query param) and offers resend option.
 * Currently mocks the resend — replace with Firebase sendPasswordResetEmail.
 */

"use client";

import { useState } from "react";
import { ArrowLeft, MailCheck, LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function CheckEmailPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "your email";
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    setIsResending(true);
    // Mock delay — replace with Firebase Auth sendPasswordResetEmail later
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsResending(false);
    setResent(true);
  };

  return (
    <div className="min-h-screen bg-litter-card flex flex-col px-6 py-8">
      {/* Back arrow */}
      <Link
        href="/forgot-password"
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] transition-colors self-start"
      >
        <ArrowLeft className="w-5 h-5 text-litter-text" />
      </Link>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
        {/* Email icon */}
        <div className="w-20 h-20 rounded-full bg-litter-primary-light flex items-center justify-center mb-8">
          <MailCheck className="w-10 h-10 text-litter-primary" />
        </div>

        {/* Decorative teal banner */}
        <div className="w-full h-24 bg-gradient-to-r from-[#145C54] to-[#1B7A6E] rounded-2xl mb-8 relative overflow-hidden">
          {/* Lock decoration */}
          <div className="absolute left-6 top-1/2 -translate-y-1/2 opacity-30">
            <svg
              viewBox="0 0 24 24"
              className="w-16 h-16 text-white"
              fill="currentColor"
            >
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <h1 className="font-bold text-2xl text-litter-text mb-3 text-center">
          Check Your Email
        </h1>

        {/* Description */}
        <p className="text-[#6B7280] text-sm text-center leading-relaxed mb-8">
          We&apos;ve sent a password reset link to{" "}
          <span className="font-semibold text-litter-text">{email}</span>. It may
          take a few minutes.
        </p>

        {/* Open Email App Button */}
        <a
          href="mailto:"
          className="w-full py-4 bg-litter-primary text-white font-semibold rounded-xl shadow-lg shadow-[#1B7A6E]/25 hover:shadow-xl hover:shadow-[#1B7A6E]/30 transition-all duration-200 flex items-center justify-center gap-2"
        >
          Open Email App
        </a>

        {/* Resend */}
        <div className="text-center mt-6">
          {resent ? (
            <p className="text-sm text-[#22C55E] font-medium">
              Reset link resent successfully!
            </p>
          ) : (
            <p className="text-sm text-[#6B7280]">
              Didn&apos;t receive it?{" "}
              <button
                onClick={handleResend}
                disabled={isResending}
                className="font-semibold text-litter-primary hover:underline disabled:opacity-70"
              >
                {isResending ? "Resending..." : "Resend"}
              </button>
            </p>
          )}
        </div>

        {/* Back to Sign In */}
        <div className="text-center mt-4">
          <Link
            href="/login"
            className="text-sm text-[#6B7280] hover:text-litter-primary transition-colors inline-flex items-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" />
            Back to Sign In
          </Link>
        </div>
      </div>

      {/* Bottom LitterSense branding */}
      <div className="flex items-center justify-center gap-2 mt-8 pb-4">
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5 text-litter-primary"
          fill="currentColor"
        >
          <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8ZM8.5 12C9.3 12 10 12.7 10 13.5C10 14.3 9.3 15 8.5 15C7.7 15 7 14.3 7 13.5C7 12.7 7.7 12 8.5 12ZM15.5 12C16.3 12 17 12.7 17 13.5C17 14.3 16.3 15 15.5 15C14.7 15 14 14.3 14 13.5C14 12.7 14.7 12 15.5 12ZM12 17C13.1 17 14 17.9 14 19H10C10 17.9 10.9 17 12 17Z" />
        </svg>
        <span className="text-xs font-semibold text-[#6B7280] tracking-wider uppercase">
          LitterSense
        </span>
      </div>
    </div>
  );
}
