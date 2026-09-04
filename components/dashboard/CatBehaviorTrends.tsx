/**
 * CatBehaviorTrends.tsx
 *
 * Per-cat Home summary using the shared duration/visit trend renderer.
 *
 * DONE: no-data summaries and shared dual-axis chart configuration
 * PLACEHOLDER: none
 *
 * NEXT: data owners should continue supplying duration values in seconds.
 */

"use client";

import { Activity, Clock, TrendingUp } from "lucide-react";
import { MetricTrendChart } from "@/components/charts/MetricTrendChart";
import type { CatTrendPoint } from "@/lib/contexts/CatContext";
import { getBehaviorTrendLabel } from "@/lib/utils/dashboardBehaviorMetrics";
import {
  getMetricTrendPoints,
  type TrendReferenceSet,
} from "@/lib/presentation/trendCharts";

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
      <p className="mt-1 text-lg font-bold leading-none text-litter-text">{value}</p>
    </div>
  );
}

export function CatBehaviorTrends({
  catName,
  todayVisits,
  todayAvgDuration,
  trendData,
  references = null,
}: {
  readonly catName: string;
  readonly todayVisits: string | number;
  readonly todayAvgDuration: string;
  readonly trendData: CatTrendPoint[] | null;
  readonly references?: TrendReferenceSet | null;
}) {
  const hasTrendData = Boolean(trendData?.length);
  const points = trendData ?? [];

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-litter-text sm:text-xl">
          {catName}&apos;s Behavior
        </h2>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryCard icon={Activity} label="Today's Visits" value={todayVisits} />
        <SummaryCard icon={Clock} label="Avg Duration" value={todayAvgDuration || "No data yet"} />
        <SummaryCard icon={TrendingUp} label="Behavior Trend" value={getBehaviorTrendLabel(trendData)} />
      </div>

      <div className="rounded-xl border border-litter-border bg-litter-card p-3 shadow-sm">
        <MetricTrendChart
          data={getMetricTrendPoints(points, "duration")}
          metric="duration"
          secondary={{
            data: getMetricTrendPoints(points, "visits"),
            metric: "visits",
            reference: references?.visits,
          }}
          hasData={hasTrendData}
          reference={references?.duration}
          baselineMessage={references ? undefined : "building"}
          emptyMessage="Visit trends will appear after a few RFID sessions."
          height={220}
        />
      </div>
    </section>
  );
}
