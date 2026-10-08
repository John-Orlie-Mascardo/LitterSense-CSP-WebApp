import { getAdminAuth } from '@/lib/configs/firebase-admin';
import { OperationalError, rfidPrimaryEnabled } from '@/lib/server/operationalStore';
import { readClientRecords, writeClientRecords, projectOperationalAccount } from '@/lib/server/operationalRecords';
const headers = { 'Cache-Control': 'no-store, private' };
export async function POST(request: Request) {
  let identity;
  try { identity = await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true); }
  catch { return Response.json({ error: 'Unauthorized' }, { status: 401, headers }); }
  if (!rfidPrimaryEnabled()) return Response.json({ error: 'Primary mode is disabled' }, { status: 409, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new OperationalError('Missing request body', 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > 2097152) { await reader.cancel(); throw new OperationalError('Request too large', 413); } chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new OperationalError('Invalid JSON', 400); }
    if (!body || typeof body !== 'object') throw new OperationalError('Invalid request', 400);
    if (body.action === 'read' || body.action === 'list') return Response.json({ rows: await readClientRecords(identity, body.path, body.action === 'list') }, { headers });
    if (body.action !== 'write') throw new OperationalError('Invalid operation', 400);
    await writeClientRecords(identity, body.writes);
    let projectionPending = false;
    if (body.writes.some((w: { path: string }) => w.path === `users/${identity.uid}` || w.path === `users/${identity.uid}/settings/notifications`)) {
      try { await projectOperationalAccount(identity.uid); } catch { projectionPending = true; console.warn('[supabase:account] Alert projection pending.'); }
    }
    return Response.json({ ok: true, projectionPending }, { headers });
  } catch (error) { return Response.json({ error: error instanceof OperationalError ? error.message : 'Operational records unavailable', code: error instanceof OperationalError ? error.code : '' }, { status: error instanceof OperationalError ? error.status : 503, headers }); }
}
