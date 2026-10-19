"use client";

import { markNotificationIdsRead, reconcileNotificationReads } from '@/lib/utils/notificationReads';
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
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from "@/lib/utils/operationalClient";
import { db } from "@/lib/configs/firebase";
import { auth } from '@/lib/configs/firebase';
import { useAuth } from "@/lib/contexts/AuthContext";
import { useSettings } from "@/lib/hooks/useSettings";
import { operationalPrimary } from '@/lib/utils/operationalMode';
import { refreshNotificationRecords } from '@/lib/utils/operationalClient';
import { getNotificationPage, mutateNotificationHistory, subscribeNotificationRefresh } from '@/lib/utils/operationalClient';
import { createNotificationPager } from '@/lib/utils/notificationPager';
import { notificationFromRecord } from '@/lib/utils/notificationRecord';
import { subscribeNotificationLive } from '@/lib/utils/notificationLive';
import type { Cat } from "@/lib/data/mockData";

// ─── Types ────────────────────────────────────────────────────────────────────

async function dispatchPush(notificationId: string) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const response = await fetch('/api/push/dispatch', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId }) });
    if (!response.ok) console.warn('[push] Notification delivery could not be queued.');
  } catch { console.warn('[push] Notification delivery could not be queued.'); }
}

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
  > & { dedupeKey?: string };

export type UpsertNotificationData = NewNotificationData &
  Required<Pick<AppNotification, "abnormalKey">>;

