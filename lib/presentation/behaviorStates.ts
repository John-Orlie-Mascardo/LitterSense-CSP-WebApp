/**
 * behaviorStates.ts
 *
 * Presentation-only definitions and derivation helpers for six behavior states.
 *
 * DONE: shared copy/colors, baseline gating, upstream status mapping, severity, no-data formatting
 * PLACEHOLDER: none
 *
 * NEXT: manuscript owners must approve any state-copy change before a frontend
 * developer edits this single source of truth.
 */

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
    description: "The visit was too short to count as a completed session.",
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

type BaselineLike = {
  readonly avgVisitsPerDay?: number;
  readonly avgDurationSecs?: number;
  readonly lastUpdated?: string;
};

type DetailsLike = {
  readonly baseline?: BaselineLike | null;
} | null | undefined;

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

export function hasEstablishedBaseline(details: DetailsLike) {
  const baseline = details?.baseline;
  return Boolean(
    baseline &&
      (baseline.avgVisitsPerDay ?? 0) > 0 &&
      (baseline.avgDurationSecs ?? 0) > 0 &&
      baseline.lastUpdated?.trim(),
  );
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

export function getCatDisplayState({
  persistedStatus,
  hasData,
  baselineEstablished,
}: {
  readonly persistedStatus?: string | null;
  readonly hasData: boolean;
  readonly baselineEstablished: boolean;
}): BehaviorStateId {
  if (!hasData) return "insufficient";

  const normalizedStatus = persistedStatus?.toLowerCase();
  if (normalizedStatus === "abnormal") return "abnormal";
  if (!baselineEstablished) return "insufficient";
  if (normalizedStatus === "watch") return "watch";
  return "normal";
}

export function getSessionDisplayState({
  sessionStatus,
  anomaly,
  anomalyType,
  isAttributed,
  baselineEstablished,
}: {
  readonly sessionStatus?: string | null;
  readonly anomaly?: boolean;
  readonly anomalyType?: string | null;
  readonly isAttributed: boolean;
  readonly baselineEstablished: boolean;
}): BehaviorStateId {
  if (!isAttributed) return "unattributed";

  const normalizedStatus = sessionStatus?.toUpperCase();
  if (
    normalizedStatus === "SHORT_SESSION" ||
    normalizedStatus === "FALSE_ENTRY_IGNORED" ||
    anomalyType === "Short session"
  ) {
    return "incomplete";
  }
  if (
    normalizedStatus === "ABNORMAL" ||
    normalizedStatus === "NO_EXIT_TIMEOUT" ||
    anomalyType === "No exit timeout" ||
    anomalyType === "Extended duration" ||
    anomaly === true
  ) {
    return "abnormal";
  }
  if (normalizedStatus === "WATCH") return "watch";
  if (normalizedStatus === "DAILY_SUMMARY" || normalizedStatus === "IN_PROGRESS") {
    return "insufficient";
  }
  return baselineEstablished ? "normal" : "insufficient";
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

