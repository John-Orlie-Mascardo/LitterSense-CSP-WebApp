"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import { PerCatNotificationPref } from "../interfaces/PerCatNotificationPref";
import type { UserSettings } from "../interfaces/UserSettings";

export type { UserSettings };


const defaultSettings: UserSettings = {
  notifications: {
    healthAlerts: true,
    litterLevelWarnings: true,
    ammoniaAlerts: true,
    h2sAlerts: true,
    rfidVisitAlerts: false,
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

const mergeSettings = (parsed: Partial<UserSettings>): UserSettings => ({
  ...defaultSettings,
  ...parsed,
  notifications: {
    ...defaultSettings.notifications,
    ...(parsed.notifications && typeof parsed.notifications === "object" ? parsed.notifications : {}),
    quietHours: {
      ...defaultSettings.notifications.quietHours,
      ...(parsed.notifications?.quietHours ?? undefined),
    },
    perCat: parsed.notifications?.perCat ?? defaultSettings.notifications.perCat,
  },
});

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (globalThis.window !== undefined) {
      const stored = localStorage.getItem(STORAGE_KEY);
      let nextSettings = defaultSettings;
      if (stored) {
        try {
          nextSettings = mergeSettings(JSON.parse(stored));
        } catch (e) {
          console.error("Failed to parse settings:", e);
        }
      }
      queueMicrotask(() => {
        setSettings(nextSettings);
        setIsLoaded(true);
      });
    }
  }, []);

  useEffect(() => {
    if (isLoaded && globalThis.window !== undefined) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings, isLoaded]);

  useEffect(() => {
    if (!user || !isLoaded) return;

    let isActive = true;

    const loadFirestoreNotifications = async () => {
      try {
        const snapshot = await getDoc(
          doc(db, "users", user.uid, "settings", "notifications"),
        );
        if (!isActive || !snapshot.exists()) return;
        const notificationSettings = { ...snapshot.data() };
        delete notificationSettings.updatedAt;

        setSettings((prev) =>
          mergeSettings({
            ...prev,
            notifications: {
              ...prev.notifications,
              ...notificationSettings,
            },
          }),
        );
      } catch (error) {
        console.error("Failed to load notification settings:", error);
      }
    };

    void loadFirestoreNotifications();

    return () => {
      isActive = false;
    };
  }, [isLoaded, user]);

  const persistNotificationSettings = useCallback(
    async (notifications: UserSettings["notifications"]) => {
      if (!user) return;
      await setDoc(
        doc(db, "users", user.uid, "settings", "notifications"),
        notifications,
        { merge: true },
      );
    },
    [user],
  );

  const updateNotificationSetting = useCallback(
    <K extends keyof UserSettings["notifications"]>(
      key: K,
      value: UserSettings["notifications"][K]
    ) => {
      setSettings((prev) => ({
        ...prev,
        notifications: { ...prev.notifications, [key]: value },
      }));
      void persistNotificationSettings({
        ...settings.notifications,
        [key]: value,
      });
    },
    [persistNotificationSettings, settings.notifications]
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
      void persistNotificationSettings({
        ...settings.notifications,
        quietHours: { ...settings.notifications.quietHours, ...patch },
      });
    },
    [persistNotificationSettings, settings.notifications]
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
      void persistNotificationSettings({
        ...settings.notifications,
        perCat: settings.notifications.perCat.map((c) =>
          c.catId === catId ? { ...c, ...patch } : c,
        ),
      });
    },
    [persistNotificationSettings, settings.notifications]
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
