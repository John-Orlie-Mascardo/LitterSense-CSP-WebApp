"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useSettings } from "@/lib/hooks/useSettings";
import type { Cat } from "@/lib/data/mockData";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = "health" | "system" | "cat_visit";
export type NotificationSource =
  | "dashboard_abnormal"
  | "rfid_visit"
  | "ammonia_alert"
  | "h2s_alert"
  | "litter_level"
  | "admin"
  | "system";
export type NotificationStatus = Extract<Cat["status"], "abnormal">;
export type NotificationCategory = "alerts" | "system";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: Timestamp;
  isRead: boolean;
  source?: NotificationSource;
  abnormalKey?: string;
  catId?: string;
  catName?: string;
  route?: string;
  status?: NotificationStatus;
  visitCount?: number;
  avgDuration?: string;
}

export type NewNotificationData = Pick<
  AppNotification,
  "type" | "title" | "message"
> &
  Partial<
    Pick<
      AppNotification,
      "source" | "abnormalKey" | "catId" | "catName" | "route" | "status" | "visitCount" | "avgDuration"
    >
  >;

export type UpsertNotificationData = NewNotificationData &
  Required<Pick<AppNotification, "abnormalKey">>;

interface NotificationSyncState {
  userId: string | null;
  notifications: AppNotification[];
  isLoading: boolean;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  addNotification: (data: NewNotificationData) => Promise<void>;
  upsertNotification: (data: UpsertNotificationData) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const stripUndefinedFields = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as Partial<T>;

const buildNotificationSyncPayload = (data: Partial<AppNotification>) =>
  stripUndefinedFields({
    type: data.type,
    title: data.title,
    message: data.message,
    source: data.source,
    abnormalKey: data.abnormalKey,
    catId: data.catId,
    catName: data.catName,
    route: data.route,
    status: data.status,
    visitCount: data.visitCount,
    avgDuration: data.avgDuration,
  });

const getNotificationDocId = (abnormalKey: string) => encodeURIComponent(abnormalKey);

export const getNotificationCategory = (
  notification: Pick<AppNotification, "type" | "source">,
): NotificationCategory => {
  if (notification.type === "system") return "system";
  if (notification.source === "admin" || notification.source === "system") {
    return "system";
  }
  return "alerts";
};

const isNotificationAllowed = (
  data: Pick<AppNotification, "type" | "source">,
  settings: ReturnType<typeof useSettings>["settings"],
) => {
  if (getNotificationCategory(data) === "system") return true;

  if (data.source === "rfid_visit" || data.type === "cat_visit") {
    return settings.notifications.rfidVisitAlerts;
  }
  if (data.source === "ammonia_alert") {
    return settings.notifications.ammoniaAlerts;
  }
  if (data.source === "h2s_alert") {
    return settings.notifications.h2sAlerts;
  }
  if (data.source === "litter_level") {
    return settings.notifications.litterLevelWarnings;
  }

  return settings.notifications.healthAlerts;
};

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
  const { settings } = useSettings();
  const userId = user?.uid ?? null;
  const [syncState, setSyncState] = useState<NotificationSyncState>({
    userId: null,
    notifications: [],
    isLoading: true,
  });
  const notifications = useMemo(
    () => (syncState.userId === userId ? syncState.notifications : []),
    [syncState.notifications, syncState.userId, userId],
  );
  const isLoading =
    authLoading || (userId ? syncState.userId !== userId || syncState.isLoading : false);
  const notificationsRef = useRef<AppNotification[]>([]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      queueMicrotask(() => {
        setSyncState({
          userId: null,
          notifications: [],
          isLoading: false,
        });
      });
      return;
    }

    queueMicrotask(() => {
      setSyncState((current) => ({
        userId,
        notifications: current.userId === userId ? current.notifications : [],
        isLoading: false,
      }));
    });

    const notifQuery = query(
      collection(db, "users", userId, "notifications"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      notifQuery,
      (snapshot) => {
        const loaded: AppNotification[] = [];
        snapshot.forEach((d) =>
          loaded.push({ id: d.id, ...d.data() } as AppNotification)
        );
        setSyncState({
          userId,
          notifications: loaded,
          isLoading: false,
        });
      },
      (error) => {
        console.error("Failed to sync notifications:", error);
        setSyncState((current) => ({
          userId,
          notifications: current.userId === userId ? current.notifications : [],
          isLoading: false,
        }));
      }
    );

    return () => unsub();
  }, [userId, authLoading]);

  const addNotification = useCallback(
    async (data: NewNotificationData) => {
      if (!user) return;
      if (!isNotificationAllowed(data, settings)) return;

      await addDoc(collection(db, "users", user.uid, "notifications"), {
        ...buildNotificationSyncPayload(data),
        createdAt: serverTimestamp(),
        isRead: false,
      });
    },
    [settings, user]
  );

  const upsertNotification = useCallback(
    async (data: UpsertNotificationData) => {
      if (!user) return;
      if (!isNotificationAllowed(data, settings)) return;

      const notificationId = getNotificationDocId(data.abnormalKey);
      const notificationRef = doc(db, "users", user.uid, "notifications", notificationId);
      const existing = notificationsRef.current.find((notification) => notification.id === notificationId);
      const nextPayload = buildNotificationSyncPayload(data);

      if (!existing) {
        await setDoc(notificationRef, {
          ...nextPayload,
          createdAt: serverTimestamp(),
          isRead: false,
        });
        return;
      }

      const currentPayload = buildNotificationSyncPayload(existing);
      const updates = Object.fromEntries(
        Object.entries(nextPayload).filter(([key, value]) => currentPayload[key as keyof typeof currentPayload] !== value),
      );

      if (Object.keys(updates).length === 0) return;

      await updateDoc(notificationRef, updates);
    },
    [settings, user],
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

    const chunkSize = 450;
    for (let index = 0; index < notifications.length; index += chunkSize) {
      const batch = writeBatch(db);
      notifications.slice(index, index + chunkSize).forEach((n) => {
        batch.delete(doc(db, "users", user.uid, "notifications", n.id));
      });
      await batch.commit();
    }
  }, [user, notifications]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        addNotification,
        upsertNotification,
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
