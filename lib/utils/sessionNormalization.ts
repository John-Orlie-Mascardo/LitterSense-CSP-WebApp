/**
 * sessionNormalization.ts
 *
 * Normalizes existing Firestore session documents for every presentation consumer.
 *
 * DONE: timestamp fallbacks, local activity date, numeric defaults, upstream status fields
 * PLACEHOLDER: none
 *
 * NEXT: firmware owners must coordinate any persisted session-field change with this adapter.
 */

import type { Session } from "@/lib/interfaces/Session";
import {
  getLocalDateKey,
  getSessionLocalDateKey,
  toIsoStringFromDateLike,
} from "@/lib/utils/sessionDate";

const parseString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const parseNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const formatLocalTime = (date: Date) =>
  date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

const inferSessionStartedAt = (endedAt: string, durationSecs: number) => {
  if (!endedAt) return "";
  const parsed = new Date(endedAt);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(parsed.getTime() - Math.max(0, durationSecs) * 1000).toISOString();
};

export function normalizeSessionDocument(
  id: string,
  data: Record<string, unknown>,
): Session {
  const endedAt =
    toIsoStringFromDateLike(data.endedAt) ||
    toIsoStringFromDateLike(data.createdAt);
  const durationSecs = parseNumber(data.durationSecs);
  const startedAt =
    toIsoStringFromDateLike(data.startedAt) ||
    inferSessionStartedAt(endedAt, durationSecs);
  const eventDate = endedAt ? new Date(endedAt) : new Date();

  return {
    id,
    catId: parseString(data.catId),
    date:
      getSessionLocalDateKey({
        date: data.date,
        endedAt: data.endedAt,
        createdAt: data.createdAt,
      }) || getLocalDateKey(eventDate),
    time: parseString(data.time) || formatLocalTime(eventDate),
    startedAt,
    endedAt,
    durationSecs,
    mq135Delta: parseNumber(data.mq135Delta),
    mq136Delta: parseNumber(data.mq136Delta),
    anomaly: data.anomaly === true,
    anomalyType:
      typeof data.anomalyType === "string" ? data.anomalyType : null,
    sessionStatus: parseString(data.sessionStatus, "NORMAL"),
  };
}
