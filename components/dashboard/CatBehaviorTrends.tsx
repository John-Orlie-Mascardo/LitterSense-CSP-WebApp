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

const formatDuration = (seconds: number) => {
  if (seconds <= 0) return "--";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
};

const getBehaviorTrend = (trendData: CatTrendPoint[] | null) => {
  if (!trendData || trendData.length < 2) return "No trend yet";

  const first = trendData[0];
  const last = trendData[trendData.length - 1];
  if (last.visits > first.visits) return "More active";
  if (last.visits < first.visits) return "Less active";
  return "Stable";
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
  readonly todayVisits: number;
  readonly todayAvgDuration: string;
  readonly trendData: CatTrendPoint[] | null;
}) {
  const chartData = trendData ?? [];

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
          value={todayAvgDuration || "--"}
        />
        <SummaryCard
          icon={TrendingUp}
          label="Behavior Trend"
          value={getBehaviorTrend(trendData)}
        />
      </div>

      <div className="h-56 rounded-xl border border-litter-border bg-litter-card p-3 shadow-sm">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
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
              <YAxis yAxisId="visits" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="duration"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => `${Math.round(Number(value) / 60)}m`}
              />
              <Tooltip
                formatter={(value, name) =>
                  name === "avgDuration"
                    ? [formatDuration(Number(value)), "Avg Duration"]
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
                dataKey="avgDuration"
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
