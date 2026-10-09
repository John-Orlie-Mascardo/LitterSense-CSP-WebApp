import { getAdminAuth } from '@/lib/configs/firebase-admin';
import { rfidPrimaryEnabled } from '@/lib/server/operationalStore';
import { watchNotificationChanges } from '@/lib/server/notificationRealtime';
import { readOperationalDeviceConfig } from '@/lib/server/operationalDevices';
import { createHash } from 'node:crypto';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true)).uid; }
  catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
  if (!rfidPrimaryEnabled()) return new Response(null, { status: 409 });
  let sensorTokenHash: string | undefined;
  try {
    const config = await readOperationalDeviceConfig(uid);
    if (config?.configToken) sensorTokenHash = createHash('sha256').update(config.configToken).digest('hex');
  } catch { /* Notifications and RFID still stream; sensor polling remains available. */ }
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false, disconnect = () => {};
      const finish = () => {
        if (closed) return;
        closed = true; clearTimeout(expiry); disconnect();
        request.signal.removeEventListener('abort', finish);
        try { controller.close(); } catch { /* A cancelled reader is already closed. */ }
      };
      const expiry = setTimeout(finish, 45000);
      stop = finish;
      request.signal.addEventListener('abort', finish, { once: true });
      try {
        disconnect = watchNotificationChanges(uid, kind => {
          if (!closed) controller.enqueue(encoder.encode(`data: ${kind ?? 'changed'}\n\n`));
        }, finish, sensorTokenHash);
        if (request.signal.aborted) finish();
      } catch { finish(); }
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, private, no-transform', 'X-Accel-Buffering': 'no' } });
}
