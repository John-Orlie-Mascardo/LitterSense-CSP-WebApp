// Display presence is independent of the backend's enrollment/session grace window.
export const SENSOR_DISPLAY_TIMEOUT_MS = 15000;

type PresenceSnapshot = {
  online: boolean;
  gasUltrasonicOnline?: boolean;
  sessionActive?: boolean;
  rfidUpdatedAt?: string;
  gasUltrasonicUpdatedAt?: string;
  updatedAt?: string;
  rfidState?: 'online' | 'stale' | 'unknown';
  gasUltrasonicState?: 'online' | 'stale' | 'unknown';
};

export function applySensorPresence<T extends PresenceSnapshot>(snapshot: T, now = Date.now()): T {
  const fresh = (timestamp: string | undefined) => {
    const receipt = Date.parse(timestamp ?? '');
    return Number.isFinite(receipt) && now >= receipt && now - receipt <= SENSOR_DISPLAY_TIMEOUT_MS;
  };
  const online = snapshot.online && fresh(snapshot.rfidUpdatedAt ?? snapshot.updatedAt);
  const gasOnline = snapshot.gasUltrasonicOnline === true && fresh(snapshot.gasUltrasonicUpdatedAt);
  return {
    ...snapshot, online,
    gasUltrasonicOnline: gasOnline,
    sessionActive: online && snapshot.sessionActive === true,
    rfidState: online ? 'online' : snapshot.rfidState === 'unknown' ? 'unknown' : 'stale',
    gasUltrasonicState: gasOnline ? 'online' : snapshot.gasUltrasonicState === 'unknown' ? 'unknown' : 'stale',
  };
}
