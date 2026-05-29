type TimestampLike = {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
};

export type SessionDateSource = {
  date?: unknown;
  endedAt?: unknown;
  createdAt?: unknown;
  startedAt?: unknown;
};

export const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseDateLike = (value: unknown): Date | null => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const timestampLike = value as TimestampLike;

  if (typeof timestampLike.toDate === "function") {
    const parsed = timestampLike.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof timestampLike.seconds === "number") {
    const millis =
      timestampLike.seconds * 1000 +
      Math.floor((timestampLike.nanoseconds ?? 0) / 1_000_000);
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

export const toIsoStringFromDateLike = (value: unknown) =>
  parseDateLike(value)?.toISOString() ?? "";

export const getSessionLocalDateKey = (session: SessionDateSource) => {
  const endedAt = parseDateLike(session.endedAt);
  if (endedAt) return getLocalDateKey(endedAt);

  const startedAt = parseDateLike(session.startedAt);
  if (startedAt) return getLocalDateKey(startedAt);

  const createdAt = parseDateLike(session.createdAt);
  if (createdAt) return getLocalDateKey(createdAt);

  if (typeof session.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(session.date)) {
    return session.date;
  }

  const datedAt = parseDateLike(session.date);
  return datedAt ? getLocalDateKey(datedAt) : "";
};

export const getSessionActivityDateKey = (session: SessionDateSource) => {
  const key = getSessionLocalDateKey(session);
  if (key) return key;

  const fallback = parseDateLike(session.endedAt) ?? parseDateLike(session.startedAt);
  return fallback ? getLocalDateKey(fallback) : "";
};
