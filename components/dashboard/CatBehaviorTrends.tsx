/**
 * CatBehaviorTrends.tsx
 *
 * Per-cat activity summary and dual-axis visit/duration chart.
 *
 * DONE: no-data summaries, labeled chart axes, and on-demand Gemini analysis
 * PLACEHOLDER: none
 *
 * NEXT: data owners should continue supplying duration values in seconds; this
 * component converts them to minutes only for display.
 */

"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, BrainCircuit, Clock, TrendingUp } from "lucide-react";
import { BehaviorStateBadge } from "@/components/behavior/BehaviorStateBadge";
import type { CatTrendPoint } from "@/lib/contexts/CatContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  BEHAVIOR_STATE_BY_ID,
  type BehaviorStateId,
} from "@/lib/presentation/behaviorStates";
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
  displayState,
}: {
  readonly catName: string;
  readonly todayVisits: string | number;
  readonly todayAvgDuration: string;
  readonly trendData: CatTrendPoint[] | null;
  readonly displayState: BehaviorStateId;
}) {
  const { user } = useAuth();
  const [analysisResult, setAnalysisResult] = useState<{
    readonly key: string;
    readonly summary: string;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const chartData = (trendData ?? []).map((point) => ({
    ...point,
    avgDurationMinutes: point.avgDuration / 60,
  }));
  const analysisKey = JSON.stringify({ displayState, todayVisits, todayAvgDuration, trendData });
  const analysisSummary = analysisResult?.key === analysisKey
    ? analysisResult.summary
    : BEHAVIOR_STATE_BY_ID[displayState].description;

  const handleAnalyze = async () => {
    if (!user || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalysisError("");
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/predictive-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          catName,
          displayState,
          todayVisits,
          todayAvgDuration,
          trendData,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        readonly summary?: unknown;
        readonly error?: unknown;
      } | null;
      if (!response.ok || typeof payload?.summary !== "string") {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "AI analysis is unavailable.",
        );
      }
      setAnalysisResult({ key: analysisKey, summary: payload.summary });
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "AI analysis is unavailable.");
    } finally {
      setIsAnalyzing(false);
    }
  };

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

      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-litter-border bg-litter-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-litter-primary-light">
            <BrainCircuit className="h-5 w-5 text-litter-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-litter-text">
              Predictive Health Analysis
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-litter-muted">
              {analysisSummary}
            </p>
            {analysisError ? (
              <p className="mt-1 text-xs text-litter-danger" role="alert">{analysisError}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          <BehaviorStateBadge state={displayState} />
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={!user || isAnalyzing}
            aria-busy={isAnalyzing}
            className="rounded-lg border border-litter-primary px-3 py-1.5 text-xs font-semibold text-litter-primary transition-colors hover:bg-litter-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            Analyze
          </button>
        </div>
      </div>
    </section>
  );
}
