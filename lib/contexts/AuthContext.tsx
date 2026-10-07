/**
 * AuthContext.tsx
 *
 * Synchronizes Firebase authentication, owner profiles, onboarding, and admin access.
 *
 * DONE: auth/profile synchronization and role-aware consumers
 * PLACEHOLDER: none
 *
 * NEXT: authentication owners keep claim refresh behavior aligned with admin APIs.
 */

"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/configs/firebase";
import { resolveAdminClaim } from "@/lib/utils/adminClaims";
import { resolveOnboardingComplete } from "@/lib/utils/onboardingState";

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
  const [, forceUserRefresh] = useState(0);
  const authResolutionRef = useRef(0);

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
    return profileOnboardingComplete;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const resolution = ++authResolutionRef.current;
      setLoading(true);
      setUser(currentUser);
      setIsAdmin(false);
      setProfileLoading(Boolean(currentUser));

      if (currentUser) {
        const [profileComplete, adminClaim] = await Promise.all([
          loadUserProfile(currentUser),
          resolveAdminClaim(currentUser).catch((error) => {
            console.error("Error checking admin claim:", error);
            return false;
          }),
        ]);
        if (resolution !== authResolutionRef.current) return;
        setOnboardingComplete(profileComplete);
        setIsAdmin(adminClaim);
        setProfileLoading(false);
      } else {
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
      const currentUser = auth.currentUser;
      const [profileComplete, adminClaim] = await Promise.all([
        loadUserProfile(currentUser),
        resolveAdminClaim(currentUser, true).catch((error) => {
          console.error("Error refreshing admin claim:", error);
          return false;
        }),
      ]);
      setUser(currentUser);
      setOnboardingComplete(profileComplete);
      setIsAdmin(adminClaim);
      forceUserRefresh((revision) => revision + 1);
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
