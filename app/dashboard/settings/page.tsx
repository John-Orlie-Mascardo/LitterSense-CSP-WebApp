"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  LogOut,
  ChevronRight,
  Lock,
  Shield,
  Upload,
  Loader2,
  Activity,
  ChevronDown,
  Download,
  XSquare,
  Check,
  AlertTriangle,
  Clock,
  Wifi,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  CloudFog,
  Droplets,
  Radio,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { Toggle } from "@/components/ui/Toggle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastContainer, type ToastParams } from "@/components/ui/Toast";
import { useTheme } from "@/components/theme-provider";
import { useSettings, type UserSettings } from "@/lib/hooks/useSettings";
import { useCats } from "@/lib/contexts/CatContext";
import { useDeviceProvisioning } from "@/lib/hooks/useDeviceProvisioning";
import { useDeviceSensors } from "@/lib/hooks/useDeviceSensors";
import { useDeleteRequest } from "@/lib/contexts/DeleteRequestContext";
import {
  SETUP_DEVICE_PROVISION_URL,
  buildDeviceProvisioningBody,
} from "@/lib/utils/deviceProvisioning";
import { getDeviceNetworkSummary } from "@/lib/utils/deviceNetworkStatus";
import { generateId } from "@/lib/utils/formatters";
import { useAuth } from "@/lib/contexts/AuthContext";
import { auth } from "@/lib/configs/firebase";
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { usePWAInstall } from "@/lib/hooks/usePWAInstall";

