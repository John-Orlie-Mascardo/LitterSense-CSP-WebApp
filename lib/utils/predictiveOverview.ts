import { BASELINE_MIN_DAYS } from "../configs/behaviorThresholds";
import { isCountedVisit } from "./personalBaseline";

type Visit = { id: string; catId: string; endedAt?: string; startedAt?: string; date?: string; time?: string; durationSecs: number; sessionStatus?: string; summaryVisits?: number };
export function getPredictiveOverview(sessions: readonly Visit[], established: boolean, now = new Date()) {
  const dateKey = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
  };
  const today = dateKey(now);
  const visits = sessions.filter(s => !["IN_PROGRESS", "FALSE_ENTRY_IGNORED", "SESSION_INTERRUPTED"].includes(s.sessionStatus ?? "")).map(s => {
    const timestamp = s.endedAt || s.startedAt;
    const parsed = timestamp ? new Date(timestamp) : null;
    const valid = parsed && Number.isFinite(parsed.getTime());
    return { ...s, occurredAt: valid ? parsed.toISOString() : undefined, day: valid ? dateKey(parsed) : s.date ?? "", timeLabel: valid ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(parsed) : s.time || "Time unavailable", count: Math.max(1, s.summaryVisits ?? 1) };
  }).sort((a, b) => (b.occurredAt ?? b.day).localeCompare(a.occurredAt ?? a.day));
  const counted = visits.filter(isCountedVisit);
  const days = new Set(counted.filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v.day) && v.day <= today).map(v => v.day));
  const recordedDays = Math.min(BASELINE_MIN_DAYS, days.size);
  const groups = new Map<string, { visits: number; duration: number }>();
  for (const visit of counted) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visit.day)) continue;
    const group = groups.get(visit.day) ?? { visits: 0, duration: 0 };
    group.visits += 1;
    group.duration += Math.max(0, visit.durationSecs);
    groups.set(visit.day, group);
  }
  const completedCount = counted.length;
  const todayVisits = counted.filter(v => v.day === today);
  const todayDuration = todayVisits.reduce((sum, visit) => sum + visit.durationSecs, 0);
  const confidence = established && recordedDays >= BASELINE_MIN_DAYS && completedCount >= 14 ? "high" : recordedDays >= BASELINE_MIN_DAYS ? "medium" : "low";
  return {
    completed: completedCount,
    todayCount: todayVisits.length,
    todayAvgDurationSecs: todayVisits.length > 0 ? Math.round(todayDuration / todayVisits.length) : null,
    recordedDays,
    confidence,
    progress: established ? "Personal baseline established." : `${completedCount} completed visits recorded. ${recordedDays} of ${BASELINE_MIN_DAYS} days with recorded visits. ${recordedDays < BASELINE_MIN_DAYS ? `Record activity on ${BASELINE_MIN_DAYS - recordedDays} more days.` : "Observation period covered; a saved personal baseline is still needed."}`,
    recentVisits: visits.slice(0, 8),
    trendData: [...groups].sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([day, group]) => ({ day: day.slice(5), visits: group.visits, avgDuration: Math.round(group.duration / group.visits), mq135Delta: 0 })),
  };
}
