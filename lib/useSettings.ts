"use client";

import { useState, useEffect, useCallback } from "react";

export interface UserSettings {
  notifications: {
    healthAlerts: boolean;
    litterLevelWarnings: boolean;
    dailySummary: boolean;
    alertSensitivity: "low" | "medium" | "high";
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

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setSettings((prev) => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error("Failed to parse settings:", e);
        }
      }
      setIsLoaded(true);
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    if (isLoaded && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings, isLoaded]);

  const updateNotificationSetting = useCallback(<K extends keyof UserSettings["notifications"]>(
    key: K,
    value: UserSettings["notifications"][K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
  }, []);

  const updateDeviceSetting = useCallback(<K extends keyof UserSettings["device"]>(
    key: K,
    value: UserSettings["device"][K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      device: { ...prev.device, [key]: value },
    }));
  }, []);

  const updateDataPrivacySetting = useCallback(<K extends keyof UserSettings["dataPrivacy"]>(
    key: K,
    value: UserSettings["dataPrivacy"][K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      dataPrivacy: { ...prev.dataPrivacy, [key]: value },
    }));
  }, []);

  const updateAppearanceSetting = useCallback(<K extends keyof UserSettings["appearance"]>(
    key: K,
    value: UserSettings["appearance"][K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      appearance: { ...prev.appearance, [key]: value },
    }));
  }, []);

  const updateAccountSetting = useCallback(<K extends keyof UserSettings["account"]>(
    key: K,
    value: UserSettings["account"][K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      account: { ...prev.account, [key]: value },
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
  }, []);

  const clearAllData = useCallback(() => {
    // Mock clear data
    console.log("Clearing all data...");
  }, []);

  const exportAllData = useCallback(() => {
    // Mock export data
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
    updateDeviceSetting,
    updateDataPrivacySetting,
    updateAppearanceSetting,
    updateAccountSetting,
    resetSettings,
    clearAllData,
    exportAllData,
  };
}
