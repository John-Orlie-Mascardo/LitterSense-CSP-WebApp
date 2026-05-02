/**
 * Login Page (03.01.01)
 *
 * Split-screen on desktop (branding left, form right).
 * Teal branded header on mobile, form below.
 * Auth is email/password + Google OAuth via Firebase Auth (03.02.01).
 * Currently using mock navigation — replace handleSubmit with Firebase signIn.
 */

"use client";

import { useState, useEffect } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Activity,
  Users,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/lib/contexts/AuthContext";

const features = [
  { icon: Activity, text: "Real-time litter monitoring" },
  { icon: Users, text: "Individual cat profiles" },
  { icon: FileText, text: "Vet-ready health reports" },
];

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { user, loading: authLoading, isAdmin } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      router.push(isAdmin ? "/admin" : "/dashboard");
    }
  }, [user, authLoading, isAdmin, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push(email === "maclaurenz.cultura@gmail.com" || isAdmin ? "/admin" : "/dashboard");
    } catch (err) {
      let errorMessage = "Failed to sign in.";
      if (err instanceof FirebaseError) {
        if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
          errorMessage = "Account not registered or invalid credentials. Please sign up if you don't have an account.";
        } else if (err.code === "auth/too-many-requests") {
          errorMessage = "Access to this account has been temporarily disabled due to many failed login attempts.";
        } else if (err.code === "auth/invalid-email") {
          errorMessage = "Please enter a valid email address.";
        } else {
          errorMessage = err.message || "Failed to sign in.";
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError("");
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Ensure a document exists in Firestore for this Google user, even if they started on Login instead of Signup
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        firstName: user.displayName || "Google User",
        middleName: user.displayName || "Google User",
        lastName: user.displayName || "Google User",
        authProvider: "google",
        createdAt: serverTimestamp(),
      }, { merge: true });

      router.push(user.email === "maclaurenz.cultura@gmail.com" || isAdmin ? "/admin" : "/dashboard");
    } catch (err) {
      const message = err instanceof FirebaseError ? err.message : "Failed to sign in with Google.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Panel - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-litter-primary relative overflow-hidden">
        <div className="absolute inset-0 flex flex-col justify-center px-16 py-12 z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-litter-card/10 backdrop-blur-sm flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-8 h-8 text-white"
                fill="currentColor"
              >
                <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8ZM8.5 12C9.3 12 10 12.7 10 13.5C10 14.3 9.3 15 8.5 15C7.7 15 7 14.3 7 13.5C7 12.7 7.7 12 8.5 12ZM15.5 12C16.3 12 17 12.7 17 13.5C17 14.3 16.3 15 15.5 15C14.7 15 14 14.3 14 13.5C14 12.7 14.7 12 15.5 12ZM12 17C13.1 17 14 17.9 14 19H10C10 17.9 10.9 17 12 17Z" />
              </svg>
            </div>
            <span className="font-display font-bold text-3xl text-white">
              LitterSense
            </span>
          </div>

          {/* Tagline */}
          <p className="text-white/80 text-lg italic font-light mb-10">
            Early detection. Healthier cats.
          </p>

          {/* Feature Pills */}
          <div className="flex flex-col gap-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-center gap-3 px-5 py-3 bg-litter-card/10 backdrop-blur-sm rounded-full w-fit"
              >
                <feature.icon className="w-5 h-5 text-white/90" />
                <span className="text-white/90 font-medium">
                  {feature.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative wave shape at bottom */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg
            viewBox="0 0 1440 320"
            className="w-full h-auto"
            preserveAspectRatio="none"
          >
            <path
              fill="rgba(255,255,255,0.1)"
              d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            />
          </svg>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col lg:items-center lg:justify-center bg-litter-card">
        {/* Mobile Header - Teal branded section with gradient */}
        <div className="lg:hidden flex flex-col items-center text-center w-full px-6 pt-12 pb-8 bg-linear-to-b from-[#145C54] to-[#1B7A6E] rounded-b-4xl mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-litter-card/20 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 text-white"
                fill="currentColor"
              >
                <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8ZM8.5 12C9.3 12 10 12.7 10 13.5C10 14.3 9.3 15 8.5 15C7.7 15 7 14.3 7 13.5C7 12.7 7.7 12 8.5 12ZM15.5 12C16.3 12 17 12.7 17 13.5C17 14.3 16.3 15 15.5 15C14.7 15 14 14.3 14 13.5C14 12.7 14.7 12 15.5 12ZM12 17C13.1 17 14 17.9 14 19H10C10 17.9 10.9 17 12 17Z" />
              </svg>
            </div>
            <span className="font-display font-bold text-lg text-white">LitterSense</span>
          </div>
          <h2 className="font-display font-bold text-2xl text-white mt-1">
            Early detection. Healthier cats.
          </h2>
        </div>

        <div className="w-full max-w-md px-6 pb-12 lg:py-12">
          {/* Welcome Text */}
          <div className="mb-8">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-litter-text mb-2">
              Welcome back
            </h1>
            <p className="text-[#6B7280]">
              Monitor your cat's health from anywhere.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
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
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full pl-12 pr-4 py-3.5 bg-litter-card border border-litter-border rounded-xl text-litter-text placeholder-[#6B7280]/60 transition-all duration-200 focus:border-litter-primary focus:ring-4 focus:ring-[#1B7A6E]/10 hover:border-litter-primary/40"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-litter-text mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-12 pr-12 py-3.5 bg-litter-card border border-litter-border rounded-xl text-litter-text placeholder-[#6B7280]/60 transition-all duration-200 focus:border-litter-primary focus:ring-4 focus:ring-[#1B7A6E]/10 hover:border-litter-primary/40"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-litter-text transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot Password */}
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-litter-primary hover:text-[#145C54] transition-colors"
              >
                Forgot password?
              </Link>
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
                  <span>Signing in...</span>
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-[#D1D5DB]" />
            <span className="text-sm text-[#6B7280]">or continue with</span>
            <div className="flex-1 h-px bg-[#D1D5DB]" />
          </div>

          {/* Google Sign In */}
          <button 
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-3.5 px-4 bg-litter-card border-2 border-litter-border rounded-xl font-medium text-litter-text hover:border-litter-primary/40 hover:bg-[#F9FAFB] transition-all duration-200 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-[#6B7280] mt-6">
            Don't have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-litter-primary hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
