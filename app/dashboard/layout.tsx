import type { Metadata } from "next";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RfidVisitBridge } from "@/components/dashboard/RfidVisitBridge";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { DeviceSensorsProvider } from "@/lib/hooks/useDeviceSensors";

export const metadata: Metadata = {
  title: {
    default: "Home",
    template: "%s | LitterSense",
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <OnboardingGate>
        <DeviceSensorsProvider>
          <RfidVisitBridge />
          {children}
        </DeviceSensorsProvider>
      </OnboardingGate>
    </ProtectedRoute>
  );
}
