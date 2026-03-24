"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import {
  Database,
  LogOut,
  ChevronRight,
  Lock,
  Shield,
  Upload,
  Loader2,
  Activity,
  Trash2,
  ChevronDown,
  Download,
  History,
  XSquare,
  ExternalLink,
  Check,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { Toggle } from "@/components/ui/Toggle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastContainer, type ToastProps } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/useSettings";
import { generateId } from "@/lib/utils/formatters";

const RETENTION_OPTIONS = ["7 Days", "14 Days", "21 Days", "30 Days"];

export default function SettingsPage() {
  const router = useRouter();
  const {
    settings,
    updateNotificationSetting,
    updateAppearanceSetting,
    updateAccountSetting,
    clearAllData,
    exportAllData,
  } = useSettings();
  const { theme, setTheme } = useTheme();

  const [toasts, setToasts] = useState<Omit<ToastProps, "onClose">[]>([]);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  // Data Retention dropdown
  const [showRetentionDropdown, setShowRetentionDropdown] = useState(false);
  const [selectedRetention, setSelectedRetention] = useState("30 Days");

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
    if (/\d/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    const labels = ["Weak", "Fair", "Good", "Strong"];
    return { strength, label: labels[strength - 1] || "Too short" };
  };

  const passwordStrength = getPasswordStrength(passwordForm.new);

  return (
    <div className="min-h-screen bg-litter-bg pb-24">
      <TopBar />
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-lg mx-auto">

        {/* User Profile Card */}
        <section className="bg-litter-card rounded-2xl p-4 shadow-sm border border-litter-border mb-2 mt-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-2xl shrink-0">
              {settings.account.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <h2 className="font-display font-semibold text-lg text-litter-text truncate">
                {settings.account.displayName}
              </h2>
              <p className="text-sm text-theme-muted truncate">{settings.account.email}</p>
            </div>
            <button
              onClick={() => setShowEditProfile(true)}
              className="border border-litter-primary text-litter-primary bg-litter-primary-light rounded-full px-3 py-1 text-sm font-medium hover:bg-litter-primary-light transition-colors shrink-0"
            >
              Edit Profile
            </button>
          </div>
        </section>

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
          </div>
        </div>

        {/* Data & Privacy Section */}
        <div>
          <h3 className="font-body text-xs font-semibold tracking-widest text-theme-muted uppercase px-1 mb-2 mt-6">
            DATA & PRIVACY
          </h3>
          <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm mb-2">

            {/* Data Retention — interactive dropdown */}
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
                    className={`w-4 h-4 text-theme-muted transition-transform duration-200 ${
                      showRetentionDropdown ? "rotate-180" : ""
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
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-theme-overlay ${
                        selectedRetention === option
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
                onClick={exportAllData}
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
                onClick={() => setShowClearConfirm(true)}
                className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-theme-hover transition-colors bg-transparent border-none text-left"
              >
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-500">Clear History</span>
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
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
              value={theme || settings.appearance.theme}
              onChange={(v) => {
                updateAppearanceSetting("theme", v as any);
                setTheme(v);
              }}
            />
          </div>
        </div>

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
              <button
                onClick={() => setShowDeleteAccountConfirm(true)}
                className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-theme-hover transition-colors bg-transparent border-none text-left"
              >
                <div className="flex items-center gap-3">
                  <XSquare className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-500">Delete Account</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Sign Out Button */}
        <div className="mt-6 mb-8">
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
          <p className="text-center text-xs text-theme-muted mt-2">
            App Version 3.12.0 · Made with care for your cat
          </p>
        </div>
      </main>

      {/* Backdrop — closes dropdown when clicking outside */}
      {showRetentionDropdown && (
        <button
          className="fixed inset-0 z-10"
          onClick={() => setShowRetentionDropdown(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Space" || e.key === "Escape") {
              setShowRetentionDropdown(false);
            }
          }}
          aria-label="Close dropdown"
          style={{ background: 'transparent', border: 'none', padding: 0, margin: 0 }}
        />
      )}

      <BottomNav />

      {/* Edit Profile Bottom Sheet */}
      <BottomSheet isOpen={showEditProfile} onClose={() => setShowEditProfile(false)} title="Edit Profile">
        <div className="space-y-5">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-litter-primary-light flex items-center justify-center overflow-hidden">
                {editProfileForm.photo ? (
                  <img src={editProfileForm.photo} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-display font-bold text-litter-primary">
                    {editProfileForm.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-litter-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-[#165a4e] transition-colors shadow-md">
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
              onChange={(e) => setEditProfileForm((prev) => ({ ...prev, displayName: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-litter-border focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
          </div>
          <button onClick={handleSaveProfile} className="w-full px-4 py-3 rounded-xl bg-litter-primary text-white font-medium hover:bg-[#165a4e] transition-colors">
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
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, current: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-litter-border focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-theme-secondary mb-1.5">New Password</label>
            <input id="newPassword" type="password" value={passwordForm.new}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, new: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-litter-border focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
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
                    <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
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
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-litter-border focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={!passwordForm.current || !passwordForm.new || !passwordForm.confirm || passwordForm.new !== passwordForm.confirm}
            className="w-full px-4 py-3 rounded-xl bg-litter-primary text-white font-medium hover:bg-[#165a4e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Change Password
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
            className="w-full mt-6 px-4 py-3 rounded-xl bg-litter-primary text-white font-medium hover:bg-[#165a4e] transition-colors"
          >
            Close
          </button>
        </div>
      </BottomSheet>

      {/* Confirm Dialogs */}
      <ConfirmDialog isOpen={showClearConfirm} onClose={() => setShowClearConfirm(false)} onConfirm={handleClearHistory}
        title="Clear History" message="Are you sure? This will permanently delete all session data for all cats. This cannot be undone." confirmText="Clear" variant="danger" />
      <ConfirmDialog isOpen={showDeleteAccountConfirm} onClose={() => setShowDeleteAccountConfirm(false)}
        onConfirm={() => { setShowDeleteAccountConfirm(false); addToast("Account deletion request submitted", "info"); }}
        title="Delete Account" message="This will permanently delete your account and all data. This action cannot be undone. Please contact support to proceed." confirmText="Contact Support" variant="danger" />
      <ConfirmDialog isOpen={showSignOutConfirm} onClose={() => setShowSignOutConfirm(false)} onConfirm={handleSignOut}
        title="Sign Out" message="Are you sure you want to sign out?" confirmText="Sign Out" variant="info" />
    </div>
  );
}