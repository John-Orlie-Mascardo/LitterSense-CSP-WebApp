"use client";

import { usePWAInstallContext } from "@/lib/contexts/PWAInstallContext";

export function usePWAInstall() {
  return usePWAInstallContext();
}
