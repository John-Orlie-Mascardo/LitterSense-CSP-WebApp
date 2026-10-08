import { getAdminAuth } from '@/lib/configs/firebase-admin';
import { captureCatalog } from '@/lib/utils/catCatalogSync';
import { saveCatalogBackup } from '@/lib/utils/catHistoryStore';
import { copyHistoryPage } from '@/lib/utils/catHistoryBackfill';
import { rfidPrimaryEnabled } from '@/lib/server/operationalStore';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true)).uid; }
  catch { return Response.json({ error: 'Unauthorized' }, { status: 401, headers }); }
  if (rfidPrimaryEnabled()) return Response.json({ paused: true, reason: 'Supabase RFID primary mode' }, { headers });
  try {
    const catalog = await captureCatalog(uid);
    await saveCatalogBackup(uid, catalog);
    return Response.json(await copyHistoryPage(uid), { headers });
  } catch { return Response.json({ error: 'Backup could not advance. Please try again.' }, { status: 503, headers }); }
}
