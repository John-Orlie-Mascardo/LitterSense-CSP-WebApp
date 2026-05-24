import type { Metadata } from "next";
import { AdminRoute } from "@/components/AdminRoute";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminProvider } from "@/lib/contexts/AdminContext";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Admin · LitterSense",
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminRoute>
      <AdminProvider>
        <div className="flex flex-col lg:flex-row min-h-screen bg-litter-bg">
          <AdminSidebar />
          <div className="flex-1 min-w-0 flex flex-col">
            {children}
          </div>
        </div>
      </AdminProvider>
    </AdminRoute>
  );
}

