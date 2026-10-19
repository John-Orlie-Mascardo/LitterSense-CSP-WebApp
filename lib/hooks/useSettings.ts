"use client";

import { createContext, createElement, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "@/lib/utils/operationalClient";
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

const SettingsContext = createContext<ReturnType<typeof useSettingsState> | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return createElement(SettingsOwnerProvider, { key: user?.uid ?? "signed-out" }, children);
}

function SettingsOwnerProvider({ children }: { children?: ReactNode }) {
  const value = useSettingsState();
  return createElement(SettingsContext.Provider, { value }, children);
}

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("SettingsProvider is required for settings");
  return value;
}

function useSettingsState() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedOwner, setLoadedOwner] = useState<string | undefined>();

  useEffect(() => {
    let stopped = false;
    let unsubscribe: (() => void) | undefined;
    queueMicrotask(() => {
      if (stopped) return;
      let nextSettings = defaultSettings, cached = false;
      try {
        const stored = uid ? localStorage.getItem(`${STORAGE_KEY}:${uid}`) : null;
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<UserSettings> | null;
          if (parsed && typeof parsed.notifications?.rfidVisitAlerts === "boolean") {
            nextSettings = mergeSettings(parsed);
            cached = true;
          }
        }
      } catch (error) {
        console.error("Failed to load cached settings:", error);
      }
      setSettings(nextSettings);
      setIsLoaded(cached);
      setLoadedOwner(uid);
      if (!uid) return;

      unsubscribe = onSnapshot(
        doc(db, "users", uid, "settings", "notifications"),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (stopped) return;
          if (!snapshot.exists() && snapshot.metadata.fromCache) return;
          if (snapshot.exists()) {
            const remote = pickNotificationSettings(
              snapshot.data() as Partial<UserSettings["notifications"]>,
            );
            setSettings((prev) => ({
              ...prev,
              notifications: {
                ...prev.notifications,
                ...remote,
                quietHours: { ...prev.notifications.quietHours, ...(remote.quietHours ?? {}) },
                perCat: remote.perCat ?? prev.notifications.perCat,
              },
            }));
          }
          setIsLoaded(true);
        },
        (error) => {
          if (!stopped) console.error("Failed to sync notification settings:", error);
        },
      );
    });
    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [uid]);

  useEffect(() => {
    if (uid && loadedOwner === uid && isLoaded && globalThis.window !== undefined) {
      try {
        localStorage.setItem(`${STORAGE_KEY}:${uid}`, JSON.stringify(settings));
      } catch (error) {
        console.error("Failed to cache settings:", error);
      }
    }
  }, [settings, isLoaded, uid, loadedOwner]);

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
