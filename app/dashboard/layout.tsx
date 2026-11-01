import type { Metadata } from "next";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RfidVisitBridge } from "@/components/dashboard/RfidVisitBridge";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { DeviceSensorsProvider } from "@/lib/hooks/useDeviceSensors";
import { SmsAccountSync } from "@/components/dashboard/SmsAccountSync";
import { PushNotifications } from "@/components/dashboard/PushNotifications";
import { AppTour } from "@/components/tour/AppTour";
import { TourProvider } from "@/components/tour/TourProvider";

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
        <TourProvider>
          <DeviceSensorsProvider>
            <RfidVisitBridge />
            <SmsAccountSync />
            <PushNotifications />
            {children}
          </DeviceSensorsProvider>
          <AppTour />
        </TourProvider>
      </OnboardingGate>
    </ProtectedRoute>
  );
}
