"use client";

import { useState, useEffect, type ReactNode } from "react";
import { UserPlus, Trash2, Mail, ShieldAlert, Loader2, Key } from "lucide-react";
import { collection, doc, setDoc, getDocs, deleteDoc, serverTimestamp } from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { db, firebaseConfig } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";

interface AdminRecord {
  email: string;
  addedAt?: unknown;
  addedBy?: string;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const getErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

export default function AddAdminPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [fetchingAdmins, setFetchingAdmins] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchAdmins = async () => {
    setFetchingAdmins(true);
    try {
      const snapshot = await getDocs(collection(db, "admins"));
      const adminList = snapshot.docs.map(doc => ({
        email: doc.id,
        ...doc.data()
      })) as AdminRecord[];
      setAdmins(adminList);
    } catch (err: unknown) {
      console.error("Failed to fetch admins:", err);
      // Determine if it's a permissions issue or something else
      if (getErrorMessage(err, "").includes("Missing or insufficient permissions")) {
        setError("Missing permissions. Please ensure you have run 'firebase deploy --only firestore:rules' in your terminal.");
      } else {
        setError("Failed to load current admins. Ensure your permissions are correct.");
      }
    } finally {
      setFetchingAdmins(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleAddAdmin = async (e: SubmitEvent) => {
    e.preventDefault();
    const emailLower = email.trim().toLowerCase();

    if (!emailLower.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // 1. Initialize a secondary Firebase app to create the user without signing out the current admin
      const secondaryApp = getApps().find(app => app.name === "Secondary") || initializeApp(firebaseConfig, "Secondary");
      const secondaryAuth = getAuth(secondaryApp);

      try {
        await createUserWithEmailAndPassword(secondaryAuth, emailLower, password);
        await signOut(secondaryAuth); // immediately sign out of the secondary instance
      } catch (authErr: unknown) {
        if (getErrorCode(authErr) === "auth/email-already-in-use") {
          // If the user already exists, we can still proceed to just grant them admin access
          console.log("User already exists in Firebase Auth, proceeding to grant admin access...");
        } else {
          throw authErr;
        }
      }

      // 2. Add the user to the `admins` collection in Firestore
      await setDoc(doc(db, "admins", emailLower), {
        email: emailLower,
        addedAt: serverTimestamp(),
        addedBy: user?.email || "Unknown"
      });

      setSuccess(`Successfully created account and granted admin access to ${emailLower}.`);
      setEmail("");
      setPassword("");
      fetchAdmins(); // Refresh the list
    } catch (err: unknown) {
      console.error("Failed to add admin:", err);
      setError(getErrorMessage(err, "Failed to add admin. They may already be an admin or you lack permission."));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAdmin = async (adminEmail: string) => {
    if (adminEmail === "maclaurenz.cultura@gmail.com") {
      setError("Cannot remove the master admin account.");
      return;
    }

    if (adminEmail === user?.email) {
      setError("You cannot remove yourself.");
      return;
    }

    if (!confirm(`Are you sure you want to revoke admin access for ${adminEmail}?`)) return;

    try {
      await deleteDoc(doc(db, "admins", adminEmail));
      setSuccess(`Revoked admin access for ${adminEmail}.`);
      fetchAdmins();
    } catch (err) {
      console.error("Failed to remove admin:", err);
      setError("Failed to remove admin.");
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
      <div className="p-8 text-center text-litter-muted text-sm">
        No extra admins found.
      </div>
    );
  } else {
    adminsContent = admins.map((admin) => (
      <div key={admin.email} className="p-4 sm:px-6 flex items-center justify-between hover:bg-litter-bg/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-litter-primary-light flex items-center justify-center shrink-0">
            <span className="text-litter-primary font-bold text-sm">
              {admin.email.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-sm text-litter-text">{admin.email}</p>
            {admin.addedBy && (
              <p className="text-xs text-litter-muted mt-0.5">
                Added by {admin.addedBy}
              </p>
            )}
          </div>
        </div>

        {admin.email !== "maclaurenz.cultura@gmail.com" && admin.email !== user?.email && (
          <button
            onClick={() => handleRemoveAdmin(admin.email)}
            className="p-2 text-litter-muted hover:text-status-danger hover:bg-red-50 rounded-lg transition-colors"
            title="Revoke Access"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    ));
  }

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 overflow-auto">
      <div>
        <h1 className="font-display font-bold text-2xl text-litter-text">
          Manage Administrators
        </h1>
        <p className="text-sm text-litter-muted mt-0.5">
          Create new admin accounts and manage dashboard access
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-100 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm border border-green-100">
          <p>{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Admin Form */}
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-litter-text mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key className="w-4 h-4 text-litter-muted" />
                </div>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full pl-10 pr-4 py-2.5 bg-litter-bg border border-litter-border rounded-xl text-sm text-litter-text placeholder:text-litter-muted focus:outline-none focus:ring-2 focus:ring-litter-primary/50 focus:border-litter-primary transition-colors"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-litter-primary hover:bg-litter-primary-dark text-white font-medium py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Create Account & Grant Access"
              )}
            </button>
          </form>
        </div>

        {/* Current Admins List */}
        <div className="lg:col-span-2 bg-litter-card rounded-2xl border border-litter-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-litter-border">
            <h2 className="font-display font-semibold text-litter-text text-base">
              Current Administrators
            </h2>
          </div>

          <div className="divide-y divide-litter-border">
            {adminsContent}
          </div>
        </div>
      </div>
    </main>
  );
}
