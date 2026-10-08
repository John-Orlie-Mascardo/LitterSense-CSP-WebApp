import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/lib/configs/firebase-admin';
import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
import { assertOperationalReady, rfidPrimaryEnabled } from '@/lib/server/operationalStore';
import { updateOperationalPushTokens } from '@/lib/server/operationalPushTokens';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true)).uid; }
  catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
  try {
    const { token, remove } = await request.json();
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || !/^[A-Za-z0-9_:\-]+$/.test(token)) return Response.json({ error: 'Invalid device token' }, { status: 400 });
    if (rfidPrimaryEnabled()) { await assertOperationalReady(uid); await updateOperationalPushTokens(uid, [token], remove === true); }
    else {
      const response = await smsStoreRequest('rpc/register_push_token', { method: 'POST', body: JSON.stringify({ p_owner_id: uid, p_token: token, p_remove: remove === true }) });
      if (!response.ok) throw new Error();
      await getAdminFirestore().doc(`users/${uid}`).set({ fcmTokens: remove === true ? FieldValue.arrayRemove(token) : FieldValue.arrayUnion(token) }, { merge: true });
    }
    return Response.json({ registered: remove !== true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Push registration unavailable. Try again.' }, { status: 503 }); }
}
