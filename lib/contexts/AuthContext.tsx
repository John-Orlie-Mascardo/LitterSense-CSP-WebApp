"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/configs/firebase";

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
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  refreshUser: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        if (DEV_ADMIN_OVERRIDE || (currentUser.email && ADMIN_EMAILS.includes(currentUser.email))) {
          setIsAdmin(true);
        } else {
          // Real path: check custom claims set by the backend
          const tokenResult = await currentUser.getIdTokenResult();
          setIsAdmin(tokenResult.claims?.role === "admin");
        }
      } else {
        setIsAdmin(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUser({ ...auth.currentUser });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
