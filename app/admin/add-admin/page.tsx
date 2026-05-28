"use client";

import { useState, useEffect, type ReactNode, type SyntheticEvent } from "react";
import {
  UserPlus, Trash2, Mail, ShieldAlert, Loader2, Key,
  Eye, EyeOff, Lock, X, CheckCircle,
} from "lucide-react";
import { ToastContainer } from "@/components/ui/Toast";
import {
  collection, doc, setDoc, getDocs, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword, signOut,
  reauthenticateWithCredential, EmailAuthProvider, updatePassword,
} from "firebase/auth";
import { db, auth, firebaseConfig } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";

interface AdminRecord {
  email: string;
  addedAt?: unknown;
  addedBy?: string;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const getErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

// ─── Reusable password input with show/hide toggle ───────────────────────────
function PasswordInput({
  id, value, onChange, placeholder, required, minLength, label,
  icon: Icon = Key,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  label: string;
  icon?: React.ElementType;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-litter-text mb-1">
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon className="w-4 h-4 text-litter-muted" />
        </div>
        <input
          type={show ? "text" : "password"}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 bg-litter-bg border border-litter-border rounded-xl text-sm text-litter-text placeholder:text-litter-muted focus:outline-none focus:ring-2 focus:ring-litter-primary/50 focus:border-litter-primary transition-colors"
          required={required}
          minLength={minLength}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-litter-muted hover:text-litter-text transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Change Password Modal ────────────────────────────────────────────────────
// Both self and other admins require Current Password verification.
// isSelf=true  → reauthenticate current user (client-side)
// isSelf=false → verify via secondary app sign-in, then update via Admin SDK API
function ChangePasswordModal({
  adminEmail,
  isSelf,
  onClose,
}: {
  adminEmail: string;
  isSelf: boolean;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const passwordsMatch = newPassword !== "" && confirmPassword !== "" && newPassword === confirmPassword;
  const canSubmit = currentPassword !== "" && newPassword.length >= 8 && passwordsMatch;

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      if (isSelf) {
        // Client-side: re-authenticate then update own password
        const currentUser = auth.currentUser;
        if (!currentUser?.email) throw new Error("Not signed in.");
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
      } else {
        // Verify the target admin's current password first via a secondary app sign-in
        const secondaryApp =
          getApps().find((app) => app.name === "Secondary") ||
          initializeApp(firebaseConfig, "Secondary");
        const secondaryAuth = getAuth(secondaryApp);

        try {
          const { signInWithEmailAndPassword } = await import("firebase/auth");
          await signInWithEmailAndPassword(secondaryAuth, adminEmail, currentPassword);
          await signOut(secondaryAuth); // sign out immediately after verification
        } catch (verifyErr: unknown) {
          const code = getErrorCode(verifyErr);
          if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
            setError("Current password is incorrect.");
          } else if (code === "auth/too-many-requests") {
            setError("Too many failed attempts. Please try again later.");
          } else {
            setError("Failed to verify current password.");
          }
          return;
        }

        // Current password verified — update via Admin SDK API route
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("Not signed in.");
        const idToken = await currentUser.getIdToken();

        const res = await fetch("/api/admin/update-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, targetEmail: adminEmail, newPassword }),
        });

        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to update password.");
      }

      setSuccess(true);
    } catch (err: unknown) {
      const code = getErrorCode(err);
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setError("Current password is incorrect.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(getErrorMessage(err, "Failed to update password."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-litter-card rounded-2xl border border-litter-border shadow-xl w-full max-w-sm p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display font-semibold text-litter-text text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-litter-primary" />
              {isSelf ? "Change Your Password" : "Reset Admin Password"}
            </h2>
            <p className="text-xs text-litter-muted mt-0.5 truncate max-w-[220px]">{adminEmail}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-litter-muted hover:text-litter-text hover:bg-litter-bg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle className="w-10 h-10 text-litter-normal" />
            <p className="font-medium text-litter-text">Password updated successfully!</p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 bg-litter-primary text-white rounded-xl text-sm font-medium hover:bg-litter-primary-dark transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-litter-danger-bg text-litter-danger-text p-3 rounded-xl text-sm border border-litter-danger/20 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <PasswordInput
              id="currentPassword"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Enter current password"
              label="Current Password"
              icon={Lock}
              required
            />

            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="Minimum 8 characters"
              label="New Password"
              icon={Key}
              required
              minLength={8}
            />

            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Re-enter new password"
              label="Confirm New Password"
              icon={Key}
              required
              minLength={8}
            />

            {/* Live match indicator */}
            {newPassword && confirmPassword && (
              <p className={`text-xs flex items-center gap-1.5 ${passwordsMatch ? "text-litter-normal" : "text-litter-danger"}`}>
                {passwordsMatch
                  ? <><CheckCircle className="w-3.5 h-3.5" /> Passwords match</>
                  : <><X className="w-3.5 h-3.5" /> Passwords do not match</>}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 border border-litter-border text-litter-text rounded-xl text-sm font-medium hover:bg-litter-bg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="flex-1 py-2.5 bg-litter-primary text-white rounded-xl text-sm font-medium hover:bg-litter-primary-dark transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AddAdminPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [fetchingAdmins, setFetchingAdmins] = useState(true);
  const [changingPasswordFor, setChangingPasswordFor] = useState<string | null>(null);

  // ── Toast state ────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "error" | "info" | "warning" }>>([]);

  const showToast = (message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchAdmins = async () => {
    setFetchingAdmins(true);
    try {
      const snapshot = await getDocs(collection(db, "admins"));
      const adminList = snapshot.docs.map((d) => ({
        email: d.id,
        ...d.data(),
      })) as AdminRecord[];
      setAdmins(adminList);
    } catch (err: unknown) {
      console.error("Failed to fetch admins:", err);
      if (getErrorMessage(err, "").includes("Missing or insufficient permissions")) {
        showToast("Missing permissions. Please run 'firebase deploy --only firestore:rules'.", "error");
      } else {
        showToast("Failed to load current admins.", "error");
      }
    } finally {
      setFetchingAdmins(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleAddAdmin = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const emailLower = email.trim().toLowerCase();
    if (!emailLower.includes("@")) { showToast("Please enter a valid email address.", "error"); return; }
    if (password.length < 8) { showToast("Password must be at least 8 characters.", "error"); return; }

    setLoading(true);
    try {
      const secondaryApp =
        getApps().find((app) => app.name === "Secondary") ||
        initializeApp(firebaseConfig, "Secondary");
      const secondaryAuth = getAuth(secondaryApp);

      try {
        await createUserWithEmailAndPassword(secondaryAuth, emailLower, password);
        await signOut(secondaryAuth);
      } catch (authErr: unknown) {
        if (getErrorCode(authErr) === "auth/email-already-in-use") {
          console.log("User already exists, granting admin access...");
        } else {
          throw authErr;
        }
      }

      await setDoc(doc(db, "admins", emailLower), {
        email: emailLower,
        addedAt: serverTimestamp(),
        addedBy: user?.email ?? "Unknown",
      });

      showToast(`Admin access granted to ${emailLower}.`, "success");
      setEmail("");
      setPassword("");
      fetchAdmins();
    } catch (err: unknown) {
      console.error("Failed to add admin:", err);
      showToast(getErrorMessage(err, "Failed to add admin."), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAdmin = async (adminEmail: string) => {
    if (adminEmail === "maclaurenz.cultura@gmail.com") { showToast("Cannot remove the master admin account.", "error"); return; }
    if (adminEmail === user?.email) { showToast("You cannot remove yourself.", "error"); return; }
    if (!confirm(`Are you sure you want to revoke admin access for ${adminEmail}?`)) return;
    try {
      await deleteDoc(doc(db, "admins", adminEmail));
      showToast(`Revoked admin access for ${adminEmail}.`, "success");
      fetchAdmins();
    } catch (err) {
      console.error("Failed to remove admin:", err);
      showToast("Failed to remove admin.", "error");
    }
  };

  let adminsContent: ReactNode;

  if (fetchingAdmins) {
    adminsContent = (
      <div className="p-8 text-center text-litter-muted">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        <p className="text-sm">Loading administrators...</p>
      </div>
    );
  } else if (admins.length === 0) {
    adminsContent = (
      <div className="p-8 text-center text-litter-muted text-sm">No extra admins found.</div>
    );
  } else {
    adminsContent = admins.map((admin) => (
      <div
        key={admin.email}
        className="p-4 sm:px-6 flex items-center justify-between hover:bg-litter-bg/50 transition-colors"
      >
        {/* Avatar + info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-litter-primary-light flex items-center justify-center shrink-0">
            <span className="text-litter-primary font-bold text-sm">
              {admin.email.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-sm text-litter-text">{admin.email}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {/* Change / Reset password — visible on every row */}
          <button
            onClick={() => setChangingPasswordFor(admin.email)}
            className="p-2 text-litter-muted hover:text-litter-primary hover:bg-litter-primary-light rounded-lg transition-colors"
            title={admin.email === user?.email ? "Change your password" : "Reset admin password"}
          >
            <Key className="w-4 h-4" />
          </button>

          {/* Remove admin */}
          {admin.email !== "maclaurenz.cultura@gmail.com" && admin.email !== user?.email && (
            <button
              onClick={() => handleRemoveAdmin(admin.email)}
              className="p-2 text-litter-muted hover:text-litter-danger hover:bg-litter-danger-bg rounded-lg transition-colors"
              title="Revoke Access"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    ));
  }

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 overflow-auto">
      <ToastContainer toasts={toasts} onClose={dismissToast} />

      <div>
        <h1 className="font-display font-bold text-2xl text-litter-text">Manage Administrators</h1>
        <p className="text-sm text-litter-muted mt-0.5">Create new admin accounts and manage dashboard access</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Create Admin Form ──────────────────────────────────────── */}
        <div className="lg:col-span-1 bg-litter-card rounded-2xl border border-litter-border shadow-sm p-6 h-fit">
          <h2 className="font-display font-semibold text-litter-text text-base mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-litter-primary" />
            Create Admin Account
          </h2>

          <form onSubmit={handleAddAdmin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-litter-text mb-1">
                Admin Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="w-4 h-4 text-litter-muted" />
                </div>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-litter-bg border border-litter-border rounded-xl text-sm text-litter-text placeholder:text-litter-muted focus:outline-none focus:ring-2 focus:ring-litter-primary/50 focus:border-litter-primary transition-colors"
                  required
                />
              </div>
            </div>

            <PasswordInput
              id="createPassword"
              value={password}
              onChange={setPassword}
              placeholder="Minimum 8 characters"
              label="Password"
              icon={Key}
              required
              minLength={8}
            />

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-litter-primary hover:bg-litter-primary-dark text-white font-medium py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Account & Grant Access"}
            </button>
          </form>
        </div>

        {/* ── Current Admins List ────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-litter-card rounded-2xl border border-litter-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-litter-border">
            <h2 className="font-display font-semibold text-litter-text text-base">Current Administrators</h2>
          </div>
          <div className="divide-y divide-litter-border">{adminsContent}</div>
        </div>
      </div>

      {/* ── Change / Reset Password Modal ─────────────────────────────── */}
      {changingPasswordFor && (
        <ChangePasswordModal
          adminEmail={changingPasswordFor}
          isSelf={changingPasswordFor === user?.email}
          onClose={() => setChangingPasswordFor(null)}
        />
      )}
    </main>
  );
}
