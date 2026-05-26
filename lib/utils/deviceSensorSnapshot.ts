import type {
  IgnoredSensorSyncEvent,
  NormalizedSensorSyncEvent,
} from "@/lib/utils/sensorSync";

export const DEVICE_SENSOR_SNAPSHOT_PATH = "deviceState/current";
export const SENSOR_SNAPSHOT_STALE_AFTER_MS = 30000;

export interface DeviceSensorSnapshot {
  online: boolean;
  connectedSsid: string;
  mq135: string;
  mq136: string;
  mq135Raw: number | null;
  mq136Raw: number | null;
  rfidHex: string;
  rfidCard: string;
  lastRfidMs: number | null;
  rfidEvent: string;
  sessionActive: boolean;
  activeRfidHex: string;
  activeRfidCard: string;
  activeSessionStartMs: number | null;
  activeSessionDurationMs: number | null;
  currentSessionStatus: string;
  lastSessionStatus: string;
  lastSessionDurationMs: number | null;
  lastSessionEndMs: number | null;
  completedSessionCount: number | null;
  falseEntryCount: number | null;
  noExitTimeoutCount: number | null;
  noExitTimeoutMs: number | null;
  updatedAt: string;
  deviceId: string;
  configToken: string;
  lastRecordedEventId: string;
}

interface BuildDeviceSensorSnapshotInput {
  deviceId: string;
  configToken: string;
  recordedEvents: NormalizedSensorSyncEvent[];
  ignoredEvents: IgnoredSensorSyncEvent[];
  previous?: Partial<DeviceSensorSnapshot>;
  now?: Date;
}

interface ToDeviceSensorsResponseOptions {
  now?: Date;
  staleAfterMs?: number;
  forceOffline?: boolean;
}

const DEFAULT_NO_EXIT_TIMEOUT_MS = 900000;

const toIntOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const isFreshSnapshotTimestamp = (
  updatedAt: string,
  now: Date,
  staleAfterMs: number,
) => {
  const updatedAtMs = Date.parse(updatedAt);
  return Number.isFinite(updatedAtMs) && now.getTime() - updatedAtMs <= staleAfterMs;
};

export function buildDeviceSensorSnapshot({
  deviceId,
  configToken,
  recordedEvents,
  ignoredEvents,
  previous = {},
  now = new Date(),
}: BuildDeviceSensorSnapshotInput): DeviceSensorSnapshot {
  const lastRecordedEvent = recordedEvents.at(-1) ?? null;
  const falseEntryDelta = ignoredEvents.filter(
    (event) => event.status === "FALSE_ENTRY_IGNORED",
  ).length;
  const timeoutDelta = recordedEvents.filter(
    (event) => event.status === "NO_EXIT_TIMEOUT",
  ).length;
  const recordedDelta = recordedEvents.length;
  const previousCompleted = toIntOrNull(previous.completedSessionCount) ?? 0;
  const previousFalseEntries = toIntOrNull(previous.falseEntryCount) ?? 0;
  const previousTimeouts = toIntOrNull(previous.noExitTimeoutCount) ?? 0;
  const previousNoExitTimeoutMs = toIntOrNull(previous.noExitTimeoutMs) ?? DEFAULT_NO_EXIT_TIMEOUT_MS;

  return {
    online: true,
    connectedSsid: typeof previous.connectedSsid === "string" ? previous.connectedSsid : "",
    mq135: typeof previous.mq135 === "string" ? previous.mq135 : "Clear",
    mq136: typeof previous.mq136 === "string" ? previous.mq136 : "Clear",
    mq135Raw: toIntOrNull(previous.mq135Raw),
    mq136Raw: toIntOrNull(previous.mq136Raw),
    rfidHex: lastRecordedEvent?.rfidHex ?? (typeof previous.rfidHex === "string" ? previous.rfidHex : ""),
    rfidCard: lastRecordedEvent?.rfidCard ?? (typeof previous.rfidCard === "string" ? previous.rfidCard : ""),
    lastRfidMs: lastRecordedEvent ? Date.parse(lastRecordedEvent.endedAt) || null : toIntOrNull(previous.lastRfidMs),
    rfidEvent: lastRecordedEvent?.status ?? (typeof previous.rfidEvent === "string" ? previous.rfidEvent : "none"),
    sessionActive: false,
    activeRfidHex: "",
    activeRfidCard: "",
    activeSessionStartMs: null,
    activeSessionDurationMs: null,
    currentSessionStatus: lastRecordedEvent?.status ?? (typeof previous.currentSessionStatus === "string" ? previous.currentSessionStatus : "IDLE"),
    lastSessionStatus: lastRecordedEvent?.status ?? (typeof previous.lastSessionStatus === "string" ? previous.lastSessionStatus : "NONE"),
    lastSessionDurationMs: lastRecordedEvent ? lastRecordedEvent.durationSecs * 1000 : toIntOrNull(previous.lastSessionDurationMs),
    lastSessionEndMs: lastRecordedEvent ? Date.parse(lastRecordedEvent.endedAt) || null : toIntOrNull(previous.lastSessionEndMs),
    completedSessionCount: previousCompleted + recordedDelta,
    falseEntryCount: previousFalseEntries + falseEntryDelta,
    noExitTimeoutCount: previousTimeouts + timeoutDelta,
    noExitTimeoutMs: previousNoExitTimeoutMs,
    updatedAt: now.toISOString(),
    deviceId,
    configToken,
    lastRecordedEventId: lastRecordedEvent?.eventId ?? (typeof previous.lastRecordedEventId === "string" ? previous.lastRecordedEventId : ""),
  };
}

