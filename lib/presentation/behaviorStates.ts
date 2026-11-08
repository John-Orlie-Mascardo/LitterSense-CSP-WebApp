/**
 * behaviorStates.ts
 *
 * Presentation-only definitions and derivation helpers for six behavior states.
 *
 * DONE: shared copy/colors, computed-baseline gating, Watch, Normal (provisional),
 * upstream status mapping, severity, no-data formatting
 * PLACEHOLDER: none
 *
 * Check order (BASELINE_BRIEF, Nov 8): Unattributed → Incomplete → Abnormal →
 * Watch → Normal / Normal (provisional) / Insufficient data.
 *
 * NEXT: manuscript owners must approve any state-copy change before a frontend
 * developer edits this single source of truth.
 */

import {
  ABNORMAL_DURATION_SECS,
  DASHBOARD_VISIT_WARNING_COUNT,
  INCOMPLETE_SESSION_FLOOR_SECS,
} from "../configs/behaviorThresholds";
import type { PersonalBaseline } from "../utils/personalBaseline";

export type BehaviorStateId =
  | "normal"
  | "watch"
  | "abnormal"
  | "insufficient"
  | "incomplete"
  | "unattributed";

export interface BehaviorStateDefinition {
  readonly id: BehaviorStateId;
  readonly label: string;
  readonly description: string;
  readonly dotClass: string;
  readonly badgeClass: string;
  readonly severity: number;
}

// NOTE(manuscript): Every state name and description below must match the
// capstone paper. Home, Reports, and printable output consume this same array.
export const BEHAVIOR_STATES: readonly BehaviorStateDefinition[] = [
  {
    id: "normal",
    label: "Normal",
    description: "Matches this cat’s usual pattern and set limits.",
    dotClass: "bg-litter-normal",
    badgeClass: "bg-status-normal text-status-normal",
    severity: 20,
  },
  {
    id: "watch",
    label: "Watch",
    description: "Within set limits, but different from this cat’s usual pattern.",
    dotClass: "bg-litter-watch",
    badgeClass: "bg-status-watch text-status-watch",
    severity: 50,
  },
  {
    id: "abnormal",
    label: "Abnormal",
    description: "A set activity limit was crossed.",
    dotClass: "bg-litter-abnormal",
    badgeClass: "bg-status-abnormal text-status-abnormal",
    severity: 60,
  },
  {
    id: "insufficient",
    label: "Insufficient data",
    description: "More sessions are needed to build this cat’s usual pattern.",
    dotClass: "bg-litter-insufficient",
    badgeClass: "bg-status-insufficient text-status-insufficient",
    severity: 10,
  },
  {
    id: "incomplete",
    label: "Incomplete",
    description: "The visit was too short, or its exit could not be confirmed.",
    dotClass: "bg-litter-incomplete",
    badgeClass: "bg-status-incomplete text-status-incomplete",
    severity: 40,
  },
  {
    id: "unattributed",
    label: "Unattributed",
    description: "Litter box use was detected, but no collar tag was read.",
    dotClass: "bg-litter-unattributed",
    badgeClass: "bg-status-unattributed text-status-unattributed",
    severity: 30,
  },
];

export const BEHAVIOR_STATE_BY_ID = Object.fromEntries(
  BEHAVIOR_STATES.map((state) => [state.id, state]),
) as Record<BehaviorStateId, BehaviorStateDefinition>;

/**
 * The parts of the computed personal baseline (lib/utils/personalBaseline.ts)
 * that state derivation needs. Bands may be null when a caller only knows that
 * a baseline exists (for example, a saved report snapshot); Watch then cannot fire.
 */
export type BaselineBandsLike = Pick<
  PersonalBaseline,
  "established" | "visitBand" | "durationBand"
>;

/** Per-owner lookup built once from the loaded visits (see lib/presentation/catBehavior.ts). */
export interface CatBehaviorIndex {
  readonly baselineByCatId: ReadonlyMap<string, PersonalBaseline>;
  /** For each counted visit: how many counted visits the cat had that Manila day, up to and including it. */
  readonly countedVisitsTodayBySessionId: ReadonlyMap<string, number>;
  readonly catIdsWithCountedVisits: ReadonlySet<string>;
}

/** A behavior state plus the "Normal (provisional)" flag: Normal before a baseline exists. */
export interface BehaviorDisplay {
  readonly state: BehaviorStateId;
  readonly provisional: boolean;
}

const INCOMPLETE_STATUSES = new Set([
  "SHORT_SESSION",
  "NO_EXIT_TIMEOUT",
  "SESSION_INTERRUPTED",
  "FALSE_ENTRY_IGNORED",
]);

const display = (state: BehaviorStateId, provisional = false): BehaviorDisplay => ({
  state,
  provisional,
});

type RecordedDataInput = {
  readonly sessions?: readonly unknown[] | null;
  readonly stats?: {
    readonly visits?: number;
    readonly lastVisit?: string;
  } | null;
  readonly trendData?: readonly {
    readonly visits?: number;
    readonly avgDuration?: number;
  }[] | null;
};

/** True only for a computed baseline with at least 7 qualifying days. Never provisional. */
export function hasEstablishedBaseline(
  baseline: BaselineBandsLike | null | undefined,
): baseline is BaselineBandsLike & { readonly established: true } {
  return baseline?.established === true;
}