interface NotificationSyncState {
  userId: string | null;
  notifications: AppNotification[];
  isLoading: boolean;
  unreadCount?: number;
  paginated?: boolean;
  error?: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  paginated: boolean;
  syncError: string;
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
  const paginated = syncState.userId === userId && syncState.paginated === true;
  const optimisticReadsRef = useRef({ userId, pending: new Set<string>() });
  useEffect(() => {
    optimisticReadsRef.current = { userId, pending: new Set<string>() };
  }, [userId]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const received = (event: MessageEvent) => { if (event.data?.type === 'littersense-push') refreshNotificationRecords(); };
    navigator.serviceWorker.addEventListener('message', received);
    return () => navigator.serviceWorker.removeEventListener('message', received);
  }, []);

  useEffect(() => {
    if (!user || authLoading) return;
    let stopped = false, disconnect: (() => void) | undefined;
    void operationalPrimary().then(primary => {
      if (primary && !stopped) disconnect = subscribeNotificationLive(() => user.getIdToken(), refreshNotificationRecords);
    }).catch(() => console.warn('[notifications] Live connection unavailable; normal refresh remains active.'));
    return () => { stopped = true; disconnect?.(); };
  }, [user, authLoading]);

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
        isLoading: true,
      }));
    });

    let stopped = false, unsub: (() => void) | undefined;
    const connectLegacy = () => {
    const notifQuery = query(
      collection(db, "users", userId, "notifications"),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      notifQuery,
      (snapshot) => {
        if (stopped) return;
        const loaded: AppNotification[] = [];
        snapshot.forEach((d) =>
          loaded.push(notificationFromRecord({ path: `users/${userId}/notifications/${d.id}`, revision: 0, data: d.data() }))
        );
        setSyncState({
          userId,
          notifications: reconcileNotificationReads(loaded, optimisticReadsRef.current.userId === userId ? optimisticReadsRef.current.pending : new Set()),
          isLoading: false,
        });
      },
      (error) => {
        if (stopped) return;
        console.error("Failed to sync notifications:", error);
        setSyncState((current) => ({
          userId,
          notifications: current.userId === userId ? current.notifications : [],
          isLoading: false,
        }));
      }
    );
    };
    void operationalPrimary().then(primary => {
      if (stopped) return;
      if (!primary) { unsub = connectLegacy(); return; }
      const pager = createNotificationPager(cursor => getNotificationPage('all', cursor), feed => {
        if (!stopped) setSyncState({ userId, notifications: feed.rows.map(notificationFromRecord), unreadCount: feed.unreadCount, paginated: true, isLoading: feed.isLoading, error: feed.error });
      });
      const stopRefresh = subscribeNotificationRefresh(userId, () => { void pager.refresh(); });
      unsub = () => { stopRefresh(); pager.stop(); };
    }).catch(() => {
      if (!stopped) setSyncState(current => ({ ...current, userId, isLoading: false, error: 'Notifications could not be loaded. Please try again.' }));
    });
    return () => { stopped = true; unsub?.(); };
  }, [userId, authLoading]);

  const addNotification = useCallback(
    async (data: NewNotificationData) => {
      if (!user) return;
      if (!isNotificationAllowed(data, settings)) return;

      if (data.dedupeKey) {
        const notificationRef = doc(db, "users", user.uid, "notifications", `rfid_${getNotificationDocId(data.dedupeKey)}`);
        await runTransaction(db, async (transaction) => {
          if (!(await transaction.get(notificationRef)).exists()) {
            transaction.set(notificationRef, {
              ...buildNotificationSyncPayload(data),
              createdAt: serverTimestamp(),
              isRead: false,
            });
          }
        });
        void dispatchPush(notificationRef.id);
        return;
      }

      const saved = await addDoc(collection(db, "users", user.uid, "notifications"), {
        ...buildNotificationSyncPayload(data),
        createdAt: serverTimestamp(),
        isRead: false,
      });
      void dispatchPush(saved.id);
    },
    [settings, user]
  );

  const upsertNotification = useCallback(
    async (data: UpsertNotificationData) => {
      if (!user) return;
      if (!isNotificationAllowed(data, settings)) return;

      const notificationId = getNotificationDocId(data.abnormalKey);
      const notificationRef = doc(db, "users", user.uid, "notifications", notificationId);
      const nextPayload = buildNotificationSyncPayload(data);
      const created = await runTransaction(db, async transaction => {
        // A notification outside the loaded page can still exist and must retain its date/read state.
        const saved = await transaction.get(notificationRef);
        if (!saved.exists()) {
          transaction.set(notificationRef, { ...nextPayload, createdAt: serverTimestamp(), isRead: false });
          return true;
        }
        const currentPayload = buildNotificationSyncPayload(saved.data() as AppNotification);
        const updates = Object.fromEntries(Object.entries(nextPayload).filter(([key, value]) => currentPayload[key as keyof typeof currentPayload] !== value));
        if (Object.keys(updates).length) transaction.update(notificationRef, updates);
        return false;
      });
      if (created) void dispatchPush(notificationRef.id);
    },
    [settings, user],
  );

  const markRead = useCallback(async (ids: string[]) => {
    if (!user) return;
    if (paginated) {
      for (const id of new Set(ids)) await updateDoc(doc(db, 'users', user.uid, 'notifications', id), { isRead: true });
      return;
    }
    const pending = optimisticReadsRef.current.pending;
    const setRead = (changed: string[], isRead: boolean) => setSyncState(current => current.userId !== user.uid ? current : {
      ...current, notifications: current.notifications.map(notification => changed.includes(notification.id) ? { ...notification, isRead } : notification),
    });
    await markNotificationIdsRead(notifications.filter(notification => ids.includes(notification.id)), pending, changed => setRead(changed, true), changed => setRead(changed, false), async (changed, committed) => {
      // Operational commits accept at most 100 writes; keep larger notification lists usable.
      for (let start = 0; start < changed.length; start += 100) {
        if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed');
        const batch = writeBatch(db);
        const chunk = changed.slice(start, start + 100);
        chunk.forEach(id => batch.update(doc(db, 'users', user.uid, 'notifications', id), { isRead: true }));
        await batch.commit();
        // Do not roll back a successfully committed chunk if a later chunk fails.
        chunk.forEach(id => committed.add(id));
      }
      refreshNotificationRecords();
    });
  }, [user, notifications, paginated]);
  const markAsRead = useCallback((id: string) => markRead([id]), [markRead]);
  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    if (paginated) await mutateNotificationHistory('markRead');
    else await markRead(notifications.filter(notification => !notification.isRead).map(notification => notification.id));
  }, [user, paginated, markRead, notifications]);

  const deleteNotification = useCallback(
    async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "notifications", id));
    },
    [user]
  );

  const clearAll = useCallback(async () => {
    if (!user) return;
    if (paginated) { await mutateNotificationHistory('clear'); return; }
    if (notifications.length === 0) return;

    const chunkSize = 450;
    for (let index = 0; index < notifications.length; index += chunkSize) {
      const batch = writeBatch(db);
      notifications.slice(index, index + chunkSize).forEach((n) => {
        batch.delete(doc(db, "users", user.uid, "notifications", n.id));
      });
      await batch.commit();
    }
  }, [user, notifications, paginated]);

  const unreadCount = paginated ? syncState.unreadCount ?? 0 : notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        paginated,
        syncError: syncState.userId === userId ? syncState.error ?? '' : '',
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
