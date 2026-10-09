import type { Cat } from '../interfaces/Cat';
import type { CatDetails } from '../interfaces/CatDetails';
import type { Session } from '../interfaces/Session';
import type { DeviceSensors } from '../hooks/useDeviceSensors';

export type RfidActivityVisit = {
  readonly cat: Cat;
  readonly session: Session;
  readonly liveUpdatePending?: boolean;
};

const normalizeTag = (value: string) => value.toLowerCase().replace(/[^a-f0-9]/g, '');
const epochMs = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value >= Date.UTC(2000, 0, 1) && value <= 8.64e15;
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const completedStatuses = new Set(['NORMAL', 'ABNORMAL', 'SHORT_SESSION', 'NO_EXIT_TIMEOUT', 'SESSION_INTERRUPTED']);

function findCat(cats: Cat[], getDetails: (id: string) => CatDetails | undefined, card: string, hex: string) {
  if (!card && !hex) return undefined;
  const identifiers = [card, hex].flatMap(value => [normalizeTag(value), Number.parseInt(value, 16).toString()]);
  return cats.find(cat => {
    const tag = normalizeTag(getDetails(cat.id)?.rfidTag ?? '');
    return Boolean(tag) && identifiers.includes(tag);
  });
}

function session(catId: string, identity: string | number, start: number, duration: number, status: string, end?: number): Session {
  const started = new Date(start);
  return {
    id: `live-rfid-${catId}-${identity}`, catId,
    date: dateKey(new Date(end ?? start)),
    time: started.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    startedAt: started.toISOString(), ...(end === undefined ? {} : { endedAt: new Date(end).toISOString() }),
    durationSecs: Math.max(1, Math.round(duration / 1000)),
    mq135Delta: 0, mq136Delta: 0, anomaly: status === 'ABNORMAL', anomalyType: null,
    sessionStatus: status,
  };
}

/** Project reported entry/exit evidence independently from device connection freshness. */
export function buildRfidActivityVisits(sensor: DeviceSensors | null, cats: Cat[], getDetails: (id: string) => CatDetails | undefined): RfidActivityVisit[] {
  if (!sensor) return [];
  const visits: RfidActivityVisit[] = [];
  if (sensor.sessionActive) {
    const cat = findCat(cats, getDetails, sensor.activeRfidCard || sensor.rfidCard, sensor.activeRfidHex || sensor.rfidHex);
    const receipt = Date.parse(sensor.rfidUpdatedAt || sensor.updatedAt || sensor.serverTime || '');
    const duration = Math.max(0, sensor.activeSessionDurationMs ?? 0);
    // Older readers expose uptime here; infer its calendar time from the accepted receipt.
    const start = epochMs(sensor.activeSessionStartMs) ? sensor.activeSessionStartMs! : receipt - duration;
    if (cat && Number.isFinite(start)) visits.push({
      cat, session: session(cat.id, sensor.activeSessionStartMs ?? start, start, duration, 'IN_PROGRESS'),
      liveUpdatePending: !sensor.online,
    });
  }
  // Retain the latest reported exit during the asynchronous history refresh, even if
  // a new visit has already started. Only actual completion evidence supplies an exit.
  if (completedStatuses.has(sensor.lastSessionStatus) && epochMs(sensor.lastSessionEndMs) &&
      typeof sensor.lastSessionDurationMs === 'number' && Number.isFinite(sensor.lastSessionDurationMs) && sensor.lastSessionDurationMs >= 0) {
    const cat = findCat(cats, getDetails, sensor.rfidCard, sensor.rfidHex);
    const end = sensor.lastSessionEndMs!;
    const start = end - sensor.lastSessionDurationMs;
    if (cat) visits.push({ cat, session: session(cat.id, start, start, sensor.lastSessionDurationMs, sensor.lastSessionStatus, end) });
  }
  return visits;
}

const parsedTime = (value: string | undefined) => value ? Date.parse(value) : Number.NaN;

export function isSameRfidVisit(recorded: Session, projected: Session): boolean {
  if (recorded.catId !== projected.catId || recorded.sessionStatus === 'DAILY_SUMMARY') return false;
  if (recorded.id === projected.id) return true;
  const start = parsedTime(projected.startedAt);
  const recordedEnd = parsedTime(recorded.endedAt);
  const recordedStart = parsedTime(recorded.startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(recordedStart) || Math.abs(recordedStart - start) > 1000) return false;
  const end = parsedTime(projected.endedAt);
  if (Number.isFinite(end)) return Number.isFinite(recordedEnd) && Math.abs(recordedEnd - end) <= 1000;
  // A previous visit ending before this entry is always a separate visit.
  return Number.isFinite(recordedEnd) ? recordedEnd > start : recorded.sessionStatus === 'IN_PROGRESS';
}

export function mergeRfidActivityVisits(sessions: Session[], getCat: (id: string) => Cat | undefined, projected: RfidActivityVisit[]): RfidActivityVisit[] {
  const stored = sessions.flatMap(session => {
    const cat = getCat(session.catId);
    return cat ? [{ cat, session }] : [];
  });
  return [...projected.filter(visit => !sessions.some(recorded => isSameRfidVisit(recorded, visit.session))), ...stored];
}