export function toDeviceSensorsResponse(
  snapshot: Partial<DeviceSensorSnapshot>,
  options: ToDeviceSensorsResponseOptions = {},
) {
  const now = options.now ?? new Date();
  const staleAfterMs =
    options.staleAfterMs ?? SENSOR_SNAPSHOT_STALE_AFTER_MS;
  const updatedAt =
    typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : "";
  const isFresh = isFreshSnapshotTimestamp(updatedAt, now, staleAfterMs);

  return {
    online: !options.forceOffline && Boolean(snapshot.online) && isFresh,
    connectedSsid: typeof snapshot.connectedSsid === "string" ? snapshot.connectedSsid : "",
    mq135: typeof snapshot.mq135 === "string" ? snapshot.mq135 : "Unknown",
    mq136: typeof snapshot.mq136 === "string" ? snapshot.mq136 : "Unknown",
    mq135Raw: toIntOrNull(snapshot.mq135Raw),
    mq136Raw: toIntOrNull(snapshot.mq136Raw),
    rfidHex: typeof snapshot.rfidHex === "string" ? snapshot.rfidHex : "",
    rfidCard: typeof snapshot.rfidCard === "string" ? snapshot.rfidCard : "",
    lastRfidMs: toIntOrNull(snapshot.lastRfidMs),
    rfidEvent: typeof snapshot.rfidEvent === "string" ? snapshot.rfidEvent : "none",
    sessionActive: Boolean(snapshot.sessionActive),
    activeRfidHex: typeof snapshot.activeRfidHex === "string" ? snapshot.activeRfidHex : "",
    activeRfidCard: typeof snapshot.activeRfidCard === "string" ? snapshot.activeRfidCard : "",
    activeSessionStartMs: toIntOrNull(snapshot.activeSessionStartMs),
    activeSessionDurationMs: toIntOrNull(snapshot.activeSessionDurationMs),
    currentSessionStatus: typeof snapshot.currentSessionStatus === "string" ? snapshot.currentSessionStatus : "IDLE",
    lastSessionStatus: typeof snapshot.lastSessionStatus === "string" ? snapshot.lastSessionStatus : "NONE",
    lastSessionDurationMs: toIntOrNull(snapshot.lastSessionDurationMs),
    lastSessionEndMs: toIntOrNull(snapshot.lastSessionEndMs),
    completedSessionCount: toIntOrNull(snapshot.completedSessionCount),
    falseEntryCount: toIntOrNull(snapshot.falseEntryCount),
    noExitTimeoutCount: toIntOrNull(snapshot.noExitTimeoutCount),
    noExitTimeoutMs: toIntOrNull(snapshot.noExitTimeoutMs),
    updatedAt: updatedAt || now.toISOString(),
  };
}
