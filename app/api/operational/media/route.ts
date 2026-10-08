import { getAdminAuth } from '@/lib/configs/firebase-admin';
import { assertOperationalReady, OperationalError, rfidPrimaryEnabled } from '@/lib/server/operationalStore';
import { deleteOperationalPhoto, uploadOperationalPhoto } from '@/lib/server/operationalMedia';
const headers = { 'Cache-Control': 'no-store, private' };
export async function POST(request: Request) {
  let uid;
  try { uid = (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true)).uid; }
  catch { return Response.json({ error: 'Unauthorized' }, { status: 401, headers }); }
  try {
    if (!rfidPrimaryEnabled()) throw new OperationalError('Primary mode disabled', 409);
    await assertOperationalReady(uid);
    const path = request.headers.get('x-photo-path') ?? '';
    if (request.headers.get('x-photo-action') === 'delete') { await deleteOperationalPhoto(uid, path); return Response.json({ ok: true }, { headers }); }
    if (Number(request.headers.get('content-length')) > 2097152) throw new OperationalError('Photo too large', 413);
    // Enforce the limit even for chunked requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new OperationalError('Missing photo', 400);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2097152) { await reader.cancel(); throw new OperationalError('Photo too large', 413); } chunks.push(value); }
    const url = await uploadOperationalPhoto(uid, path, Buffer.concat(chunks), request.headers.get('content-type') ?? '');
    return Response.json({ url }, { headers });
  } catch (error) { return Response.json({ error: error instanceof OperationalError ? error.message : 'Photo unavailable' }, { status: error instanceof OperationalError ? error.status : 503, headers }); }
}
