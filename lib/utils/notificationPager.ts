import type { NotificationCursor, NotificationPage, NotificationRecord } from '@/lib/interfaces/NotificationPage';

export type NotificationFeed = {
  rows: NotificationRecord[]; unreadCount: number; totalCount: number;
  hasMore: boolean; isLoading: boolean; isLoadingMore: boolean; error: string;
};
export const emptyNotificationFeed: NotificationFeed = { rows: [], unreadCount: 0, totalCount: 0, hasMore: false, isLoading: true, isLoadingMore: false, error: '' };

export function createNotificationPager(read: (cursor: NotificationCursor | null) => Promise<NotificationPage>, changed: (state: NotificationFeed) => void) {
  let state = { ...emptyNotificationFeed }, stopped = false, running = false, pending = false;
  let version = 0, wantedPages = 1, loadedPages = 0, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = (patch: Partial<NotificationFeed>) => { state = { ...state, ...patch }; if (!stopped) changed(state); };
  async function run() {
    running = true;
    try {
      do {
        pending = false;
        const epoch = version;
        publish({ isLoading: loadedPages === 0, isLoadingMore: wantedPages > Math.max(1, loadedPages) });
        try {
          const records = new Map<string, NotificationRecord>();
          let cursor: NotificationCursor | null = null, page: NotificationPage | undefined, count = 0;
          for (; count < wantedPages; count++) {
            page = await read(cursor);
            if (stopped) return;
            if (epoch !== version) { pending = true; break; }
            page.rows.forEach(row => records.set(row.path, row));
            cursor = page.nextCursor;
            if (!cursor) { count++; break; }
          }
          if (pending || !page) continue;
          loadedPages = count; failures = 0;
          publish({ rows: [...records.values()], unreadCount: page.unreadCount, totalCount: page.totalCount, hasMore: !!cursor, isLoading: false, isLoadingMore: false, error: '' });
        } catch {
          if (stopped) return;
          if (epoch !== version) { pending = true; continue; }
          failures++;
          publish({ isLoading: false, isLoadingMore: false, error: 'Notifications could not be refreshed. Please try again.' });
        }
      } while (pending && !stopped);
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(() => { void refresh(); }, failures ? 60_000 : 30_000);
    }
  }
  async function refresh() {
    if (stopped) return;
    clearTimeout(timer); version++;
    if (running) { pending = true; return; }
    await run();
  }
  async function loadMore() {
    if (stopped || !state.hasMore || state.isLoadingMore) return;
    wantedPages = loadedPages + 1;
    await refresh();
  }
  void refresh();
  return { refresh, loadMore, stop() { stopped = true; clearTimeout(timer); } };
}
