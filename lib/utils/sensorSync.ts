export const COUNTABLE_SESSION_STATUSES = [
  "NORMAL",
  "ABNORMAL",
  "SHORT_SESSION",
  "NO_EXIT_TIMEOUT",
] as const;

type CountableSessionStatus = (typeof COUNTABLE_SESSION_STATUSES)[number];

export interface NormalizedSensorSyncEvent {
  eventId: string;
  status: CountableSessionStatus;
  durationSecs: number;
  endedAt: string;
  rfidCard: string;
  rfidHex: string;
  mq135Delta: number;
  mq136Delta: number;
}

export interface IgnoredSensorSyncEvent {
  reason: "status_not_countable" | "missing_rfid";
  status: string;
  eventId: string;
}

export interface SensorSyncRequest {
  configToken: string;
  events: NormalizedSensorSyncEvent[];
  ignored: IgnoredSensorSyncEvent[];
}

interface VisitWritePlanInput {
  userId: string;
  catId: string;
  configToken: string;
  event: NormalizedSensorSyncEvent;
  sessionId: string;
  serverNow: Date;
}

export interface VisitWritePlan {
  sessionPath: string;
  sessionData: Record<string, unknown>;
  summaryPaths: string[];
  summaryData: Record<string, unknown>;
  durationSecs: number;
}

const DEFAULT_VISIT_DURATION_SECS = 1;
const SESSION_ID_MAX_LENGTH = 96;

const getObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

const getString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const getFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const getFirstString = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = getString(source[key]).trim();
    if (value) return value;
  }

  return "";
};

const getFirstNumber = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = getFiniteNumber(source[key]);
    if (value !== null) return value;
  }

  return null;
};

const isCountableStatus = (status: string): status is CountableSessionStatus =>
  COUNTABLE_SESSION_STATUSES.includes(status as CountableSessionStatus);

const normalizeTag = (value: string) =>
  value.toLowerCase().replace(/[^a-f0-9]/g, "");

const hexToDec = (hex: string) => {
  const n = Number.parseInt(hex, 16);
  return Number.isNaN(n) ? "" : n.toString();
};

const parseEventDate = (
  raw: Record<string, unknown>,
  receivedAt: Date,
): Date => {
  const textValue = getFirstString(raw, [
    "endedAt",
    "recordedAt",
    "timestamp",
    "createdAt",
  ]);
  if (textValue) {
    const parsed = new Date(textValue);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const epochValue = getFirstNumber(raw, ["endedAtMs", "recordedAtMs", "timestampMs"]);
  if (epochValue !== null && epochValue > 1_000_000_000_000) {
    const parsed = new Date(epochValue);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const epochSecondsValue = getFirstNumber(raw, [
    "endedAtSec",
    "recordedAtSec",
    "timestamp",
  ]);
  if (epochSecondsValue !== null && epochSecondsValue > 1_000_000_000) {
    const parsed = new Date(epochSecondsValue * 1000);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return receivedAt;
};

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatLocalTime = (date = new Date()) =>
  date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

const sanitizeDocumentIdPart = (value: string) =>
  value.trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, SESSION_ID_MAX_LENGTH);

const stableHash = (value: string) => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }

  return (hash >>> 0).toString(36);
};

const getVisitAnomaly = (
  durationSecs: number,
  status: CountableSessionStatus,
) => {
  const isAnomaly =
    status === "ABNORMAL" ||
    status === "NO_EXIT_TIMEOUT" ||
    status === "SHORT_SESSION" ||
    durationSecs >= 300;

  if (!isAnomaly) return { anomaly: false, anomalyType: null };
  if (status === "NO_EXIT_TIMEOUT") {
    return { anomaly: true, anomalyType: "No exit timeout" };
  }
  if (status === "SHORT_SESSION") {
    return { anomaly: true, anomalyType: "Short session" };
  }
  return { anomaly: true, anomalyType: "Extended duration" };
};

