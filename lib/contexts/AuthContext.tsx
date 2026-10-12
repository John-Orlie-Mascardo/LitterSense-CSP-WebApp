/**
 * AuthContext.tsx
 *
 * Synchronizes Firebase authentication, owner profiles, onboarding, and admin access.
 *
 * DONE: auth/profile synchronization and role-aware consumers
 * PLACEHOLDER: none
 *
 * Admin authorization uses refreshed Firebase custom claims.
 */

"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "@/lib/utils/operationalClient";
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
  const mounted = useRef(false);
  const ownerUid = useRef<string | null>(null);
  const authGeneration = useRef(0);
  const profileGeneration = useRef(0);
  const refreshGeneration = useRef(0);
  const claimGeneration = useRef(0);

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

  const loadAdminStatus = useCallback(async (currentUser: User, forceRefresh = false) => {
    try {
      return forceRefresh ? await resolveAdminClaim(currentUser, true) : await resolveAdminClaim(currentUser);
    } catch (error) {
      console.error("Error checking admin claim:", error);
      return false;
    }
  }, []);

  const isCurrentOwner = useCallback((uid: string, generation: number) => (
    mounted.current
    && authGeneration.current === generation
    && ownerUid.current === uid
    && auth.currentUser?.uid === uid
  ), []);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const generation = ++authGeneration.current;
      const profileRequest = ++profileGeneration.current;
      const claimRequest = ++claimGeneration.current;
      ownerUid.current = currentUser?.uid ?? null;
      setUser(currentUser);
      setLoading(Boolean(currentUser));
      setProfileLoading(Boolean(currentUser));
      setIsAdmin(false);
      setOnboardingComplete(true);

      if (currentUser) {
        const [profileComplete, admin] = await Promise.all([
          loadUserProfile(currentUser),
          loadAdminStatus(currentUser),
        ]);
        if (!isCurrentOwner(currentUser.uid, generation)) return;
        if (claimGeneration.current === claimRequest) setIsAdmin(admin);
        // A successful refresh can replace the initial profile while its role
        // lookup is still pending. Only the latest profile read may publish it.
        if (profileGeneration.current === profileRequest) {
          setOnboardingComplete(profileComplete);
          setProfileLoading(false);
        }
      } else {
        setProfileLoading(false);
      }

      setLoading(false);
    });

    return () => {
      mounted.current = false;
      authGeneration.current += 1;
      unsubscribe();
    };
  }, [isCurrentOwner, loadAdminStatus, loadUserProfile]);

  const refreshUser = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const generation = authGeneration.current;
    const refreshRequest = ++refreshGeneration.current;
    await currentUser.reload();
    if (!isCurrentOwner(currentUser.uid, generation)
      || refreshGeneration.current !== refreshRequest) return;
    setUser(currentUser);
    forceUserRefresh((revision) => revision + 1);
    const profileRequest = ++profileGeneration.current;
    const claimRequest = ++claimGeneration.current;
    const [profileComplete, adminClaim] = await Promise.all([loadUserProfile(currentUser), loadAdminStatus(currentUser, true)]);
    if (!isCurrentOwner(currentUser.uid, generation)
      || profileGeneration.current !== profileRequest) return;
    if (claimGeneration.current === claimRequest) setIsAdmin(adminClaim);
    setOnboardingComplete(profileComplete);
    setProfileLoading(false);
  }, [isCurrentOwner, loadAdminStatus, loadUserProfile]);

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
