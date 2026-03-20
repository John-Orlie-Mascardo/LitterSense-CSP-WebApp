"use client";

import { useState, useEffect, useCallback } from "react";

export interface PerCatNotificationPref {
  catId: string;
  catName: string;
  healthAlerts: boolean;
  visitAlerts: boolean;
}

export interface UserSettings {
  notifications: {
    healthAlerts: boolean;
    litterLevelWarnings: boolean;
    dailySummary: boolean;
    alertSensitivity: "low" | "medium" | "high";
    quietHours: {
      enabled: boolean;
      from: string; // "HH:MM" 24h format e.g. "22:00"
      to: string;   // "HH:MM" 24h format e.g. "07:00"
    };
    perCat: PerCatNotificationPref[];
  };
  device: {
    deviceName: string;
    lastSynced: string;
    wifiNetwork: string;
    edgeProcessingMode: boolean;
    syncInterval: "30s" | "1m" | "5m";
    firmwareVersion: string;
  };
  dataPrivacy: {
    dataRetention: "3m" | "6m" | "1y" | "forever";
  };
  appearance: {
    theme: "light" | "dark" | "system";
    language: "en" | "fil";
  };
  account: {
    displayName: string;
    email: string;
    linkedAccounts: { provider: string; connected: boolean }[];
  };
}

const defaultSettings: UserSettings = {
  notifications: {
    healthAlerts: true,
    litterLevelWarnings: true,
    dailySummary: false,
    alertSensitivity: "medium",
    quietHours: {
      enabled: false,
      from: "22:00",
      to: "07:00",
    },
    perCat: [
      { catId: "cat_1", catName: "Mochi", healthAlerts: true, visitAlerts: true },
      { catId: "cat_2", catName: "Luna", healthAlerts: true, visitAlerts: false },
      { catId: "cat_3", catName: "Nala", healthAlerts: true, visitAlerts: true },
    ],
  },
  device: {
    deviceName: "LitterSense Unit #1",
    lastSynced: "4 min ago",
    wifiNetwork: "PLDTHOMEFIBR_A3B2",
    edgeProcessingMode: true,
    syncInterval: "1m",
    firmwareVersion: "v1.2.4",
  },
  dataPrivacy: {
    dataRetention: "1y",
  },
  appearance: {
    theme: "light",
    language: "en",
  },
  account: {
    displayName: "Maria Santos",
    email: "maria.santos@email.com",
    linkedAccounts: [{ provider: "Google", connected: true }],
  },
};

const STORAGE_KEY = "littersense_settings";

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (globalThis.window !== undefined) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Deep merge to preserve new fields added to defaultSettings
          setSettings((prev) => ({
            ...prev,
            ...parsed,
            notifications: {
              ...prev.notifications,
              ...(parsed.notifications && typeof parsed.notifications === "object" ? parsed.notifications : {}),
              quietHours: {
                ...prev.notifications.quietHours,
                ...(parsed.notifications?.quietHours ?? undefined),
              },
              perCat: parsed.notifications?.perCat ?? prev.notifications.perCat,
            },
          }));
        } catch (e) {
          console.error("Failed to parse settings:", e);
        }
      }
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && globalThis.window !== undefined) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings, isLoaded]);

  const updateNotificationSetting = useCallback(
    <K extends keyof UserSettings["notifications"]>(
      key: K,
      value: UserSettings["notifications"][K]
    ) => {
      setSettings((prev) => ({
        ...prev,
        notifications: { ...prev.notifications, [key]: value },
      }));
    },
    []
  );

  // Update quiet hours sub-fields
  const updateQuietHours = useCallback(
    (patch: Partial<UserSettings["notifications"]["quietHours"]>) => {
      setSettings((prev) => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          quietHours: { ...prev.notifications.quietHours, ...patch },
        },
      }));
    },
    []
  );

  // Update a single cat's notification prefs
  const updatePerCatPref = useCallback(
    (catId: string, patch: Partial<Omit<PerCatNotificationPref, "catId" | "catName">>) => {
      setSettings((prev) => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          perCat: prev.notifications.perCat.map((c) =>
            c.catId === catId ? { ...c, ...patch } : c
          ),
        },
      }));
    },
    []
  );

  const updateDeviceSetting = useCallback(
    <K extends keyof UserSettings["device"]>(key: K, value: UserSettings["device"][K]) => {
      setSettings((prev) => ({
        ...prev,
        device: { ...prev.device, [key]: value },
      }));
    },
    []
  );

  const updateDataPrivacySetting = useCallback(
    <K extends keyof UserSettings["dataPrivacy"]>(
      key: K,
      value: UserSettings["dataPrivacy"][K]
    ) => {
      setSettings((prev) => ({
        ...prev,
        dataPrivacy: { ...prev.dataPrivacy, [key]: value },
      }));
    },
    []
  );

  const updateAppearanceSetting = useCallback(
    <K extends keyof UserSettings["appearance"]>(
      key: K,
      value: UserSettings["appearance"][K]
    ) => {
      setSettings((prev) => ({
        ...prev,
        appearance: { ...prev.appearance, [key]: value },
      }));
    },
    []
  );

  const updateAccountSetting = useCallback(
    <K extends keyof UserSettings["account"]>(key: K, value: UserSettings["account"][K]) => {
      setSettings((prev) => ({
        ...prev,
        account: { ...prev.account, [key]: value },
      }));
    },
    []
  );

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
  }, []);

  const clearAllData = useCallback(() => {
    console.log("Clearing all data...");
  }, []);

  const exportAllData = useCallback(() => {
    const data = {
      settings,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `littersense_export_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [settings]);

  return {
    settings,
    isLoaded,
    updateNotificationSetting,
    updateQuietHours,
    updatePerCatPref,
    updateDeviceSetting,
    updateDataPrivacySetting,
    updateAppearanceSetting,
    updateAccountSetting,
    resetSettings,
    clearAllData,
    exportAllData,
  };
}