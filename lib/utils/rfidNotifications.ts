import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { getAdminFirestore } from '@/lib/configs/firebase-admin';
import { buildSessionDocumentId, findCatIdByRfid, type NormalizedSensorSyncEvent } from './sensorSync';
import { readVisitBackupsById } from './catHistoryStore';
import { smsStoreRequest } from './smsAccountSync';

type RfidAccount = {
  owner_id: string;
  cats: Array<{ id: string; name: string; rfidTag: string }>;
  notifications: { rfidVisitAlerts?: boolean; perCat?: Array<{ catId: string; visitAlerts?: boolean }> };
};
type RfidNotice = { id: string; catId: string; catName: string; title: string; message: string; route: string; occurredAt: string };

export function buildRfidNotifications(account: RfidAccount, payload: Record<string, unknown>, events: NormalizedSensorSyncEvent[], deviceHash: string, now: Date): RfidNotice[] {
  if (payload.source === 'gas-ultrasonic' || account.notifications.rfidVisitAlerts !== true) return [];
  const tags: Array<[string, { rfidTag: string }]> = account.cats.map(cat => [cat.id, { rfidTag: cat.rfidTag }]);
  const notices: RfidNotice[] = [];
  const add = (kind: 'entry' | 'exit', identity: string, card: string, hex: string, at: number, duration = 0) => {
    const age = now.getTime() - at;
    // Do not announce old replayed visits or an entry already underway at rollout.
    if (!identity || !Number.isFinite(age) || age < -5000 || age > (kind === 'entry' ? 180000 : 3600000)) return;
    const matches = tags.filter(tag => findCatIdByRfid([tag], card, hex));
    if (matches.length !== 1) return;
    const cat = account.cats.find(value => value.id === matches[0][0])!;
    if (account.notifications.perCat?.some(pref => pref.catId === cat.id && pref.visitAlerts === false)) return;
    const name = cat.name.slice(0, 100);
    const seconds = Math.max(1, Math.round(duration));
    const durationLabel = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
    const id = `rfid_server_${createHash('sha256').update(`${deviceHash}:${cat.id}:${kind}:${identity}`).digest('hex')}`;
    notices.push({ id, catId: cat.id, catName: name, title: `${name} ${kind === 'entry' ? 'entered' : 'left'} the litter box`, message: kind === 'entry' ? 'RFID entry detected.' : `RFID exit detected after ${durationLabel}.`, route: `/dashboard/cats/${cat.id}`, occurredAt: new Date(at).toISOString() });
  };
  if (payload.sessionActive === true && typeof payload.activeSessionStartMs === 'number' && payload.activeSessionStartMs > 1_000_000_000_000 && typeof payload.activeRfidHex === 'string') {
    add('entry', String(payload.activeSessionStartMs), '', payload.activeRfidHex, payload.activeSessionStartMs);
  }
  for (const event of events.slice(0, 100)) {
    if (!event.eventId || event.eventId.length > 128 || !Number.isFinite(event.durationSecs) || event.durationSecs < 1) continue;
    // A timeout is not a confirmed physical exit. Its existing health alert is separate.
    if (!['NORMAL', 'ABNORMAL', 'SHORT_SESSION'].includes(event.status)) continue;
    add('exit', event.eventId, event.rfidCard, event.rfidHex, Date.parse(event.endedAt), event.durationSecs);
  }
  return notices;
}

export async function queueRfidNotifications(payload: Record<string, unknown>, configToken: string, events: NormalizedSensorSyncEvent[], now: Date, verifiedOwnerId?: string, savedSessionIds?: string[]) {
  if (payload.source === 'gas-ultrasonic' || (payload.sessionActive !== true && !events.length)) return { queued: 0 };
  const tokenHash = createHash('sha256').update(configToken).digest('hex');
  const response = await smsStoreRequest(`sms_devices?token_hash=eq.${tokenHash}&select=sms_accounts(owner_id,cats,notifications)`);
  if (!response.ok) throw new Error('Unable to resolve RFID alert owner');
  const account = (await response.json() as Array<{ sms_accounts: RfidAccount }>)[0]?.sms_accounts;
  if (!account || (verifiedOwnerId && account.owner_id !== verifiedOwnerId)) return { queued: 0 };
  let confirmedEvents = events;
  if (savedSessionIds) {
    const saved = new Set(savedSessionIds);
    confirmedEvents = events.filter(event => saved.has(buildSessionDocumentId(configToken, event)));
  } else if (events.length) {
    const saved = await readVisitBackupsById(account.owner_id, events.map(event => buildSessionDocumentId(configToken, event)));
    confirmedEvents = events.filter(event => saved.some(visit => visit.sessionId === buildSessionDocumentId(configToken, event) && visit.tokenHash === tokenHash && ['primary_saved', 'pending', 'claimed'].includes(visit.state) && account.cats.some(cat => cat.id === visit.catId && findCatIdByRfid([[cat.id, { rfidTag: cat.rfidTag }]], event.rfidCard, event.rfidHex))));
  }
  let queued = 0;
  for (const notice of buildRfidNotifications(account, payload, confirmedEvents, tokenHash, now)) {
    const result = await smsStoreRequest('sms_outbox?on_conflict=event_key', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ event_key: `push:${account.owner_id}:${notice.id}`, owner_id: account.owner_id, cat_id: notice.catId, reason: 'Saved notification', message: '', status: 'cancelled', push_status: 'pending', context: { source: 'rfid_visit', title: notice.title, body: notice.message, url: notice.route, occurredAt: notice.occurredAt } }),
    });
    if (!result.ok) throw new Error('Unable to queue RFID alert');
    if (!(await result.json() as unknown[]).length) continue;
    queued++;
    after(async () => {
      try {
        await getAdminFirestore().doc(`users/${account.owner_id}/notifications/${notice.id}`).create({ type: 'cat_visit', source: 'rfid_visit', title: notice.title, message: notice.message, catId: notice.catId, catName: notice.catName, route: notice.route, createdAt: now, isRead: false });
      } catch {
        // Firestore quota retries must not hold the board's HTTP response or the push worker.
        console.warn('[push] RFID alert queued; notification history could not be saved.');
      }
    });
  }
  return { queued, ownerId: account.owner_id };
}
