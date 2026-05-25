"use client";

import { useState, useEffect, useCallback } from "react";

type PermissionStatus = "idle" | "granted" | "denied" | "dismissed";

interface PermissionState {
  status: PermissionStatus;
  showBanner: boolean;
  shouldRegisterServiceWorker: boolean;
}

const STORAGE_KEY = "littersense_notif_permission";
const DISMISSED_KEY = "littersense_notif_dismissed_at";
const REPROMPT_DELAY_MS = 24 * 60 * 60 * 1000;

function getInitialPermissionState(): PermissionState {
  if (globalThis.window === undefined || !("Notification" in globalThis.window)) {
    return {
      status: "idle",
      showBanner: false,
      shouldRegisterServiceWorker: false,
    };
  }

  const stored = localStorage.getItem(STORAGE_KEY) as PermissionStatus | null;
  const browserPerm = Notification.permission;

  if (browserPerm === "granted") {
    return {
      status: "granted",
      showBanner: false,
      shouldRegisterServiceWorker: true,
    };
  }

  if (browserPerm === "denied") {
    return {
      status: "denied",
      showBanner: false,
      shouldRegisterServiceWorker: false,
    };
  }

  if (stored === "dismissed") {
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - Number.parseInt(dismissedAt, 10);
      if (elapsed < REPROMPT_DELAY_MS) {
        return {
          status: "idle",
          showBanner: false,
          shouldRegisterServiceWorker: false,
        };
      }
    }
  }

  return {
    status: "idle",
    showBanner: !stored || stored === "dismissed",
    shouldRegisterServiceWorker: false,
  };
}

export function useNotificationPermission() {
  const [permissionState, setPermissionState] = useState(getInitialPermissionState);
  const { status, showBanner, shouldRegisterServiceWorker } = permissionState;

  useEffect(() => {
    if (shouldRegisterServiceWorker) {
      void registerServiceWorker();
    }
  }, [shouldRegisterServiceWorker]);

  const triggerOnAnomaly = useCallback(() => {
    if (globalThis.window === undefined) return;
    if (!("Notification" in globalThis.window)) return;
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") return;

    const stored = localStorage.getItem(STORAGE_KEY) as PermissionStatus | null;
    if (stored === "dismissed") {
      const dismissedAt = localStorage.getItem(DISMISSED_KEY);
      if (dismissedAt) {
        const elapsed = Date.now() - Number.parseInt(dismissedAt, 10);
        if (elapsed < REPROMPT_DELAY_MS) return;
      }
    }

    setPermissionState((current) => ({
      ...current,
      showBanner: true,
    }));
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in globalThis.window)) return;

    const result = await Notification.requestPermission();

    if (result === "granted") {
      setPermissionState({
        status: "granted",
        showBanner: false,
        shouldRegisterServiceWorker: true,
      });
      localStorage.setItem(STORAGE_KEY, "granted");
      localStorage.removeItem(DISMISSED_KEY);
      await registerServiceWorker();
    } else if (result === "denied") {
      setPermissionState({
        status: "denied",
        showBanner: false,
        shouldRegisterServiceWorker: false,
      });
      localStorage.setItem(STORAGE_KEY, "denied");
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setPermissionState({
      status: "dismissed",
      showBanner: false,
      shouldRegisterServiceWorker: false,
    });
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

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
    console.log("[LitterSense] Service worker registered for push notifications.");
  } catch (err) {
    console.error("[LitterSense] Service worker registration failed:", err);
  }
}
