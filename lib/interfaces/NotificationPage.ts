export type NotificationFilter = 'all' | 'alerts' | 'system';
export type NotificationCursor = { time: string; path: string };
export type NotificationRecord = { path: string; revision: number; data: Record<string, unknown> };
export type NotificationPage = {
  rows: NotificationRecord[];
  nextCursor: NotificationCursor | null;
  unreadCount: number;
  totalCount: number;
};
