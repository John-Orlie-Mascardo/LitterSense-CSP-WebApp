import { getAdminAuth } from '@/lib/configs/firebase-admin';
import { rfidPrimaryEnabled, OperationalError } from '@/lib/server/operationalStore';
import { readOperationalDeviceConfig, saveOperationalDeviceConfig } from '@/lib/server/operationalDevices';

const headers = { 'Cache-Control': 'no-store, private' };
async function owner(request: Request) {
  try { return (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true)).uid; }
  catch { return null; }
}
export async function GET(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!rfidPrimaryEnabled()) return Response.json({ operationalPrimary: false }, { headers });
  try { return Response.json({ operationalPrimary: true, config: await readOperationalDeviceConfig(uid) }, { headers }); }
  catch { return Response.json({ error: 'Device setup unavailable' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!rfidPrimaryEnabled()) return Response.json({ error: 'Primary device setup is not enabled' }, { status: 409, headers });
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: 'Invalid setup body' }, { status: 400, headers }); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return Response.json({ error: 'Invalid setup body' }, { status: 400, headers });
  try { return Response.json({ ok: true, ...await saveOperationalDeviceConfig(uid, input as Record<string, unknown>) }, { headers }); }
  catch (error) { return Response.json({ error: error instanceof OperationalError ? error.message : 'Device setup unavailable' }, { status: error instanceof OperationalError ? error.status : 503, headers }); }
}
