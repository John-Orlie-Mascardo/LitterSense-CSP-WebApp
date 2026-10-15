import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
import { OperationalError } from './operationalStore';
import type { NotificationPage } from '@/lib/interfaces/NotificationPage';

async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await smsStoreRequest(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new OperationalError(error.code === '22023' ? 'Invalid notification request' : 'Notifications unavailable. Please try again.', error.code === '22023' ? 400 : error.code === '42501' ? 403 : 503);
  }
  return response.json();
}
export async function readNotificationPage(uid: string, input: Record<string, unknown>): Promise<NotificationPage> {
  const category = input.category ?? 'all', pageSize = input.pageSize ?? 25, cursor = input.cursor ?? null;
  if (typeof category !== 'string' || !['all','alerts','system'].includes(category) || !Number.isInteger(pageSize) || Number(pageSize) < 1 || Number(pageSize) > 50) throw new OperationalError('Invalid notification query', 400);
  if (cursor !== null) {
    if (typeof cursor !== 'object' || Array.isArray(cursor)) throw new OperationalError('Invalid notification cursor', 400);
    const value = cursor as Record<string, unknown>;
    if (typeof value.time !== 'string' || !/^-?\d{1,30}(\.\d{1,9})?$/.test(value.time) || typeof value.path !== 'string' || value.path.length > 1024 || !value.path.startsWith(`users/${uid}/notifications/`) || value.path.slice(`users/${uid}/notifications/`.length).includes('/') || /[\u0000-\u001f]/.test(value.path)) throw new OperationalError('Invalid notification cursor', 400);
  }
  return call('operational_notification_page', { p_owner_id: uid, p_category: category, p_limit: pageSize, p_cursor: cursor });
}
export async function mutateAllNotifications(uid: string, operation: unknown) {
  if (operation !== 'markRead' && operation !== 'clear') throw new OperationalError('Invalid notification action', 400);
  return call<{ changed: number }>('operational_notification_bulk', { p_owner_id: uid, p_action: operation });
}
