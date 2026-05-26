"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/configs/firebase";
import { resolveOnboardingComplete } from "@/lib/utils/onboardingState";

// TEMP (DEV ONLY): hardcoded to true so all logged-in accounts can access the
// admin page during UI/UX review. Remove this line and the DEV_ADMIN_OVERRIDE
// branch below once the backend is ready.
//
// TODO (backend): to properly restrict admin access —
//   1. Use a Firebase Admin SDK Cloud Function to set a custom claim on the
//      user's token: admin.auth().setCustomUserClaims(uid, { role: "admin" })
//   2. The user must sign out and back in (or call getIdToken(true)) to refresh
//      their token so the new claim is picked up.
//   3. Delete the line below and set NEXT_PUBLIC_DEV_ADMIN=false (or remove it)
//      so the real claim-check path below takes over.
const DEV_ADMIN_OVERRIDE = false;
const ADMIN_EMAILS = ["maclaurenz.cultura@gmail.com"];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  profileLoading: boolean;
  isAdmin: boolean;
  onboardingComplete: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  profileLoading: true,
  isAdmin: false,
  onboardingComplete: true,
  refreshUser: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(true);

  const loadUserProfile = useCallback(async (currentUser: User) => {
    let profileOnboardingComplete = true;
    try {
      const userDocSnap = await getDoc(doc(db, "users", currentUser.uid));
      profileOnboardingComplete = resolveOnboardingComplete(
        userDocSnap.data()?.onboardingComplete,
      );
    } catch (error) {
      console.error("Error checking user profile:", error);
    }
    setOnboardingComplete(profileOnboardingComplete);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setProfileLoading(Boolean(currentUser));

      if (currentUser) {
        await loadUserProfile(currentUser);

        if (DEV_ADMIN_OVERRIDE || (currentUser.email && ADMIN_EMAILS.includes(currentUser.email))) {
          setIsAdmin(true);
        } else if (currentUser.email) {
          try {
            const adminDocRef = doc(db, "admins", currentUser.email);
            const adminDocSnap = await getDoc(adminDocRef);
            setIsAdmin(adminDocSnap.exists());
          } catch (error) {
            console.error("Error checking admin status:", error);
            setIsAdmin(false);
          }
        } else {
          setIsAdmin(false);
        }
        setProfileLoading(false);
      } else {
        setIsAdmin(false);
        setOnboardingComplete(true);
        setProfileLoading(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadUserProfile]);

  const refreshUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUser({ ...auth.currentUser });
      await loadUserProfile(auth.currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        profileLoading,
        isAdmin,
        onboardingComplete,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
