"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = "health" | "system" | "cat_visit";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: Timestamp;
  isRead: boolean;
}

export type NewNotificationData = Pick<
  AppNotification,
  "type" | "title" | "message"
>;

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  addNotification: (data: NewNotificationData) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const uid = user.uid;
    const notifQuery = query(
      collection(db, "users", uid, "notifications"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      notifQuery,
      (snapshot) => {
        const loaded: AppNotification[] = [];
        snapshot.forEach((d) =>
          loaded.push({ id: d.id, ...d.data() } as AppNotification)
        );
        setNotifications(loaded);
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );

    return () => unsub();
  }, [user?.uid, authLoading]);

  const addNotification = useCallback(
    async (data: NewNotificationData) => {
      if (!user) return;
      await addDoc(collection(db, "users", user.uid, "notifications"), {
        ...data,
        createdAt: serverTimestamp(),
        isRead: false,
      });
    },
    [user]
  );

  const markAsRead = useCallback(
    async (id: string) => {
      if (!user) return;
      await updateDoc(doc(db, "users", user.uid, "notifications", id), {
        isRead: true,
      });
    },
    [user]
  );

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;

    const batch = writeBatch(db);
    unread.forEach((n) => {
      batch.update(doc(db, "users", user.uid, "notifications", n.id), {
        isRead: true,
      });
    });
    await batch.commit();
  }, [user, notifications]);

  const deleteNotification = useCallback(
    async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "notifications", id));
    },
    [user]
  );

  const clearAll = useCallback(async () => {
    if (!user || notifications.length === 0) return;
    const batch = writeBatch(db);
    notifications.forEach((n) => {
      batch.delete(doc(db, "users", user.uid, "notifications", n.id));
    });
    await batch.commit();
  }, [user, notifications]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        addNotification,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return context;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns "today" | "yesterday" | "earlier" based on a Firestore Timestamp */
export function getDateGroup(
  ts: Timestamp
): "today" | "yesterday" | "earlier" {
  const date = ts.toDate();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const dateOnly = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  if (dateOnly.getTime() === today.getTime()) return "today";
  if (dateOnly.getTime() === yesterday.getTime()) return "yesterday";
  return "earlier";
}

/** Returns a human-readable relative time label from a Firestore Timestamp */
export function getTimeLabel(ts: Timestamp): string {
  const diffMs = Date.now() - ts.toDate().getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}
