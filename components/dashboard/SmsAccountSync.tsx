"use client";

import { useEffect } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";

export function SmsAccountSync() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let running = false;
    let dirty = false;
    let enabled = true;
    async function sync() {
      if (running || !enabled || controller.signal.aborted) return;
      running = true;
      dirty = false;
      try {
        const token = await user!.getIdToken();
        const response = await fetch("/api/sms/sync", {
          method: "POST", headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        });
        const result = await response.json();
        if (!response.ok) {
          if (result.error === "SMS backup storage is not configured") enabled = false;
          console.warn("SMS backup:", result.error);
          dirty = true;
        }
      } catch { dirty = true; }
      finally {
        running = false;
        if (dirty && enabled && !controller.signal.aborted) timer = setTimeout(sync, 60_000);
      }
    }
    function schedule() {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(sync, 1500);
    }
    // Only configuration records: sensor heartbeats and visit counters never trigger this sync.
    const documents = [doc(db, "users", user.uid), doc(db, "users", user.uid, "settings", "notifications"), doc(db, "users", user.uid, "deviceConfig", "default")];
    const collections = [collection(db, "users", user.uid, "cats"), collection(db, "users", user.uid, "catDetails")];
    const stops = [...documents.map((ref) => onSnapshot(ref, schedule, () => {})), ...collections.map((ref) => onSnapshot(ref, schedule, () => {}))];
    schedule();
    return () => { controller.abort(); clearTimeout(timer); stops.forEach((stop) => stop()); };
  }, [user]);
  return null;
}
