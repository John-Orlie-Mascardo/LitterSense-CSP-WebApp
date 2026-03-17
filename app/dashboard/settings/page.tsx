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
  Activity,
  Trash2,
  ChevronDown,
  Download,
  History,
  XSquare,
  ExternalLink
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

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-lg mx-auto">
        {/* User Profile Card */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E2D9] mb-2 mt-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#D4EDE8] flex items-center justify-center text-[#1E6B5E] font-bold text-2xl shrink-0">
              {settings.account.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <h2 className="font-semibold text-lg text-[#1C1C1C] truncate">
                {settings.account.displayName}
              </h2>
              <p className="text-sm text-gray-500 truncate">{settings.account.email}</p>
            </div>
            <button
              onClick={() => setShowEditProfile(true)}
              className="border border-[#1E6B5E] text-[#1E6B5E] bg-[#EAF7F5] rounded-full px-3 py-1 text-sm font-medium hover:bg-[#d9f2ee] transition-colors shrink-0"
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
          <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase px-1 mb-2 mt-6">
            NOTIFICATIONS
          </h3>
          <div className="bg-white rounded-2xl border border-[#E8E2D9] shadow-sm mb-2">
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
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={Trash2}
                label="Litter Level Warnings"
                control={
                  <Toggle
                    checked={settings.notifications.litterLevelWarnings}
                    onChange={(v) => updateNotificationSetting("litterLevelWarnings", v)}
                  />
                }
              />
            </div>
            <div className="border-t border-[#E8E2D9] p-4">
              <p className="font-medium text-[#1C1C1C] text-sm mb-3">Alert Sensitivity</p>
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
          </div>
        </motion.div>

        {/* Data & Privacy Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase px-1 mb-2 mt-6">
            DATA & PRIVACY
          </h3>
          <div className="bg-white rounded-2xl border border-[#E8E2D9] shadow-sm mb-2">
            <SettingsRow
              icon={Database}
              label="Data Retention"
              control={
                <div className="flex items-center gap-1 cursor-pointer">
                  <span className="text-sm text-gray-600">30 Days</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </div>
              }
            />
            <div className="border-t border-[#E8E2D9]">
              <div 
                onClick={exportAllData}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Download className="w-5 h-5 text-gray-400" />
                  <span className="text-sm font-medium text-[#1C1C1C]">Export All Data</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
            <div className="border-t border-[#E8E2D9]">
              <div
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-500">Clear History</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
            <div className="border-t border-[#E8E2D9]">
              <SettingsRow
                icon={Shield}
                label="Privacy Policy"
                control={<ExternalLink className="w-4 h-4 text-gray-400" />}
              />
            </div>
          </div>
        </motion.div>

        {/* Appearance Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase px-1 mb-2 mt-6">
            APPEARANCE
          </h3>
          <div className="bg-white rounded-2xl border border-[#E8E2D9] shadow-sm mb-2 p-4">
            <p className="font-medium text-[#1C1C1C] text-sm mb-3">Theme</p>
            <SegmentedControl
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark", disabled: true },
                { value: "system", label: "System", disabled: true },
              ]}
              value={settings.appearance.theme}
              onChange={(v) => updateAppearanceSetting("theme", v)}
            />
            <p className="text-xs text-gray-400 text-center mt-3">Dark & System modes coming soon</p>
          </div>
        </motion.div>

        {/* Account Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <h3 className="text-xs font-semibold tracking-widest text-gray-400 uppercase px-1 mb-2 mt-6">
            ACCOUNT
          </h3>
          <div className="bg-white rounded-2xl border border-[#E8E2D9] shadow-sm mb-2">
            <div 
              onClick={() => setShowChangePassword(true)}
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-[#1C1C1C]">Change Password</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
            <div className="border-t border-[#E8E2D9]">
              <div
                onClick={() => setShowDeleteAccountConfirm(true)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <XSquare className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-500">Delete Account</span>
                </div>
              </div>
            </div>
          </div>
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
            className="w-full py-3 px-4 border-2 border-red-400 text-red-500 rounded-xl font-medium hover:bg-red-50 active:bg-red-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
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
          <p className="text-center text-xs text-gray-400 mt-2">
            App Version 3.12.0 · Made with care for your cat
          </p>
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