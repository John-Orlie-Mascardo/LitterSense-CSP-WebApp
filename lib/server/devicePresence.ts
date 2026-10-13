import { createHash, createHmac } from 'node:crypto';

export const SENSOR_PRESENCE_TTL_SECONDS = 3600;
export const SENSOR_PRESENCE_ROLES = ['rfid', 'gas-ultrasonic'] as const;
export type SensorPresenceRole = typeof SENSOR_PRESENCE_ROLES[number];
export type SensorPresenceScope = 'presence-publish' | 'presence-view';

export function isSensorPresenceRole(value: unknown): value is SensorPresenceRole {
  return SENSOR_PRESENCE_ROLES.includes(value as SensorPresenceRole);
}

export function sensorPresenceDeviceId(configToken: string, role: SensorPresenceRole) {
  const hash = createHash('sha256').update(`${configToken}:${role}`).digest('hex').slice(0, 32);
  return `sen_${hash}`;
}

export function sensorPresenceTicket(deviceId: string, role: SensorPresenceRole, scope: SensorPresenceScope, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    deviceId,
    role,
    scope,
    exp: Math.floor(now / 1000) + SENSOR_PRESENCE_TTL_SECONDS,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
