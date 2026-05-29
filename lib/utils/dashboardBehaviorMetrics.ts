type TrendPoint = {
  day: string;
  visits: number;
  avgDuration: number;
};

type DurationSession = {
  catId: string;
  durationSecs: number;
  date?: string;
  startedAt?: string;
  endedAt?: string;
  sessionStatus?: string | null;
  summaryVisits?: number;
};

type TodayStats = {
  visits: number;
  avgDuration: string;
};

const hasDurationValue = (value: string | undefined) =>
  Boolean(value && value !== "--");

const formatDurationLabel = (seconds: number) => {
  if (seconds <= 0) return "--";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`
    : `${minutes}m`;
};

const getSessionDateKey = (session: DurationSession) => {
  const timestamp = session.endedAt || session.startedAt;
  if (timestamp) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
      const day = `${parsed.getDate()}`.padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(session.date ?? "")
    ? session.date ?? ""
    : "";
};

const countableSessionVisitTotal = (session: DurationSession) => {
  if (session.sessionStatus === "IN_PROGRESS") return 0;
  if (session.sessionStatus === "FALSE_ENTRY_IGNORED") return 0;
  return Math.max(1, session.summaryVisits ?? 1);
};

const activeTrendPoints = (trendData: TrendPoint[] | null) =>
  (trendData ?? []).filter((point) => point.visits > 0 || point.avgDuration > 0);

export function formatAverageDurationFromTrend(trendData: TrendPoint[] | null) {
  const activePoints = activeTrendPoints(trendData).filter(
    (point) => point.visits > 0 && point.avgDuration > 0,
  );
  const totalVisits = activePoints.reduce((sum, point) => sum + point.visits, 0);
  if (totalVisits <= 0) return "--";

  const totalDuration = activePoints.reduce(
    (sum, point) => sum + point.avgDuration * point.visits,
    0,
  );

  return formatDurationLabel(Math.round(totalDuration / totalVisits));
}

export function getFallbackAverageDuration(
  currentAvgDuration: string | undefined,
  trendData: TrendPoint[] | null,
  sessions: DurationSession[],
  catId: string,
) {
  if (hasDurationValue(currentAvgDuration)) return currentAvgDuration ?? "--";

  const trendAverage = formatAverageDurationFromTrend(trendData);
  if (trendAverage !== "--") return trendAverage;

  const catSessions = sessions.filter(
    (session) => session.catId === catId && session.durationSecs > 0,
  );
  if (catSessions.length === 0) return "--";

  const totalDuration = catSessions.reduce(
    (sum, session) => sum + session.durationSecs,
    0,
  );
  return formatDurationLabel(Math.round(totalDuration / catSessions.length));
}

export function getDisplayTodayStats(
  currentStats: TodayStats | undefined,
  recentSessions: DurationSession[],
  catId: string,
  todayDateKey: string,
) {
  const baseStats = currentStats ?? { visits: 0, avgDuration: "--" };
  const recentVisitCount = recentSessions
    .filter(
      (session) =>
        session.catId === catId &&
        getSessionDateKey(session) === todayDateKey,
    )
    .reduce((total, session) => total + countableSessionVisitTotal(session), 0);

  if (recentVisitCount <= baseStats.visits) return baseStats;
  return { ...baseStats, visits: recentVisitCount };
}

export function getBehaviorTrendLabel(trendData: TrendPoint[] | null) {
  const activePoints = activeTrendPoints(trendData);
  if (activePoints.length === 0) return "No trend yet";
  if (activePoints.length === 1) return "Activity recorded";

  const first = activePoints[0];
  const last = activePoints[activePoints.length - 1];
  if (last.visits > first.visits) return "More active";
  if (last.visits < first.visits) return "Less active";
  return "Stable";
}
