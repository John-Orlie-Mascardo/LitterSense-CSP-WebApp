"use client";

import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useAuth } from "@/lib/contexts/AuthContext";
import { shouldShowDashboardOnboarding } from "@/lib/utils/onboardingState";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, onboardingComplete, profileLoading } = useAuth();

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-litter-bg">
        <svg className="animate-spin h-8 w-8 text-litter-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (shouldShowDashboardOnboarding({ onboardingComplete, isAdmin })) {
    return <OnboardingFlow />;
  }

  return <>{children}</>;
}
