import { getAdminAuth } from '@/lib/configs/firebase-admin';
import { cameraRelayConfig, NO_STORE } from '@/lib/server/cameraCloud';
import { SENSOR_PRESENCE_TTL_SECONDS, isSensorPresenceRole, sensorPresenceDeviceId, sensorPresenceTicket, type SensorPresenceRole } from '@/lib/server/devicePresence';
import { resolveOperationalDevice } from '@/lib/server/operationalCats';
import { rfidPrimaryEnabled, OperationalError } from '@/lib/server/operationalStore';
import { readOperationalDeviceConfig } from '@/lib/server/operationalDevices';

export const runtime = 'nodejs';
const PRESENCE_OFFLINE_AFTER_MS = 4500;

function responseError(error: unknown) {
  const status = error instanceof OperationalError ? error.status : 503;
  const message = error instanceof OperationalError ? error.message : 'Device presence is unavailable.';
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

function issueTicket(configToken: string, role: SensorPresenceRole, scope: 'presence-publish' | 'presence-view') {
  const relay = cameraRelayConfig();
  const deviceId = sensorPresenceDeviceId(configToken, role);
  return { relay, ticket: sensorPresenceTicket(deviceId, role, scope, relay.secret) };
}

export async function GET(request: Request) {
  if (!rfidPrimaryEnabled()) return Response.json({ error: 'Live device presence is unavailable.' }, { status: 409, headers: NO_STORE });
  let ownerId: string;
  try {
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) throw new Error('Unauthorized');
    ownerId = (await getAdminAuth().verifyIdToken(authorization.slice(7), true)).uid;
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  try {
    const config = await readOperationalDeviceConfig(ownerId);
    if (!config?.configToken) return Response.json({ error: 'Device setup is unavailable.' }, { status: 404, headers: NO_STORE });
    const roles: SensorPresenceRole[] = ['rfid', 'gas-ultrasonic'];
    const streams = Object.fromEntries(roles.map(role => {
      const { relay, ticket } = issueTicket(config.configToken, role, 'presence-view');
      return [role, `${relay.origin.replace('https:', 'wss:')}/v1/presence/live?ticket=${encodeURIComponent(ticket)}`];
    }));
    return Response.json({ streams, expiresIn: SENSOR_PRESENCE_TTL_SECONDS, offlineAfterMs: PRESENCE_OFFLINE_AFTER_MS }, { headers: NO_STORE });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  if (!rfidPrimaryEnabled()) return Response.json({ error: 'Live device presence is unavailable.' }, { status: 409, headers: NO_STORE });
  const configToken = (request.headers.get('x-device-config-token') ?? request.headers.get('x-littersense-config-token') ?? '').trim();
  const role = request.headers.get('x-sensor-role');
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(configToken) || !isSensorPresenceRole(role)) {
    return Response.json({ error: 'Invalid device credentials.' }, { status: 400, headers: NO_STORE });
  }
  try {
    await resolveOperationalDevice(configToken);
    const { relay, ticket } = issueTicket(configToken, role, 'presence-publish');
    return new Response(null, { status: 200, headers: {
      ...NO_STORE,
      'X-Sensor-Relay': relay.origin,
      'X-Sensor-Ticket': ticket,
      'X-Sensor-Ttl': String(SENSOR_PRESENCE_TTL_SECONDS),
    } });
  } catch (error) {
    return responseError(error);
  }
}
