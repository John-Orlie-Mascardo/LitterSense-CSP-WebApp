import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { CatProvider } from "@/lib/contexts/CatContext";
import { NotificationProvider } from "@/lib/contexts/NotificationContext";
import { DeleteRequestProvider } from "@/lib/contexts/DeleteRequestContext";
import { PWAInstallProvider } from "@/lib/contexts/PWAInstallContext";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Login | LitterSense",
    template: "%s | LitterSense",
  },
  description: "IoT-enabled feline health monitoring for Filipino cat owners. Early detection, healthier cats.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.svg",
    apple: "/icons/icon-192x192.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1E6B5E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className="font-body antialiased bg-litter-bg text-litter-text transition-colors duration-300"
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            <DeleteRequestProvider>
              <CatProvider>
                <NotificationProvider>
                  <PWAInstallProvider>
                    {children}
                  </PWAInstallProvider>
                </NotificationProvider>
              </CatProvider>
            </DeleteRequestProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
