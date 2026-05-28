type TrendPoint = {
  day: string;
  visits: number;
  avgDuration: number;
};

type DurationSession = {
  catId: string;
  durationSecs: number;
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
