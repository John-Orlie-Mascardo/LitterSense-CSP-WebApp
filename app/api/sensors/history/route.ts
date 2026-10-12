import { saveSensorEventHistory } from '@/lib/server/sensorEventHistory';
import { OperationalError, rfidPrimaryEnabled } from '@/lib/server/operationalStore';
export const runtime='nodejs';
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
    return Response.json({acknowledged},{headers:{'Cache-Control':'no-store','x-litersense-ack':acknowledged.length===1?acknowledged[0]:''}});
  } catch(error) { return Response.json({error:error instanceof OperationalError?error.message:'History unavailable; retry'}, {status:error instanceof OperationalError?error.status:503,headers:{'Cache-Control':'no-store'}}); }
}
