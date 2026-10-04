import { after } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/configs/firebase-admin';
import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
import { processPushOutbox } from '@/lib/utils/pushDelivery';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true)).uid; }
  catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
  try {
    const { notificationId, test } = await request.json();
    let data: Record<string, unknown>;
    let eventKey: string;
    if (test === true) {
      data = { title: 'LitterSense: Push test', message: 'Push alerts are working on this device.', source: 'test', route: '/dashboard/settings' };
      eventKey = `push-test:${uid}:${Math.floor(Date.now()/3600000)}`;
    } else {
      if (typeof notificationId !== 'string' || notificationId.length>1000 || notificationId.includes('/')) return Response.json({ error: 'Invalid notification' }, { status: 400 });
      const saved = await getAdminFirestore().doc(`users/${uid}/notifications/${notificationId}`).get();
      if (!saved.exists) return Response.json({ error: 'Notification not found' }, { status: 404 });
      data = saved.data() ?? {};
      // Gas and health alerts already originate in the sensor queue, including while the app is closed.
      if (!['rfid_visit','litter_level','admin','system'].includes(String(data.source))) return Response.json({ queued: false });
      const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
      if (!createdAt?.toMillis || Date.now()-createdAt.toMillis()>3600000) return Response.json({ queued: false });
      eventKey = `push:${uid}:${notificationId}`;
    }
    const response = await smsStoreRequest('sms_outbox?on_conflict=event_key', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ event_key: eventKey, owner_id: uid, cat_id: typeof data.catId==='string' ? data.catId : null, reason: 'Saved notification', message: '', status: 'cancelled', push_status: 'pending', context: { title: String(data.title??'LitterSense Alert').slice(0,100), body: String(data.message??'Review this alert.').slice(0,500), source: data.source, url: typeof data.route==='string' && data.route.startsWith('/dashboard') ? data.route : '/dashboard/notifications' } }) });
    if (!response.ok) throw new Error();
    after(async () => { try { await processPushOutbox(uid); } catch { console.warn('[push] Alert remains queued for the next worker run.'); } });
    return Response.json({ queued: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Push alert unavailable' }, { status: 503 }); }
}
