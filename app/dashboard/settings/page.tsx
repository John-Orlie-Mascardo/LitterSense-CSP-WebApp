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
  AlertTriangle,
  Clock,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { Toggle } from "@/components/ui/Toggle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastContainer } from "@/components/ui/Toast";
import { type ToastParams } from "@/lib/interfaces/ToastParams";
import { useSettings } from "@/lib/hooks/useSettings";
import { useDeleteRequest } from "@/lib/contexts/DeleteRequestContext";
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

  const [toasts, setToasts] = useState<Omit<ToastParams, "onClose">[]>([]);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteRequestSheet, setShowDeleteRequestSheet] = useState(false);
  const [showDeleteFinalConfirm, setShowDeleteFinalConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  // Data Retention dropdown
  const [showRetentionDropdown, setShowRetentionDropdown] = useState(false);
  const [selectedRetention, setSelectedRetention] = useState("30 Days");

  const { user, refreshUser } = useAuth();
  const { getUserRequest, submitRequest } = useDeleteRequest();
  const userRequest = user ? getUserRequest(user.uid) : undefined;

  const handleSubmitDeletion = () => {
    if (!user) return;
    submitRequest(
      user.uid,
      user.displayName || user.email?.split("@")[0] || "User",
      user.email || "",
      deleteReason || "No reason provided"
    );
    setDeleteReason("");
    addToast("Deletion request submitted. An admin will review it soon.", "info");
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
      window.location.reload();
    } catch (e) {
      const message =
        e instanceof FirebaseError ? e.message : "Failed to update profile";
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
    } catch (e) {
      if (e instanceof FirebaseError) {
        if (
          e.code === "auth/wrong-password" ||
          e.code === "auth/invalid-credential"
        ) {
          addToast("Current password is incorrect", "error");
        } else {
          addToast(e.message || "Failed to change password", "error");
        }
      } else {
        addToast("Failed to change password", "error");
      }
    }
  };

  const handleClearHistory = () => {
    clearAllData();
    setShowClearConfirm(false);
    addToast("All session history cleared", "info");
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut(auth);
      setShowSignOutConfirm(false);
      router.push("/login");
    } catch (e) {
      const message =
        e instanceof FirebaseError ? e.message : "Failed to sign out";
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
            <div className="w-16 h-16 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-2xl shrink-0 overflow-hidden">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
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
              {!userRequest ? (
                /* No request yet — show action button */
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
                /* Pending — amber status card */
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
                /* Approved — red status card */
                <div className="p-4">
                  <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-700 dark:text-red-400">Deletion Approved</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 leading-relaxed">
                        Your account has been approved for deletion and will be permanently removed shortly.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Rejected — neutral card with re-request option */
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
                  <img src={editProfileForm.photo} alt="Preview" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-display font-bold text-litter-primary">
                    {(editProfileForm.displayName || "U").charAt(0).toUpperCase()}
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
      {/* Step 1 — Reason sheet */}
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
                <li>• Your account and all cat profiles will be permanently deleted</li>
                <li>• All monitoring history and health logs will be lost</li>
                <li>• This action cannot be undone once an admin processes it</li>
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
              onChange={(e) => setDeleteReason(e.target.value)}
              className="input-base w-full px-4 py-3 rounded-xl border border-litter-border text-sm focus:outline-none focus:border-litter-primary focus:ring-2 focus:ring-litter-primary/10 transition-all"
            >
              <option value="">Select a reason…</option>
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

      {/* Step 2 — Final confirmation */}
      <ConfirmDialog
        isOpen={showDeleteFinalConfirm}
        onClose={() => setShowDeleteFinalConfirm(false)}
        onConfirm={handleSubmitDeletion}
        title="Submit Deletion Request?"
        message="An admin will review your request. You can continue using the app until it's processed. This does not immediately delete your account."
        confirmText="Submit Request"
        variant="danger"
      />
      <ConfirmDialog isOpen={showSignOutConfirm} onClose={() => setShowSignOutConfirm(false)} onConfirm={handleSignOut}
        title="Sign Out" message="Are you sure you want to sign out?" confirmText="Sign Out" variant="info" />
    </div>
  );
}