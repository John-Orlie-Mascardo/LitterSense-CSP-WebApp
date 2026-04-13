"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import type { Cat, CatStats, CatDetails } from "@/lib/data/mockData";

interface CatContextType {
  cats: Cat[];
  catStats: Record<string, CatStats>;
  catDetails: Record<string, CatDetails>;
  addCat: (cat: Cat, stats?: CatStats, details?: CatDetails) => Promise<void>;
  removeCat: (id: string) => Promise<void>;
  updateCat: (id: string, updates: Partial<Cat>) => Promise<void>;
  updateDetails: (id: string, updates: Partial<CatDetails>) => Promise<void>;
  getCatById: (id: string) => Cat | undefined;
  getStatsByCatId: (id: string) => CatStats | undefined;
  getDetailsByCatId: (id: string) => CatDetails | undefined;
  isLoading: boolean;
}

const CatContext = createContext<CatContextType | undefined>(undefined);

export function CatProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [cats, setCats] = useState<Cat[]>([]);
  const [catStats, setCatStats] = useState<Record<string, CatStats>>({});
  const [catDetails, setCatDetails] = useState<Record<string, CatDetails>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // While auth is still resolving, keep loading
    if (authLoading) return;

    // No user logged in — clear all cat data
    if (!user) {
      setCats([]);
      setCatStats({});
      setCatDetails({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const uid = user.uid;

    // Real-time listener for the user's cats subcollection
    const unsubCats = onSnapshot(
      collection(db, "users", uid, "cats"),
      (snapshot) => {
        const loaded: Cat[] = [];
        snapshot.forEach((d) => loaded.push({ id: d.id, ...d.data() } as Cat));
        setCats(loaded);
        setIsLoading(false);
      },
      (error) => {
        console.error("Failed to sync cats:", error);
        setIsLoading(false);
      }
    );

    // Real-time listener for the user's catDetails subcollection
    const unsubDetails = onSnapshot(
      collection(db, "users", uid, "catDetails"),
      (snapshot) => {
        const loaded: Record<string, CatDetails> = {};
        snapshot.forEach((d) => {
          loaded[d.id] = d.data() as CatDetails;
        });
        setCatDetails(loaded);
      },
      (error) => {
        console.error("Failed to sync cat details:", error);
      }
    );

    return () => {
      unsubCats();
      unsubDetails();
    };
  }, [user?.uid, authLoading]);

  const addCat = async (cat: Cat, stats?: CatStats, details?: CatDetails) => {
    if (!user) return;
    const uid = user.uid;

    await setDoc(doc(db, "users", uid, "cats", cat.id), {
      name: cat.name,
      status: cat.status,
      avatar: cat.avatar,
      isOnline: cat.isOnline,
    });

    if (details) {
      await setDoc(doc(db, "users", uid, "catDetails", cat.id), details);
    }

    // Stats are device-driven — keep local only for now
    if (stats) {
      setCatStats((prev) => ({ ...prev, [cat.id]: stats }));
    }
  };

  const removeCat = async (id: string) => {
    if (!user) return;
    const uid = user.uid;

    await deleteDoc(doc(db, "users", uid, "cats", id));
    await deleteDoc(doc(db, "users", uid, "catDetails", id));

    setCatStats((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  const updateCat = async (id: string, updates: Partial<Cat>) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid, "cats", id), updates);
  };

  const updateDetails = async (id: string, updates: Partial<CatDetails>) => {
    if (!user) return;
    // merge: setDoc with merge option so partial updates don't wipe existing fields
    await setDoc(doc(db, "users", user.uid, "catDetails", id), updates, {
      merge: true,
    });
  };

  const getCatById = (id: string) => cats.find((cat) => cat.id === id);
  const getStatsByCatId = (id: string) => catStats[id];
  const getDetailsByCatId = (id: string) => catDetails[id];

  return (
    <CatContext.Provider
      value={{
        cats,
        catStats,
        catDetails,
        addCat,
        removeCat,
        updateCat,
        updateDetails,
        getCatById,
        getStatsByCatId,
        getDetailsByCatId,
        isLoading,
      }}
    >
      {children}
    </CatContext.Provider>
  );
}

export function useCats() {
  const context = useContext(CatContext);
  if (context === undefined) {
    throw new Error("useCats must be used within a CatProvider");
  }
  return context;
}