const RETENTION_OPTIONS = ["7 Days", "14 Days", "21 Days", "30 Days"];
type AppearanceTheme = UserSettings["appearance"]["theme"];
const THEME_OPTIONS: { value: AppearanceTheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

type ExportAllFormat = "pdf" | "csv" | "doc" | "json";

type ExportAllPayload = {
  settings: UserSettings;
  cats: ReturnType<typeof useCats>["cats"];
  catStats: ReturnType<typeof useCats>["catStats"];
  catDetails: ReturnType<typeof useCats>["catDetails"];
  sessions: ReturnType<typeof useCats>["sessions"];
  healthLogs: ReturnType<typeof useCats>["healthLogs"];
  exportedAt: string;
};

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const downloadBlob = (content: BlobPart, type: string, filename: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const buildExportHtml = (payload: ExportAllPayload) => {
  const catRows = payload.cats
    .map((cat) => {
      const stats = payload.catStats[cat.id];
      const details = payload.catDetails[cat.id];
      return `
        <tr>
          <td>${escapeHtml(cat.name)}</td>
          <td>${escapeHtml(cat.status)}</td>
          <td>${escapeHtml(details?.rfidTag)}</td>
          <td>${escapeHtml(stats?.visits ?? 0)}</td>
          <td>${escapeHtml(stats?.avgDuration ?? "--")}</td>
        </tr>
      `;
    })
    .join("");
  const sessionRows = payload.sessions
    .map((session) => `
      <tr>
        <td>${escapeHtml(session.catId)}</td>
        <td>${escapeHtml(session.date)}</td>
        <td>${escapeHtml(session.startedAt)}</td>
        <td>${escapeHtml(session.endedAt)}</td>
        <td>${escapeHtml(session.durationSecs)}</td>
        <td>${escapeHtml(session.sessionStatus)}</td>
      </tr>
    `)
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>LitterSense Export</title>
        <style>
          body { font-family: Arial, sans-serif; color: #17211f; padding: 24px; }
          h1, h2 { color: #1E6B5E; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
          th, td { border: 1px solid #d9e4e1; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #eef8f5; }
          pre { white-space: pre-wrap; border: 1px solid #d9e4e1; padding: 12px; background: #f8faf9; }
        </style>
      </head>
      <body>
        <h1>LitterSense Data Export</h1>
        <p>Exported: ${escapeHtml(payload.exportedAt)}</p>
        <h2>Cats</h2>
        <table>
          <thead>
            <tr><th>Name</th><th>Status</th><th>RFID</th><th>Visits</th><th>Avg Duration</th></tr>
          </thead>
          <tbody>${catRows || "<tr><td colspan=\"5\">No cats</td></tr>"}</tbody>
        </table>
        <h2>Sessions</h2>
        <table>
          <thead>
            <tr><th>Cat ID</th><th>Date</th><th>Started</th><th>Ended</th><th>Duration Secs</th><th>Status</th></tr>
          </thead>
          <tbody>${sessionRows || "<tr><td colspan=\"6\">No sessions</td></tr>"}</tbody>
        </table>
        <h2>Settings</h2>
        <pre>${escapeHtml(JSON.stringify(payload.settings, null, 2))}</pre>
      </body>
    </html>`;
};

const buildExportCsv = (payload: ExportAllPayload) => {
  const rows = [
    ["LitterSense Data Export"],
    ["Exported At", payload.exportedAt],
    [],
    ["Cats"],
    ["ID", "Name", "Status", "RFID", "Visits", "Avg Duration"],
    ...payload.cats.map((cat) => [
      cat.id,
      cat.name,
      cat.status,
      payload.catDetails[cat.id]?.rfidTag ?? "",
      payload.catStats[cat.id]?.visits ?? 0,
      payload.catStats[cat.id]?.avgDuration ?? "",
    ]),
    [],
    ["Sessions"],
    ["ID", "Cat ID", "Date", "Started At", "Ended At", "Duration Secs", "Status", "Anomaly"],
    ...payload.sessions.map((session) => [
      session.id,
      session.catId,
      session.date,
      session.startedAt ?? "",
      session.endedAt ?? "",
      session.durationSecs,
      session.sessionStatus ?? "",
      session.anomaly ? "Yes" : "No",
    ]),
    [],
    ["Health Logs"],
    ["ID", "Cat ID", "Date", "Type", "Note"],
    ...payload.healthLogs.map((log) => [
      log.id,
      log.catId,
      log.date,
      log.type,
      log.note,
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
};

export default function SettingsPage() {
  const router = useRouter();
  const { isInstallable, triggerInstall } = usePWAInstall();
  const {
    settings,
    updateNotificationSetting,
    updateDeviceSetting,
    updateAppearanceSetting,
    updateAccountSetting,
  } = useSettings();
  const {
    cats,
    catStats,
    catDetails,
    sessions,
    healthLogs,
  } = useCats();
  const {
    deviceConfig,
    setDeviceConfig,
    saveDeviceConfig,
    regenerateConfigToken,
    provisioningUrl,
    isLoading: isDeviceProvisioningLoading,
    isSaving: isDeviceProvisioningSaving,
  } = useDeviceProvisioning();
  const { data: deviceSensors } = useDeviceSensors();
  const { theme, setTheme } = useTheme();
  const deviceNetworkSummary = getDeviceNetworkSummary({
    isLoading: isDeviceProvisioningLoading,
    configuredSsid: deviceConfig.wifiSsid,
    connectedSsid: deviceSensors?.connectedSsid,
  });

  const [toasts, setToasts] = useState<Omit<ToastParams, "onClose">[]>([]);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [showDeleteRequestSheet, setShowDeleteRequestSheet] = useState(false);
  const [showDeleteFinalConfirm, setShowDeleteFinalConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showWifiProvisioning, setShowWifiProvisioning] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [isSendingDeviceProvisioning, setIsSendingDeviceProvisioning] = useState(false);

  // Data Retention dropdown
  const [showRetentionDropdown, setShowRetentionDropdown] = useState(false);
  const [selectedRetention, setSelectedRetention] = useState("30 Days");

  const { user, refreshUser } = useAuth();
  const { getUserRequest, submitRequest } = useDeleteRequest();
  const userRequest = user ? getUserRequest(user.uid) : undefined;

  const handleSubmitDeletion = async () => {
    if (!user) return;
    try {
      await submitRequest(
        user.uid,
        user.displayName || user.email?.split("@")[0] || "User",
        user.email || "",
        deleteReason || "No reason provided"
      );
      setDeleteReason("");
      addToast("Deletion request submitted. An admin will review it soon.", "info");
    } catch (error) {
      console.error("Failed to submit deletion request:", error);
      addToast("Failed to submit request. Please try again.", "error");
    }
  };

  // Edit profile form
  const [editProfileForm, setEditProfileForm] = useState({
    displayName: user?.displayName || settings.account.displayName,
    photo: user?.photoURL || (null as string | null),
  });

  // Sync form when user is loaded
  useEffect(() => {
    if (user) {
      setEditProfileForm((prev) => ({
        ...prev,
        displayName: user.displayName || prev.displayName,
        photo: user.photoURL || prev.photo,
      }));
    }
  }, [user]);

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  const addToast = (message: string, type: ToastParams["type"] = "info") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      await updateProfile(user, {
        displayName: editProfileForm.displayName,
        photoURL: editProfileForm.photo,
      });
      updateAccountSetting("displayName", editProfileForm.displayName);
      await refreshUser();
      setShowEditProfile(false);
      addToast("Profile updated successfully", "success");
    } catch (error) {
      const message =
        error instanceof FirebaseError ? error.message : "Failed to update profile";
      addToast(message, "error");
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.new !== passwordForm.confirm) {
      addToast("Passwords do not match", "error");
      return;
    }
    if (!passwordForm.current) {
      addToast("Please enter your current password", "error");
      return;
    }
    if (!user || !user.email) return;
    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        passwordForm.current
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordForm.new);
      setShowChangePassword(false);
      setPasswordForm({ current: "", new: "", confirm: "" });
      addToast("Password changed successfully", "success");
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (
          error.code === "auth/wrong-password" ||
          error.code === "auth/invalid-credential"
        ) {
          addToast("Current password is incorrect", "error");
        } else {
          addToast(error.message || "Failed to change password", "error");
        }
      } else {
        addToast("Failed to change password", "error");
      }
    }
  };

  const buildExportPayload = (): ExportAllPayload => ({
    settings,
    cats,
    catStats,
    catDetails,
    sessions,
    healthLogs,
    exportedAt: new Date().toISOString(),
  });

  const handleExportAll = (format: ExportAllFormat) => {
    const payload = buildExportPayload();
    const dateKey = new Date().toISOString().split("T")[0];
    const baseName = `littersense_export_${dateKey}`;

    if (format === "csv") {
      downloadBlob(buildExportCsv(payload), "text/csv", `${baseName}.csv`);
      addToast("CSV export downloaded", "success");
    } else if (format === "doc") {
      downloadBlob(
        buildExportHtml(payload),
        "application/msword",
        `${baseName}.doc`,
      );
      addToast("DOC export downloaded", "success");
    } else if (format === "json") {
      downloadBlob(
        JSON.stringify(payload, null, 2),
        "application/json",
        `${baseName}.json`,
      );
      addToast("JSON export downloaded", "success");
    } else {
      const popup = window.open("", "_blank", "noopener,noreferrer");
      if (!popup) {
        addToast("Allow pop-ups to export as PDF", "error");
        return;
      }

      popup.document.write(buildExportHtml(payload));
      popup.document.close();
      popup.focus();
      popup.print();
      addToast("Choose Save as PDF in the print dialog", "info");
    }

    setShowExportSheet(false);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut(auth);
      setShowSignOutConfirm(false);
      router.push("/login");
    } catch (error) {
      const message =
        error instanceof FirebaseError ? error.message : "Failed to sign out";
      addToast(message, "error");
      setIsSigningOut(false);
    }
  };

  const handleProfilePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditProfileForm((prev) => ({ ...prev, photo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveDeviceProvisioning = async () => {
    if (!deviceConfig.wifiSsid.trim() || !deviceConfig.wifiPassword.trim()) {
      addToast("Enter both the Wi-Fi name and password", "error");
      return;
    }

    try {
      await saveDeviceConfig(deviceConfig);
      updateDeviceSetting("wifiNetwork", deviceConfig.wifiSsid.trim());
      updateDeviceSetting("lastSynced", "Just now");
      addToast("Device Wi-Fi config saved", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save device Wi-Fi config";
      addToast(message, "error");
    }
  };

  const handleSendDeviceProvisioningToHardware = async () => {
    const wifiSsid = deviceConfig.wifiSsid.trim();
    const wifiPassword = deviceConfig.wifiPassword.trim();

    if (!wifiSsid || !wifiPassword) {
      addToast("Enter both the Wi-Fi name and password", "error");
      return;
    }

    setIsSendingDeviceProvisioning(true);

    try {
      const body = buildDeviceProvisioningBody({
        wifiSsid,
        wifiPassword,
        configUrl: provisioningUrl,
      });

      const response = await fetch(SETUP_DEVICE_PROVISION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`Device setup returned HTTP ${response.status}`);
      }

      let cloudSaveSucceeded = true;
      try {
        await saveDeviceConfig(deviceConfig);
        updateDeviceSetting("wifiNetwork", wifiSsid);
        updateDeviceSetting("lastSynced", "Just now");
      } catch {
        cloudSaveSucceeded = false;
      }

      addToast(
        cloudSaveSucceeded
          ? "Wi-Fi config sent to the setup device"
          : "Sent to device. Reconnect to internet later and save to sync cloud settings.",
        cloudSaveSucceeded ? "success" : "info",
      );
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("HTTP")
          ? error.message
          : "Connect to LitterSense-Setup Wi-Fi, then try again or open 192.168.4.1.";
      addToast(message, "error");
    } finally {
      setIsSendingDeviceProvisioning(false);
    }
  };

  const handleCopyValue = async (value: string, label: string) => {
    if (!value) {
      addToast(`No ${label.toLowerCase()} available yet`, "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      addToast(`${label} copied`, "success");
    } catch {
      addToast(`Failed to copy ${label.toLowerCase()}`, "error");
    }
  };

  const getPasswordStrength = (password: string): { strength: number; label: string } => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    const labels = ["Weak", "Fair", "Good", "Strong"];
    return { strength, label: labels[strength - 1] || "Too short" };
  };

  const passwordStrength = getPasswordStrength(passwordForm.new);

  return (
    <div className="min-h-screen bg-litter-bg pb-24 lg:pb-10">
      <TopBar />
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-lg mx-auto">

        {/* User Profile Card */}
        <section className="bg-litter-card rounded-2xl p-4 shadow-sm border border-litter-border mb-2 mt-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-2xl shrink-0 overflow-hidden">
              {user?.photoURL ? (
                <Image
                  src={user.photoURL}
                  alt="Profile"
                  width={64}
                  height={64}
                  referrerPolicy="no-referrer"
                  unoptimized
                  className="w-full h-full object-cover"
                />
              ) : (
                (user?.displayName || settings.account.displayName).charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <h2 className="font-display font-semibold text-lg text-litter-text truncate">
                {user?.displayName || settings.account.displayName}
              </h2>
              <p className="text-sm text-theme-muted truncate">{user?.email || settings.account.email}</p>
            </div>
            <button
              onClick={() => setShowEditProfile(true)}
              className="border border-litter-primary text-litter-primary bg-litter-primary-light rounded-full px-3 py-1 text-sm font-medium hover:bg-litter-primary-light transition-colors shrink-0"
            >
              Edit Profile
            </button>
          </div>
        </section>

        {/* Device Network Section */}
        <div>
          <h3 className="font-body text-xs font-semibold tracking-widest text-theme-muted uppercase px-1 mb-2 mt-6">
            DEVICE NETWORK
          </h3>
          <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm mb-2">
            <button
              onClick={() => setShowWifiProvisioning(true)}
              className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-theme-hover transition-colors bg-transparent border-none text-left rounded-2xl"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-theme-overlay flex items-center justify-center shrink-0">
                  <Wifi className="w-5 h-5 text-theme-muted" />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-medium text-litter-text">ESP32 Wi-Fi Provisioning</span>
                  <p className="truncate text-xs text-theme-muted">
                    {deviceNetworkSummary}
                  </p>
                </div>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                {isDeviceProvisioningSaving && (
                  <Loader2 className="h-4 w-4 animate-spin text-theme-muted" />
                )}
                <ChevronRight className="w-5 h-5 text-theme-muted" />
              </div>
            </button>
          </div>
        </div>

        {/* Notifications Section */}
        <div>
          <h3 className="font-body text-xs font-semibold tracking-widest text-theme-muted uppercase px-1 mb-2 mt-6">
            NOTIFICATIONS
          </h3>
          <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm mb-2">
            <SettingsRow
              icon={Activity}
              label="Health Alerts"
              control={
                <Toggle
                  checked={settings.notifications.healthAlerts}
                  onChange={(v) => updateNotificationSetting("healthAlerts", v)}
                />
              }
            />
            <div className="border-t border-litter-border">
              <SettingsRow
                icon={Droplets}
                label="Ammonia (Urine Odor) Alerts"
                description="Get notified when NH3 exceeds threshold"
                control={
                  <Toggle
                    checked={settings.notifications.ammoniaAlerts}
                    onChange={(v) => updateNotificationSetting("ammoniaAlerts", v)}
                  />
                }
              />
            </div>
            <div className="border-t border-litter-border">
              <SettingsRow
                icon={CloudFog}
                label="H2S (Stool Odor) Alerts"
                description="Get notified when H2S exceeds threshold"
                control={
                  <Toggle
                    checked={settings.notifications.h2sAlerts}
                    onChange={(v) => updateNotificationSetting("h2sAlerts", v)}
                  />
                }
              />
            </div>
            <div className="border-t border-litter-border">
              <SettingsRow
                icon={Radio}
                label="RFID Entry/Exit"
                description="Get notified when a cat enters or leaves"
                control={
                  <Toggle
                    checked={settings.notifications.rfidVisitAlerts}
                    onChange={(v) => updateNotificationSetting("rfidVisitAlerts", v)}
                  />
                }
              />
            </div>
          </div>
        </div>

        {/* Data & Privacy Section */}
        <div>
          <h3 className="font-body text-xs font-semibold tracking-widest text-theme-muted uppercase px-1 mb-2 mt-6">
            DATA & PRIVACY
          </h3>
          <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm mb-2">

            {/* Data Retention â€” interactive dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowRetentionDropdown((v) => !v)}
                className="w-full flex items-center justify-between p-4 hover:bg-theme-hover transition-colors text-left rounded-t-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-theme-overlay flex items-center justify-center shrink-0">
                    <Database className="w-5 h-5 text-theme-muted" />
                  </div>
                  <span className="text-sm font-medium text-litter-text">Data Retention</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-theme-muted">{selectedRetention}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-theme-muted transition-transform duration-200 ${showRetentionDropdown ? "rotate-180" : ""
                      }`}
                  />
                </div>
              </button>

              {/* Dropdown options */}
              {showRetentionDropdown && (
                <div className="absolute right-4 top-full mt-1 bg-litter-card rounded-xl border border-litter-border shadow-lg z-20 overflow-hidden min-w-[150px]">
                  {RETENTION_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setSelectedRetention(option);
                        setShowRetentionDropdown(false);
                        addToast(`Data retention set to ${option}`, "success");
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-theme-overlay ${selectedRetention === option
                          ? "text-litter-primary font-semibold bg-litter-primary-light"
                          : "text-litter-text"
                        }`}
                    >
                      {option}
                      {selectedRetention === option && (
                        <Check className="w-4 h-4 text-litter-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-litter-border">
              <button
                onClick={() => setShowExportSheet(true)}
                className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-theme-hover transition-colors bg-transparent border-none text-left"
              >
                <div className="flex items-center gap-3">
                  <Download className="w-5 h-5 text-theme-muted" />
                  <span className="text-sm font-medium text-litter-text">Export All Data</span>
                </div>
                <ChevronRight className="w-5 h-5 text-theme-muted" />
              </button>
            </div>
            <div className="border-t border-litter-border">
              <button
                onClick={() => setShowPrivacyPolicy(true)}
                className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-theme-hover transition-colors bg-transparent border-none text-left"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-theme-muted" />
                  <span className="text-sm font-medium text-litter-text">Privacy Policy</span>
                </div>
                <ChevronRight className="w-5 h-5 text-theme-muted" />
              </button>
            </div>
          </div>
        </div>

        {/* Appearance Section */}
        <div>
          <h3 className="font-body text-xs font-semibold tracking-widest text-theme-muted uppercase px-1 mb-2 mt-6">
            APPEARANCE
          </h3>
          <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm mb-2 p-4">
            <p className="font-medium text-litter-text text-sm mb-3">Theme</p>
            <SegmentedControl
              options={THEME_OPTIONS}
              value={(theme || settings.appearance.theme) as AppearanceTheme}
              onChange={(v) => {
                updateAppearanceSetting("theme", v);
                setTheme(v);
              }}
            />
          </div>
        </div>

        {/* App Section */}
        {isInstallable && (
          <div>
            <h3 className="font-body text-xs font-semibold tracking-widest text-theme-muted uppercase px-1 mb-2 mt-6">
              App
            </h3>
            <div className="bg-litter-card rounded-2xl shadow-sm border border-litter-border divide-y divide-litter-border overflow-hidden">
              <SettingsRow
                icon={Download}
                label="Install App"
                description="Add LitterSense to your home screen"
                control={
                  <button
                    onClick={() => void triggerInstall()}
                    className="bg-litter-primary text-white rounded-xl px-4 py-1.5 text-sm font-medium active:opacity-80 transition-opacity"
                  >
                    Install
                  </button>
                }
              />
            </div>
          </div>
        )}

        {/* Account Section */}
        <div>
          <h3 className="font-body text-xs font-semibold tracking-widest text-theme-muted uppercase px-1 mb-2 mt-6">
            ACCOUNT
          </h3>
          <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm mb-2">
            <button
              onClick={() => setShowChangePassword(true)}
              className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-theme-hover transition-colors bg-transparent border-none text-left"
            >
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-theme-muted" />
                <span className="text-sm font-medium text-litter-text">Change Password</span>
              </div>
              <ChevronRight className="w-5 h-5 text-theme-muted" />
            </button>
            <div className="border-t border-litter-border">
              {!userRequest ? (
                /* No request yet â€” show action button */
                <button
                  onClick={() => setShowDeleteRequestSheet(true)}
                  className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-theme-hover transition-colors bg-transparent border-none text-left"
                >
                  <div className="flex items-center gap-3">
                    <XSquare className="w-5 h-5 text-red-500" />
                    <span className="text-sm font-medium text-red-500">Request Account Deletion</span>
                  </div>
                </button>
              ) : userRequest.status === "pending" ? (
                /* Pending â€” amber status card */
                <div className="p-4">
                  <div className="flex items-start gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                    <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Deletion Requested</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                        Your request is awaiting admin review. You can continue using the app in the meantime.
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">
                        Submitted {new Date(userRequest.requestedDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                </div>
              ) : userRequest.status === "approved" ? (
                /* Approved â€” red status card */
                <div className="p-4">
                  <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-700 dark:text-red-400">Deletion Approved</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 leading-relaxed">
                        Your account deletion has been approved. Your account, all cat profiles, monitoring history, and health logs will be permanently removed and cannot be recovered.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Rejected â€” neutral card with re-request option */
                <div className="p-4">
                  <div className="flex items-start gap-3 p-3.5 bg-litter-bg rounded-xl border border-litter-border">
                    <XSquare className="w-5 h-5 text-litter-muted shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-litter-text">Request Declined</p>
                      <p className="text-xs text-litter-muted mt-0.5 leading-relaxed">
                        Your deletion request was not approved. Contact support for details.
                      </p>
                      <button
                        onClick={() => setShowDeleteRequestSheet(true)}
                        className="text-xs text-litter-primary font-semibold mt-2 hover:underline"
                      >
                        Submit a new request
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sign Out Button */}
        <div className="mt-6 mb-8">
          <button
            onClick={() => setShowSignOutConfirm(true)}
            disabled={isSigningOut}
            className="w-full py-3 px-4 border-2 border-litter-danger text-litter-danger rounded-xl font-medium hover:bg-litter-danger-bg active:bg-litter-danger-bg/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isSigningOut ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Signing out...
              </>
            ) : (
              <>
                <LogOut className="w-5 h-5" />
                Sign Out
              </>
            )}
          </button>
        </div>
      </main>

      {/* Backdrop â€” closes dropdown when clicking outside */}
      {showRetentionDropdown && (
        <button
          className="fixed inset-0 z-10"
          onClick={() => setShowRetentionDropdown(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Space" || event.key === "Escape") {
              setShowRetentionDropdown(false);
            }
          }}
          aria-label="Close dropdown"
          style={{ background: 'transparent', border: 'none', padding: 0, margin: 0 }}
        />
      )}

      <BottomNav />

      {/* Export All Data Bottom Sheet */}
      <BottomSheet
        isOpen={showExportSheet}
        onClose={() => setShowExportSheet(false)}
        title="Export All Data"
      >
        <div className="space-y-3">
          {[
            {
              format: "pdf" as const,
              label: "PDF",
              description: "Open a printable export and save it as PDF.",
            },
            {
              format: "csv" as const,
              label: "CSV",
              description: "Download spreadsheet-friendly cat and session data.",
            },
            {
              format: "doc" as const,
              label: "DOC",
              description: "Download a Word-compatible document.",
            },
            {
              format: "json" as const,
              label: "JSON",
              description: "Download the complete structured export.",
            },
          ].map((option) => (
            <button
              key={option.format}
              onClick={() => handleExportAll(option.format)}
              className="w-full rounded-xl border border-litter-border bg-litter-card p-4 text-left transition-colors hover:bg-theme-hover"
            >
              <span className="text-sm font-semibold text-litter-text">
                {option.label}
              </span>
              <span className="mt-1 block text-xs text-theme-muted">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Edit Profile Bottom Sheet */}
      <BottomSheet isOpen={showEditProfile} onClose={() => setShowEditProfile(false)} title="Edit Profile">
        <div className="space-y-5">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-litter-primary-light flex items-center justify-center overflow-hidden">
                {editProfileForm.photo ? (
                  <Image
                    src={editProfileForm.photo}
                    alt="Preview"
                    width={96}
                    height={96}
                    referrerPolicy="no-referrer"
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-display font-bold text-litter-primary">
                    {(editProfileForm.displayName || "U").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-litter-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-litter-primary-hover transition-colors shadow-md">
                <Upload className="w-4 h-4 text-white" />
                <input type="file" accept="image/*" onChange={handleProfilePhotoChange} className="hidden" />
              </label>
            </div>
          </div>
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-theme-secondary mb-1.5">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={editProfileForm.displayName}
              onChange={(event) => setEditProfileForm((prev) => ({ ...prev, displayName: event.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-litter-input text-litter-text border border-litter-border focus:outline-none focus:ring-2 focus:ring-litter-primary/30 focus:border-transparent transition-all"
            />
          </div>
          <button onClick={handleSaveProfile} className="w-full px-4 py-3 rounded-xl bg-litter-primary text-white font-medium hover:bg-litter-primary-hover transition-colors">
            Save Changes
          </button>
        </div>
      </BottomSheet>

      {/* Change Password Bottom Sheet */}
      <BottomSheet
        isOpen={showChangePassword}
        onClose={() => { setShowChangePassword(false); setPasswordForm({ current: "", new: "", confirm: "" }); }}
        title="Change Password"
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-theme-secondary mb-1.5">Current Password</label>
            <input id="currentPassword" type="password" value={passwordForm.current}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, current: event.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-litter-input text-litter-text border border-litter-border focus:outline-none focus:ring-2 focus:ring-litter-primary/30 focus:border-transparent transition-all"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-theme-secondary mb-1.5">New Password</label>
            <input id="newPassword" type="password" value={passwordForm.new}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, new: event.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-litter-input text-litter-text border border-litter-border focus:outline-none focus:ring-2 focus:ring-litter-primary/30 focus:border-transparent transition-all"
            />
            {passwordForm.new && (() => {
              const getStrengthClass = () => {
                if (passwordStrength.strength === 0) return "bg-red-500 w-1/4";
                if (passwordStrength.strength === 1) return "bg-amber-500 w-1/2";
                if (passwordStrength.strength === 2) return "bg-yellow-500 w-3/4";
                return "bg-green-500 w-full";
              };
              return (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-litter-border rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${getStrengthClass()}`} />
                    </div>
                    <span className="text-xs text-theme-muted">{passwordStrength.label}</span>
                  </div>
                </div>
              );
            })()}
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-theme-secondary mb-1.5">Confirm New Password</label>
            <input id="confirmPassword" type="password" value={passwordForm.confirm}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirm: event.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-litter-input text-litter-text border border-litter-border focus:outline-none focus:ring-2 focus:ring-litter-primary/30 focus:border-transparent transition-all"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={!passwordForm.current || !passwordForm.new || !passwordForm.confirm || passwordForm.new !== passwordForm.confirm}
            className="w-full px-4 py-3 rounded-xl bg-litter-primary text-white font-medium hover:bg-litter-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Change Password
          </button>
        </div>
      </BottomSheet>

      {/* Wi-Fi Provisioning Bottom Sheet */}
      <BottomSheet
        isOpen={showWifiProvisioning}
        onClose={() => setShowWifiProvisioning(false)}
        title="ESP32 Wi-Fi Setup"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-litter-border bg-litter-bg p-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-litter-primary-light">
              <Wifi className="h-5 w-5 text-litter-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-litter-text">ESP32 Wi-Fi Provisioning</p>
              <p className="mt-1 text-xs leading-relaxed text-theme-muted">
                Save the owner&apos;s Wi-Fi here, then connect your phone or laptop to LitterSense-Setup
                and send it to the ESP32. Future Wi-Fi changes sync through the Device Fetch URL.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-litter-border bg-litter-bg p-3">
            <p className="text-sm font-medium text-litter-text">First-time hardware setup</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-theme-muted">
              <li>Power the ESP32 from the supply module.</li>
              <li>Connect this phone or laptop to the LitterSense-Setup Wi-Fi. Password: littersense.</li>
              <li>No Internet on that setup Wi-Fi is normal.</li>
              <li>If the setup page does not open automatically, open http://192.168.4.1.</li>
              <li>Tap Send to Setup Device after entering the owner Wi-Fi below.</li>
            </ol>
          </div>

          <div>
            <label htmlFor="deviceName" className="mb-1.5 block text-sm font-medium text-theme-secondary">
              Device Name
            </label>
            <input
              id="deviceName"
              type="text"
              value={deviceConfig.deviceName}
              onChange={(event) => setDeviceConfig((prev) => ({ ...prev, deviceName: event.target.value }))}
              className="w-full rounded-xl bg-litter-input text-litter-text border border-litter-border px-4 py-3 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-litter-primary/30"
              placeholder="LitterSense Unit #1"
              disabled={isDeviceProvisioningSaving}
            />
          </div>

          <div>
            <label htmlFor="wifiSsid" className="mb-1.5 block text-sm font-medium text-theme-secondary">
              Wi-Fi Name (SSID)
            </label>
            <input
              id="wifiSsid"
              type="text"
              value={deviceConfig.wifiSsid}
              onChange={(event) => setDeviceConfig((prev) => ({ ...prev, wifiSsid: event.target.value }))}
              className="w-full rounded-xl bg-litter-input text-litter-text border border-litter-border px-4 py-3 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-litter-primary/30"
              placeholder="Enter the owner Wi-Fi name"
              disabled={isDeviceProvisioningSaving}
            />
          </div>

          <div>
            <label htmlFor="wifiPassword" className="mb-1.5 block text-sm font-medium text-theme-secondary">
              Wi-Fi Password
            </label>
            <div className="relative">
              <input
                id="wifiPassword"
                type={showWifiPassword ? "text" : "password"}
                value={deviceConfig.wifiPassword}
                onChange={(event) => setDeviceConfig((prev) => ({ ...prev, wifiPassword: event.target.value }))}
                className="w-full rounded-xl bg-litter-input text-litter-text border border-litter-border px-4 py-3 pr-12 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-litter-primary/30"
                placeholder="Enter the owner Wi-Fi password"
                disabled={isDeviceProvisioningSaving}
              />
              <button
                type="button"
                onClick={() => setShowWifiPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-theme-muted"
                aria-label={showWifiPassword ? "Hide Wi-Fi password" : "Show Wi-Fi password"}
              >
                {showWifiPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-litter-border bg-litter-bg p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-litter-text">Provisioning Token</p>
                <p className="mt-1 break-all font-mono text-xs text-theme-muted">{deviceConfig.configToken}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyValue(deviceConfig.configToken, "Provisioning token")}
                  className="rounded-lg border border-litter-border p-2 text-theme-muted transition-colors hover:bg-theme-hover"
                  title="Copy token"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={regenerateConfigToken}
                  className="rounded-lg border border-litter-border p-2 text-theme-muted transition-colors hover:bg-theme-hover"
                  title="Generate new token"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-theme-muted">
              Use this token in the ESP32 sketch to fetch the latest Wi-Fi config.
            </p>
          </div>

          <div className="rounded-xl border border-litter-border bg-litter-bg p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-litter-text">Device Fetch URL</p>
                <p className="mt-1 break-all text-xs text-theme-muted">{provisioningUrl || "Save first to generate a usable URL."}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyValue(provisioningUrl, "Device fetch URL")}
                className="rounded-lg border border-litter-border p-2 text-theme-muted transition-colors hover:bg-theme-hover"
                title="Copy fetch URL"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-theme-muted">
              Last synced: {isDeviceProvisioningLoading ? "Loading..." : deviceConfig.updatedAtLabel}
            </p>
          </div>

          <button
            onClick={handleSaveDeviceProvisioning}
            disabled={isDeviceProvisioningLoading || isDeviceProvisioningSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-litter-primary px-4 py-3 font-medium text-white transition-colors hover:bg-litter-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeviceProvisioningSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving Wi-Fi Config...
              </>
            ) : (
              <>
                <Wifi className="h-4 w-4" />
                Save Device Wi-Fi
              </>
            )}
          </button>

          <button
            onClick={handleSendDeviceProvisioningToHardware}
            disabled={isSendingDeviceProvisioning}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-litter-primary bg-litter-card px-4 py-3 font-medium text-litter-primary transition-colors hover:bg-litter-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingDeviceProvisioning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending to Setup Device...
              </>
            ) : (
              <>
                <Wifi className="h-4 w-4" />
                Send to Setup Device
              </>
            )}
          </button>
        </div>
      </BottomSheet>

      {/* Privacy Policy Bottom Sheet */}
      <BottomSheet
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
        title="Privacy Policy"
      >
        <div className="space-y-4 text-sm text-theme-secondary max-h-[60vh] overflow-y-auto pr-2">
          <p>
            Welcome to the LitterSense Privacy Policy. Your privacy is critically important to us.
          </p>
          <h4 className="font-display font-semibold text-litter-text">1. Information We Collect</h4>
          <p>
            We collect the information you provide directly to us when you create an account, update your profile, and use our application to monitor your cat&apos;s litter habits.
          </p>
          <h4 className="font-display font-semibold text-litter-text">2. How We Use Information</h4>
          <p>
            We use the information we collect to operate, maintain, and provide you with the features and functionality of the Service, as well as to communicate directly with you.
          </p>
          <h4 className="font-display font-semibold text-litter-text">3. Data Security</h4>
          <p>
            We care about the security of your information and use commercially reasonable safeguards to preserve the integrity and security of all information collected through our application.
          </p>
          <p className="pt-4">
            If you have any questions about this Privacy Policy, please contact our support team.
          </p>
          <button
            onClick={() => setShowPrivacyPolicy(false)}
            className="w-full mt-6 px-4 py-3 rounded-xl bg-litter-primary text-white font-medium hover:bg-litter-primary-hover transition-colors"
          >
            Close
          </button>
        </div>
      </BottomSheet>

      {/* Confirm Dialogs */}
      {/* Step 1 â€” Reason sheet */}
      <BottomSheet
        isOpen={showDeleteRequestSheet}
        onClose={() => { setShowDeleteRequestSheet(false); setDeleteReason(""); }}
        title="Request Account Deletion"
      >
        <div className="space-y-5">
          {/* Warning */}
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-red-700 dark:text-red-400 mb-1.5">Before you continue</p>
              <ul className="text-red-600 dark:text-red-400 space-y-1 text-xs leading-relaxed">
                <li>â€¢ Your account and all cat profiles will be permanently deleted</li>
                <li>â€¢ All monitoring history and health logs will be lost</li>
                <li>â€¢ This action cannot be undone once an admin processes it</li>
              </ul>
            </div>
          </div>

          {/* Reason selector */}
          <div>
            <label className="block text-sm font-medium text-litter-text mb-2">
              Reason for leaving{" "}
              <span className="text-litter-muted font-normal">(optional)</span>
            </label>
            <select
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              className="input-base w-full px-4 py-3 rounded-xl border border-litter-border text-sm focus:outline-none focus:border-litter-primary focus:ring-2 focus:ring-litter-primary/10 transition-all"
            >
              <option value="">Select a reasonâ€¦</option>
              <option value="No longer using the service">No longer using the service</option>
              <option value="Privacy concerns">Privacy concerns</option>
              <option value="Switching to a different app">Switching to a different app</option>
              <option value="Too many notifications">Too many notifications</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* CTA */}
          <button
            onClick={() => {
              setShowDeleteRequestSheet(false);
              setShowDeleteFinalConfirm(true);
            }}
            className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors"
          >
            Continue to Confirm
          </button>
        </div>
      </BottomSheet>

      {/* Step 2 â€” Final confirmation */}
      <ConfirmDialog
        isOpen={showDeleteFinalConfirm}
        onClose={() => setShowDeleteFinalConfirm(false)}
        onConfirm={handleSubmitDeletion}
        title="Submit Deletion Request?"
        message="An admin will review your request. Once approved, your account and all data will be permanently deleted and cannot be recovered. You can continue using the app until an admin processes it."
        confirmText="Submit Request"
        variant="danger"
      />
      <ConfirmDialog isOpen={showSignOutConfirm} onClose={() => setShowSignOutConfirm(false)} onConfirm={handleSignOut}
        title="Sign Out" message="Are you sure you want to sign out?" confirmText="Sign Out" variant="info" />
    </div>
  );
}

