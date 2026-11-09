import {
  ABNORMAL_DURATION_SECS,
  BASELINE_MIN_DAYS,
  BASELINE_WINDOW_DAYS,
  DASHBOARD_VISIT_WARNING_COUNT,
  INCOMPLETE_SESSION_FLOOR_SECS,
  MAD_K,
  MAD_SCALE,
  MIN_DURATION_BAND_S,
  MIN_VISIT_BAND,
} from "@/lib/configs/behaviorThresholds";

const MANILA_TIME_ZONE = "Asia/Manila";
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;
const HAS_TIME_PATTERN = /[T\s]\d{2}/;
const EXPLICIT_TIME_ZONE_PATTERN = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/;

const INCOMPLETE_STATUSES = new Set([
  "SHORT_SESSION",
  "NO_EXIT_TIMEOUT",
  "SESSION_INTERRUPTED",
  "FALSE_ENTRY_IGNORED",
]);

const NON_VISIT_STATUSES = new Set(["DAILY_SUMMARY", "IN_PROGRESS"]);

const MANILA_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface PersonalBaselineVisit {
  readonly catId?: string | null;
  readonly date?: string | null;
  readonly startedAt?: string | null;
  readonly endedAt?: string | null;
  readonly durationSecs: number;
  readonly sessionStatus?: string | null;
}

export interface PersonalBaseline {
  readonly established: boolean;
  readonly daysUsed: number;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly medianVisitsPerDay: number | null;
  readonly medianDurationSecs: number | null;
  readonly visitBand: readonly [number, number] | null;
  readonly durationBand: readonly [number, number] | null;
}

interface CalendarParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface CountedDay {
  readonly durations: number[];
  hasAbnormalStatus: boolean;
}

const formatDateKey = ({ year, month, day }: CalendarParts) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const getManilaCalendarParts = (date: Date): CalendarParts => {
  const parts = MANILA_DATE_FORMATTER.formatToParts(date);
  const readPart = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: readPart("year"),
    month: readPart("month"),
    day: readPart("day"),
  };
};

const shiftCalendarDay = (date: CalendarParts, offsetDays: number) => {
  const shifted = new Date(Date.UTC(
    date.year,
    date.month - 1,
    date.day + offsetDays,
  ));

  return formatDateKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
};

const getValidDateKey = (value: string) => {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
};

/** Asia/Manila calendar day (YYYY-MM-DD) for an instant. */
export const getManilaDateKey = (date: Date) =>
  formatDateKey(getManilaCalendarParts(date));

const getTimestampDateKey = (value: string | null | undefined) => {
  const timestamp = value?.trim();
  if (!timestamp) return null;

  if (HAS_TIME_PATTERN.test(timestamp) && EXPLICIT_TIME_ZONE_PATTERN.test(timestamp)) {
    const parsed = new Date(timestamp);
    return Number.isFinite(parsed.getTime()) ? getManilaDateKey(parsed) : null;
  }

  const datePrefix = DATE_PREFIX_PATTERN.exec(timestamp)?.[1];
  return datePrefix ? getValidDateKey(datePrefix) : null;
};

/** Asia/Manila calendar day of a visit: end time, then start time, then stored date. */
export const getVisitManilaDateKey = (visit: PersonalBaselineVisit) => {
  const timestampKey =
    getTimestampDateKey(visit.endedAt) ??
    getTimestampDateKey(visit.startedAt);
  if (timestampKey) return timestampKey;

  const storedDate = visit.date?.trim();
  if (!storedDate) return null;
  return getValidDateKey(storedDate) ?? getTimestampDateKey(storedDate);
};

const normalizeStatus = (status: string | null | undefined) =>
  status?.trim().toUpperCase() || "NORMAL";

/**
 * A counted visit is attributed, completed, at least 15 s long, and not
 * Incomplete by status. Only counted visits enter visits per day, the
 * same-day visit count, and the baseline.
 */
export const isCountedVisit = (visit: PersonalBaselineVisit) => {
  if (!visit.catId?.trim()) return false;
  if (!Number.isFinite(visit.durationSecs)) return false;

  const status = normalizeStatus(visit.sessionStatus);
  if (NON_VISIT_STATUSES.has(status) || INCOMPLETE_STATUSES.has(status)) return false;
  return visit.durationSecs >= INCOMPLETE_SESSION_FLOOR_SECS;
};

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
};

const scaledMad = (values: readonly number[], center: number) =>
  MAD_SCALE * median(values.map((value) => Math.abs(value - center)));

export function buildPersonalBaseline(
  visits: readonly PersonalBaselineVisit[],
  now = new Date(),
): PersonalBaseline {
  if (!Number.isFinite(now.getTime())) {
    throw new RangeError("A valid current date is required to build a baseline.");
  }

  const today = getManilaCalendarParts(now);
  const windowStart = shiftCalendarDay(today, -BASELINE_WINDOW_DAYS);
  const windowEnd = shiftCalendarDay(today, -1);
  const countedByDay = new Map<string, CountedDay>();

  for (const visit of visits) {
    if (!isCountedVisit(visit)) continue;

    const status = normalizeStatus(visit.sessionStatus);
    const dayKey = getVisitManilaDateKey(visit);
    if (!dayKey || dayKey < windowStart || dayKey > windowEnd) continue;

    const countedDay = countedByDay.get(dayKey) ?? {
      durations: [],
      hasAbnormalStatus: false,
    };
    countedDay.durations.push(visit.durationSecs);
    countedDay.hasAbnormalStatus ||= status === "ABNORMAL";
    countedByDay.set(dayKey, countedDay);
  }

  const qualifyingDays = [...countedByDay.values()].filter((day) =>
    !day.hasAbnormalStatus &&
    day.durations.length <= DASHBOARD_VISIT_WARNING_COUNT &&
    day.durations.every((duration) => duration < ABNORMAL_DURATION_SECS)
  );
  const daysUsed = qualifyingDays.length;
  const established = daysUsed >= BASELINE_MIN_DAYS;

  if (!established) {
    return {
      established,
      daysUsed,
      windowStart,
      windowEnd,
      medianVisitsPerDay: null,
      medianDurationSecs: null,
      visitBand: null,
      durationBand: null,
    };
  }

  const dailyVisitTotals = qualifyingDays.map((day) => day.durations.length);
  const durations = qualifyingDays.flatMap((day) => day.durations);
  const medianVisitsPerDay = median(dailyVisitTotals);
  const medianDurationSecs = median(durations);
  const visitHalfWidth = Math.max(
    MAD_K * scaledMad(dailyVisitTotals, medianVisitsPerDay),
    MIN_VISIT_BAND,
  );
  const durationHalfWidth = Math.max(
    MAD_K * scaledMad(durations, medianDurationSecs),
    MIN_DURATION_BAND_S,
  );

  return {
    established,
    daysUsed,
    windowStart,
    windowEnd,
    medianVisitsPerDay,
    medianDurationSecs,
    visitBand: [
      medianVisitsPerDay - visitHalfWidth,
      medianVisitsPerDay + visitHalfWidth,
    ],
    durationBand: [
      medianDurationSecs - durationHalfWidth,
      medianDurationSecs + durationHalfWidth,
    ],
  };
}
