import {
  isCountedVisit,
  type PersonalBaselineVisit,
} from "@/lib/utils/personalBaseline";

export function getCountedReportMetrics<T extends PersonalBaselineVisit>(
  sessions: readonly T[],
  inclusiveDays: number,
) {
  const countedSessions = sessions.filter(isCountedVisit);
  const totalSessions = countedSessions.length;
  const totalDurationSecs = countedSessions.reduce(
    (sum, session) => sum + session.durationSecs,
    0,
  );
  const avgDurationSecs = totalSessions > 0
    ? Math.round(totalDurationSecs / totalSessions)
    : 0;

  return {
    countedSessions,
    totalSessions,
    avgSessionsPerDay: Math.round((totalSessions / Math.max(1, inclusiveDays)) * 10) / 10,
    avgDurationSecs,
  };
}
