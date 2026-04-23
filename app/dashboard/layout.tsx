import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RfidVisitBridge } from "@/components/dashboard/RfidVisitBridge";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <RfidVisitBridge />
      {children}
    </ProtectedRoute>
  );
}
