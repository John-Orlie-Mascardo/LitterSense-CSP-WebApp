import { saveSensorEventHistory } from '@/lib/server/sensorEventHistory';
import { OperationalError, rfidPrimaryEnabled } from '@/lib/server/operationalStore';
import { getAdminAuth } from '@/lib/configs/firebase-admin';
import { readGasHistory } from '@/lib/server/gasHistory';
import { resolveOperationalDevice } from '@/lib/server/operationalCats';
import { processPushOutbox } from '@/lib/utils/pushDelivery';
import { after } from 'next/server';
export const runtime='nodejs';
export async function GET(request: Request) {
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true)).uid; }
  catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
  try {
    if (!rfidPrimaryEnabled()) return Response.json({ error: 'Gas history requires operational primary mode' }, { status: 409 });
    const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined;
    if (cursor && cursor.length > 2048) throw new OperationalError('Invalid history cursor', 400);
    return Response.json(await readGasHistory(uid, cursor), { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return Response.json({ error: error instanceof OperationalError ? error.message : 'Gas history unavailable' }, { status: error instanceof OperationalError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } }); }
}
export async function POST(request: Request) {
  try {
    if(!rfidPrimaryEnabled()) return Response.json({error:'History receiver requires operational primary mode'}, {status:409});
    const token=request.headers.get('x-device-config-token') ?? '';
    const reader=request.body?.getReader(); if(!reader) throw new OperationalError('Missing body',400);
    const chunks: Uint8Array[]=[]; let size=0;
    try { for(;;) { const part=await reader.read(); if(part.done) break; size+=part.value.length; if(size>8192) { await reader.cancel(); throw new OperationalError('History batch too large',413); } chunks.push(part.value); } }
    finally { reader.releaseLock(); }
    let body: unknown;
    try { body=JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new OperationalError('Invalid JSON',400); }
    const acknowledged=await saveSensorEventHistory(token,body);
    const batch = body as { source?: string; events: Array<{ capturedAt?: unknown }> };
    if (batch.source !== 'rfid' && batch.events.some(event => typeof event.capturedAt === 'string')) after(async () => {
      try { await processPushOutbox(await resolveOperationalDevice(token)); }
      catch { console.warn('[push] Saved gas alerts remain queued for the next worker run.'); }
    });
    return Response.json({acknowledged},{headers:{'Cache-Control':'no-store','x-litersense-ack':acknowledged.length===1?acknowledged[0]:''}});
  } catch(error) { return Response.json({error:error instanceof OperationalError?error.message:'History unavailable; retry'}, {status:error instanceof OperationalError?error.status:503,headers:{'Cache-Control':'no-store'}}); }
}
