"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
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

const pickNotificationSettings = (
  value: Partial<UserSettings["notifications"]>,
): Partial<UserSettings["notifications"]> => {
  const next: Partial<UserSettings["notifications"]> = {};

  if (typeof value.healthAlerts === "boolean") {
    next.healthAlerts = value.healthAlerts;
  }
  if (typeof value.litterLevelWarnings === "boolean") {
    next.litterLevelWarnings = value.litterLevelWarnings;
  }
  if (typeof value.ammoniaAlerts === "boolean") {
    next.ammoniaAlerts = value.ammoniaAlerts;
  }
  if (typeof value.h2sAlerts === "boolean") {
    next.h2sAlerts = value.h2sAlerts;
  }
  if (typeof value.rfidVisitAlerts === "boolean") {
    next.rfidVisitAlerts = value.rfidVisitAlerts;
  }
  if (typeof value.dailySummary === "boolean") {
    next.dailySummary = value.dailySummary;
  }
  if (
    value.alertSensitivity === "low" ||
    value.alertSensitivity === "medium" ||
    value.alertSensitivity === "high"
  ) {
    next.alertSensitivity = value.alertSensitivity;
  }
  if (value.quietHours && typeof value.quietHours === "object") {
    next.quietHours = value.quietHours;
  }
  if (Array.isArray(value.perCat)) {
    next.perCat = value.perCat;
  }

  return next;
};

export function useSettings() {
  const { user } = useAuth();
  const uid = user?.uid;
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
    if (!uid || !isLoaded) return undefined;

    return onSnapshot(
      doc(db, "users", uid, "settings", "notifications"),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const remote = pickNotificationSettings(
          snapshot.data() as Partial<UserSettings["notifications"]>,
        );
        setSettings((prev) => ({
          ...prev,
          notifications: {
            ...prev.notifications,
            ...remote,
            quietHours: {
              ...prev.notifications.quietHours,
              ...(remote.quietHours ?? {}),
            },
            perCat: remote.perCat ?? prev.notifications.perCat,
          },
        }));
      },
      (error) => {
        console.error("Failed to sync notification settings:", error);
      },
    );
  }, [uid, isLoaded]);

  const persistNotificationSettings = useCallback(
    async (notifications: UserSettings["notifications"]) => {
      if (!uid) return;
      await setDoc(
        doc(db, "users", uid, "settings", "notifications"),
        {
          ...notifications,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    },
    [uid],
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

      if (uid) {
        void setDoc(
          doc(db, "users", uid, "settings", "notifications"),
          {
            [key]: value,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ).catch((error) => {
          console.error("Failed to save notification setting:", error);
        });
      }
    },
    [uid]
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
  };
}
