"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bell,
  Smartphone,
  Database,
  Palette,
  User,
  Info,
  LogOut,
  ChevronRight,
  Wifi,
  Lock,
  Shield,
  Globe,
  Moon,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  LockIcon,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { Toggle } from "@/components/ui/Toggle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastContainer, type ToastProps } from "@/components/ui/Toast";
import { useSettings } from "@/lib/useSettings";
import { generateId } from "@/lib/formatters";

export default function SettingsPage() {
  const router = useRouter();
  const {
    settings,
    updateNotificationSetting,
    updateDeviceSetting,
    updateDataPrivacySetting,
    updateAppearanceSetting,
    updateAccountSetting,
    clearAllData,
    exportAllData,
  } = useSettings();

  const [toasts, setToasts] = useState<Omit<ToastProps, "onClose">[]>([]);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Edit profile form
  const [editProfileForm, setEditProfileForm] = useState({
    displayName: settings.account.displayName,
    photo: null as string | null,
  });

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  const addToast = (message: string, type: ToastProps["type"] = "info") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const handleSaveProfile = () => {
    updateAccountSetting("displayName", editProfileForm.displayName);
    setShowEditProfile(false);
    addToast("Profile updated successfully", "success");
  };

  const handleChangePassword = () => {
    if (passwordForm.new !== passwordForm.confirm) {
      addToast("Passwords do not match", "error");
      return;
    }
    setShowChangePassword(false);
    setPasswordForm({ current: "", new: "", confirm: "" });
    addToast("Password changed successfully", "success");
  };

  const handleClearHistory = () => {
    clearAllData();
    setShowClearConfirm(false);
    addToast("All session history cleared", "info");
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsSigningOut(false);
    setShowSignOutConfirm(false);
    router.push("/login");
  };

  const handleProfilePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditProfileForm((prev) => ({ ...prev, photo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const getPasswordStrength = (password: string): { strength: number; label: string } => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const labels = ["Weak", "Fair", "Good", "Strong"];
    return { strength, label: labels[strength - 1] || "Too short" };
  };

  const passwordStrength = getPasswordStrength(passwordForm.new);

  return (
    <div className="min-h-screen bg-[#FDFAF6] pb-24">
      <TopBar />
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1C1C1C] mb-1">
            Settings
          </h1>
          <p className="text-[#6B7280] text-sm sm:text-base">
            Manage your account and preferences
          </p>
        </motion.section>

        {/* User Profile Card */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E2D9] mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#D4EDE8] flex items-center justify-center text-[#1E6B5E] font-bold text-2xl">
              {settings.account.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-lg text-[#1C1C1C]">
                {settings.account.displayName}
              </h2>
              <p className="text-sm text-gray-500">{settings.account.email}</p>
            </div>
            <button
              onClick={() => setShowEditProfile(true)}
              className="text-[#1E6B5E] font-medium text-sm hover:underline"
            >
              Edit Profile
            </button>
          </div>
        </motion.section>

        {/* Notifications Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <SettingsSection title="Notifications">
            <SettingsRow
              icon={Bell}
              label="Health Alerts"
              description="Get notified when a cat shows abnormal behavior"
              control={
                <Toggle
                  checked={settings.notifications.healthAlerts}
                  onChange={(v) => updateNotificationSetting("healthAlerts", v)}
                />
              }
            />
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={AlertTriangle}
                label="Litter Level Warnings"
                description="Notify when litter substrate needs replacement"
                control={
                  <Toggle
                    checked={settings.notifications.litterLevelWarnings}
                    onChange={(v) => updateNotificationSetting("litterLevelWarnings", v)}
                  />
                }
              />
            </div>
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={CheckCircle}
                label="Daily Summary"
                description="Receive a morning summary of yesterday's activity"
                control={
                  <Toggle
                    checked={settings.notifications.dailySummary}
                    onChange={(v) => updateNotificationSetting("dailySummary", v)}
                  />
                }
              />
            </div>
            <div className="border-t border-[#E8E2D9] p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-[#1C1C1C]">Alert Sensitivity</p>
                  <p className="text-sm text-gray-500">How sensitive anomaly detection should be</p>
                </div>
                <SegmentedControl
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                  value={settings.notifications.alertSensitivity}
                  onChange={(v) => updateNotificationSetting("alertSensitivity", v)}
                />
              </div>
              <p className="text-xs text-gray-400">
                Low: Fewer alerts, may miss subtle changes. High: More alerts, may include false positives.
              </p>
            </div>
          </SettingsSection>
        </motion.div>

        {/* Device Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <SettingsSection title="LitterSense Device">
            <SettingsRow
              icon={Smartphone}
              label="Connected Device"
              description={`${settings.device.deviceName} · Last synced ${settings.device.lastSynced}`}
              control={
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-500">Manage</span>
                </div>
              }
            />
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={Wifi}
                label="Wi-Fi Network"
                description={settings.device.wifiNetwork}
                control={<span className="text-sm text-[#1E6B5E]">Change</span>}
              />
            </div>
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={Shield}
                label="Edge Processing Mode"
                description="Process data locally when internet is unavailable"
                control={
                  <div className="flex items-center gap-2" title="Required for reliable monitoring under Philippine network conditions">
                    <LockIcon className="w-4 h-4 text-gray-400" />
                    <Toggle checked={true} onChange={() => {}} disabled />
                  </div>
                }
              />
            </div>
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={Globe}
                label="Sync Interval"
                description="How often data syncs to the cloud when online"
                control={
                  <select
                    value={settings.device.syncInterval}
                    onChange={(e) => updateDeviceSetting("syncInterval", e.target.value as "30s" | "1m" | "5m")}
                    className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#1E6B5E]"
                  >
                    <option value="30s">Every 30 sec</option>
                    <option value="1m">Every 1 min</option>
                    <option value="5m">Every 5 min</option>
                  </select>
                }
              />
            </div>
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={Info}
                label="Firmware Version"
                description={`${settings.device.firmwareVersion} · Up to date`}
                control={<span className="text-sm text-[#1E6B5E]">Check for updates</span>}
              />
            </div>
          </SettingsSection>
        </motion.div>

        {/* Data & Privacy Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <SettingsSection title="Data & Privacy">
            <SettingsRow
              icon={Database}
              label="Data Retention"
              description="How long session history is stored"
              control={
                <select
                  value={settings.dataPrivacy.dataRetention}
                  onChange={(e) => updateDataPrivacySetting("dataRetention", e.target.value as "3m" | "6m" | "1y" | "forever")}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#1E6B5E]"
                >
                  <option value="3m">3 months</option>
                  <option value="6m">6 months</option>
                  <option value="1y">1 year</option>
                  <option value="forever">Forever</option>
                </select>
              }
            />
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={Upload}
                label="Export All Data"
                description="Download a full archive of all your cats' data"
                control={
                  <button
                    onClick={exportAllData}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Export
                  </button>
                }
              />
            </div>
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={AlertTriangle}
                label="Clear History"
                description="Delete all session logs (cannot be undone)"
                control={
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Clear
                  </button>
                }
              />
            </div>
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={Shield}
                label="Privacy Policy"
                description=""
                control={<ChevronRight className="w-5 h-5 text-gray-400" />}
              />
            </div>
          </SettingsSection>
        </motion.div>

        {/* Appearance Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <SettingsSection title="Appearance">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-[#1C1C1C]">Theme</p>
                  <p className="text-sm text-gray-500">Choose your preferred color scheme</p>
                </div>
                <SegmentedControl
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark", disabled: true },
                    { value: "system", label: "System", disabled: true },
                  ]}
                  value={settings.appearance.theme}
                  onChange={(v) => updateAppearanceSetting("theme", v)}
                />
              </div>
            </div>
            <div className="border-t border-[#E8E2D9] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#1C1C1C]">Language</p>
                  <p className="text-sm text-gray-500">App display language</p>
                </div>
                <select
                  value={settings.appearance.language}
                  onChange={(e) => updateAppearanceSetting("language", e.target.value as "en" | "fil")}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#1E6B5E]"
                >
                  <option value="en">English</option>
                  <option value="fil" disabled>Filipino (Tagalog) - Soon</option>
                </select>
              </div>
            </div>
          </SettingsSection>
        </motion.div>

        {/* Account Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <SettingsSection title="Account">
            <SettingsRow
              icon={Lock}
              label="Change Password"
              description=""
              control={<ChevronRight className="w-5 h-5 text-gray-400" />}
              onClick={() => setShowChangePassword(true)}
            />
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={Globe}
                label="Linked Accounts"
                description="Google · Connected"
                control={<span className="text-sm text-gray-500">Disconnect</span>}
              />
            </div>
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={AlertTriangle}
                label="Delete Account"
                description="Permanently delete your account and all data"
                control={
                  <button
                    onClick={() => setShowDeleteAccountConfirm(true)}
                    className="text-sm text-red-600 font-medium"
                  >
                    Delete Account
                  </button>
                }
              />
            </div>
          </SettingsSection>
        </motion.div>

        {/* About Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          <SettingsSection title="About">
            <div className="p-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-[#D4EDE8] flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#1E6B5E]" fill="currentColor">
                  <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8Z" />
                </svg>
              </div>
              <p className="font-display font-bold text-[#1E6B5E] text-lg mb-1">LitterSense</p>
              <p className="text-sm text-gray-500 mb-1">Version 1.0.0 · Build PWA (Next.js 14)</p>
              <p className="text-sm text-[#1E6B5E] italic">
                Built for Filipino cat owners. Because your cat's health matters.
              </p>
              <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                <button className="text-gray-500 hover:text-[#1E6B5E]">Terms of Service</button>
                <span className="text-gray-300">·</span>
                <button className="text-gray-500 hover:text-[#1E6B5E]">Privacy Policy</button>
                <span className="text-gray-300">·</span>
                <button className="text-gray-500 hover:text-[#1E6B5E]">Contact Support</button>
              </div>
            </div>
          </SettingsSection>
        </motion.div>

        {/* Sign Out Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="mt-6 mb-8"
        >
          <button
            onClick={() => setShowSignOutConfirm(true)}
            disabled={isSigningOut}
            className="w-full py-3 px-4 border-2 border-red-300 text-red-600 rounded-xl font-medium hover:bg-red-50 active:bg-red-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
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
        </motion.div>
      </main>

      <BottomNav />

      {/* Edit Profile Bottom Sheet */}
      <BottomSheet
        isOpen={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        title="Edit Profile"
      >
        <div className="space-y-5">
          {/* Photo */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-[#D4EDE8] flex items-center justify-center overflow-hidden">
                {editProfileForm.photo ? (
                  <img
                    src={editProfileForm.photo}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-display font-bold text-[#1E6B5E]">
                    {editProfileForm.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-[#1E6B5E] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#165a4e] transition-colors shadow-md">
                <Upload className="w-4 h-4 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePhotoChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={editProfileForm.displayName}
              onChange={(e) =>
                setEditProfileForm((prev) => ({ ...prev, displayName: e.target.value }))
              }
              className="w-full px-4 py-3 rounded-xl border border-[#E8E2D9] focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
          </div>

          <button
            onClick={handleSaveProfile}
            className="w-full px-4 py-3 rounded-xl bg-[#1E6B5E] text-white font-medium hover:bg-[#165a4e] transition-colors"
          >
            Save Changes
          </button>
        </div>
      </BottomSheet>

      {/* Change Password Bottom Sheet */}
      <BottomSheet
        isOpen={showChangePassword}
        onClose={() => {
          setShowChangePassword(false);
          setPasswordForm({ current: "", new: "", confirm: "" });
        }}
        title="Change Password"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              value={passwordForm.current}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, current: e.target.value }))
              }
              className="w-full px-4 py-3 rounded-xl border border-[#E8E2D9] focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={passwordForm.new}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, new: e.target.value }))
              }
              className="w-full px-4 py-3 rounded-xl border border-[#E8E2D9] focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
            {passwordForm.new && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        passwordStrength.strength === 0
                          ? "bg-red-500 w-1/4"
                          : passwordStrength.strength === 1
                          ? "bg-amber-500 w-1/2"
                          : passwordStrength.strength === 2
                          ? "bg-yellow-500 w-3/4"
                          : "bg-green-500 w-full"
                      }`}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{passwordStrength.label}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              value={passwordForm.confirm}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))
              }
              className="w-full px-4 py-3 rounded-xl border border-[#E8E2D9] focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
          </div>

          <button
            onClick={handleChangePassword}
            disabled={
              !passwordForm.current ||
              !passwordForm.new ||
              !passwordForm.confirm ||
              passwordForm.new !== passwordForm.confirm
            }
            className="w-full px-4 py-3 rounded-xl bg-[#1E6B5E] text-white font-medium hover:bg-[#165a4e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Change Password
          </button>
        </div>
      </BottomSheet>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearHistory}
        title="Clear History"
        message="Are you sure? This will permanently delete all session data for all cats. This cannot be undone."
        confirmText="Clear"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showDeleteAccountConfirm}
        onClose={() => setShowDeleteAccountConfirm(false)}
        onConfirm={() => {
          setShowDeleteAccountConfirm(false);
          addToast("Account deletion request submitted", "info");
        }}
        title="Delete Account"
        message="This will permanently delete your account and all data. This action cannot be undone. Please contact support to proceed."
        confirmText="Contact Support"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={handleSignOut}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        variant="info"
      />
    </div>
  );
}
