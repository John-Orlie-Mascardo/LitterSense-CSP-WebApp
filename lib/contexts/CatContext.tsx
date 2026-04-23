"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import type { Cat, CatStats, CatDetails } from "@/lib/data/mockData";

interface FirebaseCatStatsDoc {
  catId?: string;
  date: string;
  visits: number;
  totalDurationSecs: number;
  lastVisit: string;
  updatedAt?: string;
}

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
  recordVisit: (catId: string, durationSecs: number) => Promise<void>;
  isLoading: boolean;
}

const CatContext = createContext<CatContextType | undefined>(undefined);

export function CatProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid;
  const [cats, setCats] = useState<Cat[]>([]);
  const [catStats, setCatStats] = useState<Record<string, CatStats>>({});
  const [catDetails, setCatDetails] = useState<Record<string, CatDetails>>({});
  const [firebaseCatStats, setFirebaseCatStats] = useState<Record<string, FirebaseCatStatsDoc>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // While auth is still resolving, keep loading
    if (authLoading) return;

    // No user logged in — clear all cat data
    if (!uid) {
      queueMicrotask(() => {
        setCats([]);
        setCatStats({});
        setCatDetails({});
        setFirebaseCatStats({});
        setIsLoading(false);
      });
      return;
    }

    queueMicrotask(() => setIsLoading(true));

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

    const today = new Date().toISOString().split("T")[0];
    const unsubCatStats = onSnapshot(
      collection(db, "users", uid, "dailyCatStats", today, "cats"),
      (snapshot) => {
        const loaded: Record<string, FirebaseCatStatsDoc> = {};
        snapshot.forEach((d) => {
          loaded[d.id] = d.data() as FirebaseCatStatsDoc;
        });
        setFirebaseCatStats(loaded);
      },
      (error) => {
        console.error("Failed to sync cat stats:", error);
      }
    );

    return () => {
      unsubCats();
      unsubDetails();
      unsubCatStats();
    };
  }, [uid, authLoading]);

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

  const recordVisit = async (catId: string, durationSecs: number) => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    const dailyRef = doc(db, "users", user.uid, "dailyCatStats", today, "cats", catId);
    const catDailyRef = doc(db, "users", user.uid, "catStats", catId, "daily", today);
    const summaryRef = doc(db, "users", user.uid, "catStats", catId);
    const lastVisit = new Date().toISOString();

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(dailyRef);
      const existing = snapshot.exists()
        ? (snapshot.data() as FirebaseCatStatsDoc)
        : null;
      const nextStats = {
        catId,
        date: today,
        visits: (existing?.visits ?? 0) + 1,
        totalDurationSecs: (existing?.totalDurationSecs ?? 0) + durationSecs,
        lastVisit,
        updatedAt: lastVisit,
      };

      transaction.set(dailyRef, nextStats);
      transaction.set(catDailyRef, nextStats);
      transaction.set(summaryRef, nextStats);
    });
  };

  const getCatById = (id: string) => cats.find((cat) => cat.id === id);

  const getStatsByCatId = (id: string): CatStats | undefined => {
    const today = new Date().toISOString().split("T")[0];
    const fb = firebaseCatStats[id];
    if (fb && fb.date === today) {
      const avgSecs = fb.visits > 0 ? Math.round(fb.totalDurationSecs / fb.visits) : 0;
      const m = Math.floor(avgSecs / 60);
      const s = avgSecs % 60;
      const avgDuration = fb.visits === 0 ? "--" : s > 0 ? `${m}m ${s}s` : `${m}m`;
      return {
        visits: fb.visits,
        avgDuration,
        airQuality: "Normal",
        litterLevel: 68,
        lastVisit: fb.lastVisit,
      };
    }
    return catStats[id] ?? {
      visits: 0,
      avgDuration: "--",
      airQuality: "Normal",
      litterLevel: 0,
      lastVisit: "",
    };
  };

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
        recordVisit,
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
