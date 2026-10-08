import { after } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/configs/firebase-admin';
import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
import { processPushOutbox } from '@/lib/utils/pushDelivery';
import { rfidPrimaryEnabled, readOperationalRecord, assertOperationalReady } from '@/lib/server/operationalStore';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true)).uid; }
  catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
  try {
    const { notificationId } = await request.json();
    if (typeof notificationId !== 'string' || notificationId.length>1000 || notificationId.includes('/')) return Response.json({ error: 'Invalid notification' }, { status: 400 });
    if (rfidPrimaryEnabled()) await assertOperationalReady(uid);
    const canonical = rfidPrimaryEnabled() ? await readOperationalRecord(uid, `users/${uid}/notifications/${notificationId}`) : null;
    const saved = rfidPrimaryEnabled() ? { exists: !!canonical, data: () => canonical?.data } : await getAdminFirestore().doc(`users/${uid}/notifications/${notificationId}`).get();
    if (!saved.exists) return Response.json({ error: 'Notification not found' }, { status: 404 });
    const data = saved.data() ?? {};
    // Gas alerts already originate in the sensor queue, including while the app is closed.
    // RFID alerts now originate in sensor ingestion. Old open tabs cannot send a second push.
    if (!['dashboard_abnormal','litter_level','admin','system'].includes(String(data.source))) return Response.json({ queued: false });
    const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
    const createdMs = typeof data.createdAt === 'string' ? Date.parse(data.createdAt) : createdAt?.toMillis?.() ?? NaN;
    if (!Number.isFinite(createdMs) || createdMs > Date.now() || Date.now()-createdMs>3600000) return Response.json({ queued: false });
    const eventKey = `push:${uid}:${notificationId}`;
    const response = await smsStoreRequest('sms_outbox?on_conflict=event_key', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ event_key: eventKey, owner_id: uid, cat_id: typeof data.catId==='string' ? data.catId : null, reason: 'Saved notification', message: '', status: 'cancelled', push_status: 'pending', context: { title: String(data.title??'LitterSense Alert').slice(0,100), body: String(data.message??'Review this alert.').slice(0,500), source: data.source, url: typeof data.route==='string' && data.route.startsWith('/dashboard') ? data.route : '/dashboard/notifications' } }) });
    if (!response.ok) throw new Error();
    const inserted = await response.json() as unknown[];
    if (!inserted.length) return Response.json({ queued: false });
    after(async () => { try { await processPushOutbox(uid); } catch { console.warn('[push] Alert remains queued for the next worker run.'); } });
    return Response.json({ queued: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Push alert unavailable' }, { status: 503 }); }
}
