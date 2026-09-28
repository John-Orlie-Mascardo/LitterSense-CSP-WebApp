/**
 * sessionHistory.ts
 *
 * Owns Session History filter state, presets, state mapping, sorting, and date groups.
 *
 * DONE: URL-safe filters, loading-safe cat restoration, six-state filtering,
 * inclusive ranges, sorting, and attributed/unattributed group partitioning
 * PLACEHOLDER: Firestore transport is isolated in useSessionHistory
 *
 * NEXT: keep state labels sourced from behaviorStates when presentation copy changes.
 */

import type { Session } from "@/lib/interfaces/Session";
import {
  BEHAVIOR_STATES,
  getSessionDisplayState,
  type BehaviorStateId,
} from "@/lib/presentation/behaviorStates";
import {
  getLocalDateKey,
  getSessionActivityDateKey,
} from "@/lib/utils/sessionDate";
import { getSessionSortValue } from "@/lib/utils/sessionTime";

export type HistoryPreset = "last7" | "last30" | "thisMonth" | "custom";
export type HistorySort = "desc" | "asc";

export interface HistoryFilters {
  readonly startDate: string;
  readonly endDate: string;
  readonly preset: HistoryPreset;
  readonly catId: string;
  readonly states: readonly BehaviorStateId[];
  readonly sort: HistorySort;
}

export const HISTORY_STORAGE_KEY = "littersense-session-history-filters";
export const HISTORY_BATCH_SIZE = 20;

const HISTORY_PRESETS = new Set<HistoryPreset>([
  "last7",
  "last30",
  "thisMonth",
  "custom",
]);
const HISTORY_SORTS = new Set<HistorySort>(["desc", "asc"]);
const STATE_IDS = new Set(BEHAVIOR_STATES.map((state) => state.id));

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const isDateKey = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day;
};

export function getHistoryPresetRange(
  preset: Exclude<HistoryPreset, "custom">,
  now = new Date(),
): Pick<HistoryFilters, "startDate" | "endDate"> {
  const endDate = getLocalDateKey(now);
  if (preset === "thisMonth") {
    return {
      startDate: getLocalDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate,
    };
  }
  return {
    startDate: getLocalDateKey(addDays(now, preset === "last7" ? -6 : -29)),
    endDate,
  };
}

export function getDefaultHistoryFilters(now = new Date()): HistoryFilters {
  return {
    ...getHistoryPresetRange("last30", now),
    preset: "last30",
    catId: "all",
    states: BEHAVIOR_STATES.map((state) => state.id),
    sort: "desc",
  };
}

export function parseHistoryFilters(
  params: URLSearchParams,
  validCatIds: readonly string[],
  now = new Date(),
  validCatIdsReady = true,
): HistoryFilters {
  const defaults = getDefaultHistoryFilters(now);
  const start = params.get("start");
  const end = params.get("end");
  const presetValue = params.get("preset") as HistoryPreset | null;
  const sortValue = params.get("sort") as HistorySort | null;
  const catValue = params.get("cat");
  const requestedStates = (params.get("states") ?? "")
    .split(",")
    .filter((state): state is BehaviorStateId => STATE_IDS.has(state as BehaviorStateId));

  const hasValidRange = isDateKey(start) && isDateKey(end) && start <= end;
  const validCatSet = new Set(validCatIds);
  const catId = catValue === "unattributed" || catValue === "all" ||
    (catValue !== null && (!validCatIdsReady || validCatSet.has(catValue)))
    ? catValue
    : defaults.catId;

  return {
    startDate: hasValidRange ? start : defaults.startDate,
    endDate: hasValidRange ? end : defaults.endDate,
    preset: presetValue && HISTORY_PRESETS.has(presetValue)
      ? presetValue
      : defaults.preset,
    catId,
    states: requestedStates.length > 0 ? requestedStates : defaults.states,
    sort: sortValue && HISTORY_SORTS.has(sortValue) ? sortValue : defaults.sort,
  };
}

/** Keeps unattributed/unknown-cat records after named-cat records within a day. */
export function partitionHistorySessions(
  sessions: readonly Session[],
  catIds: ReadonlySet<string>,
): { readonly attributed: Session[]; readonly unattributed: Session[] } {
  const attributed: Session[] = [];
  const unattributed: Session[] = [];

  for (const session of sessions) {
    if (session.catId && catIds.has(session.catId)) {
      attributed.push(session);
    } else {
      unattributed.push(session);
    }
  }

  return { attributed, unattributed };
}

export function serializeHistoryFilters(filters: HistoryFilters): URLSearchParams {
  return new URLSearchParams({
    start: filters.startDate,
    end: filters.endDate,
    preset: filters.preset,
    cat: filters.catId,
    states: filters.states.join(","),
    sort: filters.sort,
  });
}

export function selectCalendarDate(
  startDate: string | null,
  endDate: string | null,
  selectedDate: string,
): { startDate: string; endDate: string | null } {
  if (!startDate || endDate || selectedDate < startDate) {
    return { startDate: selectedDate, endDate: null };
  }
  return { startDate, endDate: selectedDate };
}

export function getHistorySessionState(
  session: Session,
  catIds: ReadonlySet<string>,
  baselineCatIds: ReadonlySet<string>,
): BehaviorStateId {
  const isAttributed = Boolean(session.catId) && catIds.has(session.catId);
  return getSessionDisplayState({
    sessionStatus: session.sessionStatus,
    anomaly: session.anomaly,
    anomalyType: session.anomalyType,
    isAttributed,
    baselineEstablished: isAttributed && baselineCatIds.has(session.catId),
  });
}

export function filterAndSortHistorySessions(
  sessions: readonly Session[],
  filters: HistoryFilters,
  catIds: ReadonlySet<string>,
  baselineCatIds: ReadonlySet<string>,
): Session[] {
  const stateSet = new Set(filters.states);
  return sessions
    .filter((session) => {
      const date = getSessionActivityDateKey(session);
      if (date < filters.startDate || date > filters.endDate) return false;

      const isAttributed = Boolean(session.catId) && catIds.has(session.catId);
      if (filters.catId === "unattributed" && isAttributed) return false;
      if (filters.catId !== "all" && filters.catId !== "unattributed" &&
        session.catId !== filters.catId) return false;

      return stateSet.has(
        getHistorySessionState(session, catIds, baselineCatIds),
      );
    })
    .sort((left, right) => {
      const difference = getSessionSortValue(left) - getSessionSortValue(right);
      return filters.sort === "asc" ? difference : -difference;
    });
}

export function groupHistorySessions(
  sessions: readonly Session[],
): readonly {
  readonly dateKey: string;
  readonly dateLabel: string;
  readonly sessions: readonly Session[];
}[] {
  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const dateKey = getSessionActivityDateKey(session);
    groups.set(dateKey, [...(groups.get(dateKey) ?? []), session]);
  }
  return Array.from(groups.entries()).map(([dateKey, groupedSessions]) => ({
    dateKey,
    dateLabel: new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    sessions: groupedSessions,
  }));
}

export function formatHistoryRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}
