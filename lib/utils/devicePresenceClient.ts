export type SensorPresenceRole = 'rfid' | 'gas-ultrasonic';
export type SensorPresenceEvent = { role: SensorPresenceRole; online: boolean; updatedAt: string | null };
const roles: SensorPresenceRole[] = ['rfid', 'gas-ultrasonic'];

export function parseSensorPresenceMessage(value: unknown, expectedRole: SensorPresenceRole): SensorPresenceEvent | null {
  if (typeof value !== 'string') return null;
  try {
    const message = JSON.parse(value) as Record<string, unknown>;
    if (message.type !== 'presence' || message.role !== expectedRole || typeof message.online !== 'boolean') return null;
    if (message.updatedAt !== null && (typeof message.updatedAt !== 'string' || !Number.isFinite(Date.parse(message.updatedAt)))) return null;
    if (message.online && typeof message.updatedAt !== 'string') return null;
    return { role: expectedRole, online: message.online, updatedAt: message.updatedAt as string | null };
  } catch {
    return null;
  }
}

type PresenceSession = { streams?: Partial<Record<SensorPresenceRole, string>>; expiresIn?: number };

export function subscribeDevicePresence(
  getToken: () => Promise<string>,
  onPresence: (event: SensorPresenceEvent) => void,
  onUnavailable: (role: SensorPresenceRole) => void,
) {
  let stopped = false;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const sockets = new Map<SensorPresenceRole, WebSocket>();

  const closeStreams = () => {
    for (const socket of sockets.values()) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    }
    sockets.clear();
  };
  const scheduleRetry = () => {
    if (stopped || retryTimer) return;
    failures += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, Math.min(30000, 1000 * 2 ** Math.min(failures - 1, 5)));
  };
  const fail = () => {
    closeStreams();
    roles.forEach(onUnavailable);
    scheduleRetry();
  };
  async function connect() {
    if (stopped) return;
    clearTimeout(refreshTimer);
    try {
      const response = await fetch('/api/sensors/presence-session', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (!response.ok) throw new Error('Presence session unavailable');
      const session = await response.json() as PresenceSession;
      if (!session.streams || !Number.isFinite(session.expiresIn) || (session.expiresIn ?? 0) < 120) throw new Error('Invalid presence session');
      for (const role of roles) {
        const url = session.streams[role];
        if (!url || !url.startsWith('wss://')) throw new Error('Invalid presence stream');
      }
      failures = 0;
      for (const role of roles) {
        if (stopped) return;
        const socket = new WebSocket(session.streams[role]!);
        sockets.set(role, socket);
        socket.onmessage = message => {
          const event = parseSensorPresenceMessage(message.data, role);
          if (event) onPresence(event);
        };
        socket.onerror = () => socket.close();
        socket.onclose = () => {
          if (stopped || sockets.get(role) !== socket) return;
          fail();
        };
      }
      refreshTimer = setTimeout(() => {
        closeStreams();
        void connect();
      }, Math.max(1000, ((session.expiresIn ?? 3600) - 60) * 1000));
    } catch {
      fail();
    }
  }

  void connect();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(refreshTimer);
    closeStreams();
  };
}
