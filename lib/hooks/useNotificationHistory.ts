"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getNotificationPage, subscribeNotificationRefresh } from '@/lib/utils/operationalClient';
import { createNotificationPager, emptyNotificationFeed, type NotificationFeed } from '@/lib/utils/notificationPager';
import { notificationFromRecord } from '@/lib/utils/notificationRecord';
import type { NotificationFilter } from '@/lib/interfaces/NotificationPage';
import type { AppNotification } from '@/lib/contexts/NotificationContext';

export function useNotificationHistory(category: NotificationFilter, paginated: boolean, fallback: AppNotification[], fallbackLoading: boolean) {
  const { user } = useAuth(), uid = user?.uid ?? null;
  const key = `${uid}:${category}`;
  const [result, setResult] = useState<{ key: string; feed: NotificationFeed }>({ key: '', feed: emptyNotificationFeed });
  const controller = useRef<ReturnType<typeof createNotificationPager> | null>(null);
  useEffect(() => {
    if (!uid || !paginated) return;
    const pager = createNotificationPager(cursor => getNotificationPage(category, cursor), feed => setResult({ key: `${uid}:${category}`, feed }));
    controller.current = pager;
    const stopRefresh = subscribeNotificationRefresh(uid, () => { void pager.refresh(); });
    return () => { stopRefresh(); pager.stop(); controller.current = null; };
  }, [uid, category, paginated]);
  const feed = result.key === key ? result.feed : emptyNotificationFeed;
  const notifications = useMemo(() => paginated ? feed.rows.map(notificationFromRecord) : fallback, [paginated, feed.rows, fallback]);
  return { notifications, isLoading: paginated ? feed.isLoading : fallbackLoading, error: paginated ? feed.error : '', hasMore: paginated && feed.hasMore, isLoadingMore: feed.isLoadingMore,
    loadMore: useCallback(() => controller.current?.loadMore(), []), retry: useCallback(() => controller.current?.refresh(), []) };
}
