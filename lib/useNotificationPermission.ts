"use client";

import { useState, useEffect, useCallback } from "react";

type PermissionStatus = "idle" | "granted" | "denied" | "dismissed";

const STORAGE_KEY = "littersense_notif_permission";
const DISMISSED_KEY = "littersense_notif_dismissed_at";
const REPROMPT_DELAY_MS = 24 * 60 * 60 * 1000; // re-prompt after 24 hours if dismissed

export function useNotificationPermission() {
  const [status, setStatus] = useState<PermissionStatus>("idle");
  const [showBanner, setShowBanner] = useState(false);

  // On mount — check stored state and browser permission
  useEffect(() => {
    if (typeof window === "undefined") return;

    // If browser doesn't support notifications at all, bail silently
    if (!("Notification" in window)) return;

    const stored = localStorage.getItem(STORAGE_KEY) as PermissionStatus | null;
    const browserPerm = Notification.permission;

    // Browser already granted — register SW, no banner needed
    if (browserPerm === "granted") {
      setStatus("granted");
      registerServiceWorker();
      return;
    }

    // Browser hard-denied — nothing we can do, show settings hint handled elsewhere
    if (browserPerm === "denied") {
      setStatus("denied");
      return;
    }

    // If user previously dismissed — only re-prompt after delay
    if (stored === "dismissed") {
      const dismissedAt = localStorage.getItem(DISMISSED_KEY);
      if (dismissedAt) {
        const elapsed = Date.now() - parseInt(dismissedAt, 10);
        if (elapsed < REPROMPT_DELAY_MS) return; // too soon, don't show
      }
    }

    // If not yet decided — show the banner
    if (!stored || stored === "dismissed") {
      setShowBanner(true);
    }
  }, []);

  // Trigger banner on anomaly event (call this from anywhere in the app)
  const triggerOnAnomaly = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") return;

    const stored = localStorage.getItem(STORAGE_KEY) as PermissionStatus | null;
    if (stored === "dismissed") {
      const dismissedAt = localStorage.getItem(DISMISSED_KEY);
      if (dismissedAt) {
        const elapsed = Date.now() - parseInt(dismissedAt, 10);
        if (elapsed < REPROMPT_DELAY_MS) return;
      }
    }
    setShowBanner(true);
  }, []);

  // User clicks "Enable Notifications"
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;

    const result = await Notification.requestPermission();

    if (result === "granted") {
      setStatus("granted");
      setShowBanner(false);
      localStorage.setItem(STORAGE_KEY, "granted");
      localStorage.removeItem(DISMISSED_KEY);
      registerServiceWorker();
    } else if (result === "denied") {
      setStatus("denied");
      setShowBanner(false);
      localStorage.setItem(STORAGE_KEY, "denied");
    }
  }, []);

  // User clicks "Maybe Later" (dismissed)
  const dismissBanner = useCallback(() => {
    setStatus("dismissed");
    setShowBanner(false);
    localStorage.setItem(STORAGE_KEY, "dismissed");
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  }, []);

  return {
    status,
    showBanner,
    requestPermission,
    dismissBanner,
    triggerOnAnomaly,
  };
}

// ─── Service Worker Registration ──────────────────────────────────────────────

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
    console.log("[LitterSense] Service worker registered for push notifications.");
  } catch (err) {
    console.error("[LitterSense] Service worker registration failed:", err);
  }
}