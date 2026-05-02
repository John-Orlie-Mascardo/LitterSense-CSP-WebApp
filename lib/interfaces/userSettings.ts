import { PerCatNotificationPref } from "./perCatNotificationPref";

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