export function normalizeSensorSyncRequest(
  body: unknown,
  receivedAt = new Date(),
): SensorSyncRequest {
  const root = getObject(body);
  const configToken = getString(root.configToken).trim();
  const rawEvents =
    Array.isArray(root.events)
      ? root.events
      : Array.isArray(root.sessions)
        ? root.sessions
        : Array.isArray(root.readings)
          ? root.readings
          : [root];
  const events: NormalizedSensorSyncEvent[] = [];
  const ignored: IgnoredSensorSyncEvent[] = [];

  rawEvents.forEach((rawEvent, index) => {
    const raw = getObject(rawEvent);
    const eventId = getFirstString(raw, ["eventId", "syncId", "id"]);
    const status = getFirstString(raw, [
      "lastSessionStatus",
      "sessionStatus",
      "status",
    ]).toUpperCase();
    const safeEventId = eventId || `${index}`;

    if (!isCountableStatus(status)) {
      ignored.push({
        reason: "status_not_countable",
        status: status || "NONE",
        eventId: safeEventId,
      });
      return;
    }

    const rfidCard = getFirstString(raw, [
      "activeRfidCard",
      "rfidCard",
      "tagDec",
      "card",
      "tag",
    ]);
    const rfidHex = getFirstString(raw, [
      "activeRfidHex",
      "rfidHex",
      "tagHex",
      "hex",
      "uid",
    ]);
    if (!rfidCard && !rfidHex) {
      ignored.push({
        reason: "missing_rfid",
        status,
        eventId: safeEventId,
      });
      return;
    }

    const durationSecs = getFirstNumber(raw, ["durationSecs", "sessionDurationSecs"]);
    const rawDuration = getFirstNumber(raw, ["duration"]);
    const durationMs = getFirstNumber(raw, [
      "lastSessionDurationMs",
      "durationMs",
      "sessionDurationMs",
    ]) ?? (rawDuration !== null && rawDuration > 1000 ? rawDuration : null);
    const safeDurationSecs = Math.max(
      DEFAULT_VISIT_DURATION_SECS,
      Math.round(
        durationSecs ??
          (rawDuration !== null && rawDuration <= 1000
            ? rawDuration
            : ((durationMs ?? 0) / 1000)),
      ),
    );
    const endedAt = parseEventDate(raw, receivedAt).toISOString();

    events.push({
      eventId,
      status,
      durationSecs: safeDurationSecs,
      endedAt,
      rfidCard,
      rfidHex,
      mq135Delta: getFirstNumber(raw, ["mq135Delta"]) ?? 0,
      mq136Delta: getFirstNumber(raw, ["mq136Delta"]) ?? 0,
    });
  });

  return {
    configToken,
    events,
    ignored,
  };
}

export function findCatIdByRfid(
  catDetails: Array<[string, { rfidTag?: unknown }]>,
  card: string,
  hex: string,
) {
  const normalizedCard = normalizeTag(card);
  const normalizedHex = normalizeTag(hex);
  const decimalCard = hexToDec(card);
  const decimalHex = hexToDec(hex);

  for (const [catId, details] of catDetails) {
    const tag = normalizeTag(getString(details.rfidTag));
    if (!tag) continue;

    if (
      tag === normalizedCard ||
      tag === normalizedHex ||
      tag === decimalCard ||
      tag === decimalHex
    ) {
      return catId;
    }
  }

  return null;
}

export function buildSessionDocumentId(
  configToken: string,
  event: NormalizedSensorSyncEvent,
) {
  const explicitId = sanitizeDocumentIdPart(event.eventId);
  if (explicitId) return `sync_${explicitId}`;

  return `sync_${stableHash(
    [
      configToken,
      event.rfidCard,
      event.rfidHex,
      event.status,
      event.durationSecs,
      event.endedAt,
    ].join("|"),
  )}`;
}

export function buildVisitWritePlan({
  userId,
  catId,
  configToken,
  event,
  sessionId,
  serverNow,
}: VisitWritePlanInput): VisitWritePlan {
  const endedAt = new Date(event.endedAt);
  const eventDate = Number.isNaN(endedAt.getTime()) ? serverNow : endedAt;
  const dateKey = getLocalDateKey(eventDate);
  const nowIso = serverNow.toISOString();
  const anomaly = getVisitAnomaly(event.durationSecs, event.status);
  const summaryPaths = [
    `users/${userId}/dailyCatStats/${dateKey}/cats/${catId}`,
    `users/${userId}/catStats/${catId}/daily/${dateKey}`,
  ];

  if (dateKey === getLocalDateKey(serverNow)) {
    summaryPaths.push(`users/${userId}/catStats/${catId}`);
  }

  return {
    sessionPath: `users/${userId}/sessions/${sessionId}`,
    sessionData: {
      catId,
      configToken,
      date: dateKey,
      time: formatLocalTime(eventDate),
      durationSecs: event.durationSecs,
      mq135Delta: event.mq135Delta,
      mq136Delta: event.mq136Delta,
      anomaly: anomaly.anomaly,
      anomalyType: anomaly.anomalyType,
      sessionStatus: event.status,
      syncedFromDevice: true,
      createdAt: nowIso,
      endedAt: eventDate.toISOString(),
    },
    summaryPaths,
    summaryData: {
      catId,
      date: dateKey,
      lastVisit: eventDate.toISOString(),
      updatedAt: nowIso,
    },
    durationSecs: event.durationSecs,
  };
}
