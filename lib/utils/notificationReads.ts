type ReadState = { id: string; isRead: boolean };

export function reconcileNotificationReads<T extends ReadState>(notifications: T[], pending: Set<string>): T[] {
  return notifications.map(notification => {
    if (notification.isRead) pending.delete(notification.id);
    return pending.has(notification.id) ? { ...notification, isRead: true } : notification;
  });
}

export async function markNotificationIdsRead(
  notifications: ReadState[], pending: Set<string>, update: (ids: string[]) => void,
  rollback: (ids: string[]) => void, persist: (ids: string[], committed: Set<string>) => Promise<void>,
) {
  const changed = notifications.filter(notification => !notification.isRead && !pending.has(notification.id)).map(notification => notification.id);
  if (!changed.length) return;
  changed.forEach(id => pending.add(id));
  update(changed);
  const committed = new Set<string>();
  try { await persist(changed, committed); }
  catch (error) {
    const unconfirmed = changed.filter(id => pending.has(id) && !committed.has(id));
    unconfirmed.forEach(id => pending.delete(id));
    rollback(unconfirmed);
    throw error;
  }
}
