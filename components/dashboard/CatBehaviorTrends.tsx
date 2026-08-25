/**
 * CatBehaviorTrends.tsx
 *
 * Per-cat activity summary and dual-axis visit/duration chart.
 *
 * DONE: no-data summaries and labeled chart axes
 * PLACEHOLDER: none
 *
 * NEXT: data owners should continue supplying duration values in seconds; this
 * component converts them to minutes only for display.
 */

"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Clock, TrendingUp } from "lucide-react";
import type { CatTrendPoint } from "@/lib/contexts/CatContext";
import { getBehaviorTrendLabel } from "@/lib/utils/dashboardBehaviorMetrics";

const formatDuration = (seconds: number) => {
  if (seconds <= 0) return "--";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
};

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: typeof Activity;
  readonly label: string;
  readonly value: string | number;
}) {
  return (
    <div className="rounded-xl border border-litter-border bg-litter-card p-3 shadow-sm">
      <Icon className="h-4 w-4 text-litter-primary" />
      <p className="mt-2 text-xs font-medium text-litter-muted">{label}</p>
      <p className="mt-1 text-lg font-bold leading-none text-litter-text">
        {value}
      </p>
    </div>
  );
}

export function CatBehaviorTrends({
  catName,
  todayVisits,
  todayAvgDuration,
  trendData,
}: {
  readonly catName: string;
  readonly todayVisits: string | number;
  readonly todayAvgDuration: string;
  readonly trendData: CatTrendPoint[] | null;
}) {
  const chartData = (trendData ?? []).map((point) => ({
    ...point,
    avgDurationMinutes: point.avgDuration / 60,
  }));

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg sm:text-xl font-semibold text-litter-text">
          {catName}&apos;s Behavior
        </h2>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryCard icon={Activity} label="Today's Visits" value={todayVisits} />
        <SummaryCard
          icon={Clock}
          label="Avg Duration"
          value={todayAvgDuration || "No data yet"}
        />
        <SummaryCard
          icon={TrendingUp}
          label="Behavior Trend"
          value={getBehaviorTrendLabel(trendData)}
        />
      </div>

      <div className="h-56 rounded-xl border border-litter-border bg-litter-card p-3 shadow-sm">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 32, left: 32, bottom: 0 }}>
              <defs>
                <linearGradient id="visitsFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#1E6B5E" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#1E6B5E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="durationFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#D97706" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="duration"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => `${Number(value).toFixed(0)} min`}
                label={{
                  value: "Duration (minutes)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 10 },
                }}
              />
              <YAxis
                yAxisId="visits"
                orientation="right"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                label={{
                  value: "Visit count",
                  angle: 90,
                  position: "insideRight",
                  style: { fontSize: 10 },
                }}
              />
              <Tooltip
                formatter={(value, name) =>
                  name === "avgDurationMinutes"
                    ? [formatDuration(Math.round(Number(value) * 60)), "Avg Duration"]
                    : [value, "Visits"]
                }
              />
              <Area
                yAxisId="visits"
                type="monotone"
                dataKey="visits"
                stroke="#1E6B5E"
                fill="url(#visitsFill)"
                strokeWidth={2}
              />
              <Area
                yAxisId="duration"
                type="monotone"
                dataKey="avgDurationMinutes"
                stroke="#D97706"
                fill="url(#durationFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-sm text-litter-muted">
              Visit trends will appear after a few RFID sessions.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
