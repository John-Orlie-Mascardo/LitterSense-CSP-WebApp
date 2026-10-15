import { Timestamp } from '@/lib/utils/operationalClient';
import { ownerText } from '@/lib/presentation/ownerText';
import type { NotificationRecord } from '@/lib/interfaces/NotificationPage';
import type { AppNotification } from '@/lib/contexts/NotificationContext';

export function notificationFromRecord(row: NotificationRecord): AppNotification {
  const stamp = row.data.createdAt;
  let createdAt = Timestamp.fromMillis(0);
  if (stamp && typeof stamp === 'object' && 'seconds' in stamp && 'nanoseconds' in stamp && typeof stamp.seconds === 'number' && typeof stamp.nanoseconds === 'number' && Number.isInteger(stamp.seconds) && Number.isInteger(stamp.nanoseconds) && stamp.seconds >= -62135596800 && stamp.seconds <= 253402300799 && stamp.nanoseconds >= 0 && stamp.nanoseconds < 1_000_000_000) createdAt = new Timestamp(stamp.seconds, stamp.nanoseconds);
  else {
    const value = typeof stamp === 'string' ? stamp : stamp && typeof stamp === 'object' && 'value' in stamp ? String(stamp.value) : '';
    const milliseconds = Date.parse(value);
    if (milliseconds >= -62135596800000 && milliseconds < 253402300800000) createdAt = Timestamp.fromMillis(milliseconds);
  }
  return { ...row.data, id: row.path.slice(row.path.lastIndexOf('/') + 1), createdAt, title: ownerText(String(row.data.title ?? '')), message: ownerText(String(row.data.message ?? '')) } as AppNotification;
}