export function hasRecordedCatData({ sessions, stats, trendData }: RecordedDataInput) {
  if ((sessions?.length ?? 0) > 0) return true;
  if ((stats?.visits ?? 0) > 0 || Boolean(stats?.lastVisit?.trim())) return true;
  return Boolean(
    trendData?.some(
      (point) => (point.visits ?? 0) > 0 || (point.avgDuration ?? 0) > 0,
    ),
  );
}

export interface SessionBehaviorInput {
  readonly durationSecs?: number | null;
  readonly sessionStatus?: string | null;
  /** Accepted for convenience; the generic anomaly flag never decides a state on its own. */
  readonly anomaly?: boolean;
  readonly anomalyType?: string | null;
  readonly isAttributed: boolean;
  /** The cat's computed baseline. Absent or not established → Normal (provisional), never Watch. */
  readonly baseline?: BaselineBandsLike | null;
  /** Counted visits by this cat on this visit's Manila day, up to and including this one. */
  readonly countedVisitsToday?: number | null;
}

export function getSessionBehavior({
  durationSecs,
  sessionStatus,
  anomalyType,
  isAttributed,
  baseline,
  countedVisitsToday,
}: SessionBehaviorInput): BehaviorDisplay {
  if (!isAttributed) return display("unattributed");

  const normalizedStatus = sessionStatus?.toUpperCase() ?? "";
  // Aggregate and active rows do not describe a completed visit's duration.
  const hasCompletedDuration = normalizedStatus !== "DAILY_SUMMARY" &&
    normalizedStatus !== "IN_PROGRESS" && typeof durationSecs === "number" &&
    Number.isFinite(durationSecs) && durationSecs >= 0;

  // 1. Incomplete: kept on record, never counted.
  if (
    (hasCompletedDuration && durationSecs < INCOMPLETE_SESSION_FLOOR_SECS) ||
    INCOMPLETE_STATUSES.has(normalizedStatus) ||
    anomalyType === "Short session" ||
    anomalyType === "No exit timeout"
  ) {
    return display("incomplete");
  }

  // 2. Abnormal: fixed limits, with or without a baseline.
  const visitsSoFar = countedVisitsToday ?? 0;
  if (
    normalizedStatus === "ABNORMAL" ||
    (hasCompletedDuration && durationSecs >= ABNORMAL_DURATION_SECS) ||
    visitsSoFar > DASHBOARD_VISIT_WARNING_COUNT
  ) {
    return display("abnormal");
  }

  if (!hasCompletedDuration) return display("insufficient");

  // 3. Watch: above the cat's own range. Needs an established baseline; display only.
  if (hasEstablishedBaseline(baseline)) {
    const aboveDuration = baseline.durationBand !== null &&
      durationSecs > baseline.durationBand[1];
    const aboveVisits = baseline.visitBand !== null &&
      visitsSoFar > baseline.visitBand[1];
    if (normalizedStatus === "WATCH" || aboveDuration || aboveVisits) {
      return display("watch");
    }
    return display("normal");
  }

  // 4. Counted visit, no baseline yet, no fixed limit crossed.
  return display("normal", true);
}

export function getSessionDisplayState(input: SessionBehaviorInput): BehaviorStateId {
  return getSessionBehavior(input).state;
}

/** Looks up the cat's baseline and same-day visit count for one session. */
export function getIndexedSessionBehavior(
  session: Omit<SessionBehaviorInput, "isAttributed" | "baseline" | "countedVisitsToday"> & {
    readonly id: string;
    readonly catId?: string | null;
  },
  index: CatBehaviorIndex | null | undefined,
  isAttributed = Boolean(session.catId),
): BehaviorDisplay {
  return getSessionBehavior({
    durationSecs: session.durationSecs,
    sessionStatus: session.sessionStatus,
    anomalyType: session.anomalyType,
    isAttributed,
    baseline: isAttributed && session.catId
      ? index?.baselineByCatId.get(session.catId)
      : null,
    countedVisitsToday: index?.countedVisitsTodayBySessionId.get(session.id),
  });
}

/**
 * Cat-level summary. Insufficient data only when the cat has no counted visits
 * at all; otherwise at least Normal (provisional until a baseline exists), raised
 * by the most severe of the given session states.
 */
export function summarizeCatBehavior({
  sessionStates,
  hasCountedVisits,
  baseline,
}: {
  readonly sessionStates: readonly BehaviorDisplay[];
  readonly hasCountedVisits: boolean;
  readonly baseline?: BaselineBandsLike | null;
}): BehaviorDisplay {
  const states = sessionStates.map((session) => session.state);
  if (hasCountedVisits) states.push("normal");
  const state = getMostSevereState(states);
  return display(state, state === "normal" && !hasEstablishedBaseline(baseline));
}

export function getBehaviorStateLabel(state: BehaviorStateId, provisional = false) {
  return provisional && state === "normal"
    ? "Normal (provisional)"
    : BEHAVIOR_STATE_BY_ID[state].label;
}

export function getMostSevereState(
  states: readonly BehaviorStateId[],
): BehaviorStateId {
  if (states.length === 0) return "insufficient";
  return states.reduce((mostSevere, state) =>
    BEHAVIOR_STATE_BY_ID[state].severity > BEHAVIOR_STATE_BY_ID[mostSevere].severity
      ? state
      : mostSevere,
  );
}

export function formatMetricValue<T extends string | number>(
  value: T | null | undefined,
  hasData: boolean,
): T | "No data yet" {
  if (!hasData || value === null || value === undefined || value === "" || value === "--") {
    return "No data yet";
  }
  return value;
}

