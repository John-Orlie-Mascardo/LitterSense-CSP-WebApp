"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

// DEV ONLY: set NEXT_PUBLIC_DEV_ADMIN=true in .env.local to bypass admin check.
// When the backend ships custom claims, flip it to false and real path takes over.
const DEV_ADMIN_OVERRIDE = process.env.NEXT_PUBLIC_DEV_ADMIN === "true";

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
  refreshUser: async () => {},
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
        if (DEV_ADMIN_OVERRIDE) {
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
