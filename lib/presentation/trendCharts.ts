/**
 * trendCharts.ts
 *
 * Prepares owner-facing chart points, baseline references, ranges, and tooltip copy.
 *
 * DONE: seconds-to-minutes display conversion, centralized ranges, aggregate references
 * PLACEHOLDER: graph series remain supplied by the existing mock-data pipeline
 *
 * NEXT: research owners must change deviation values only in the central threshold config.
 */

import {
  BASELINE_AIR_QUALITY_DEVIATION_PERCENT,
  BASELINE_DURATION_DEVIATION_SECS,
  BASELINE_VISIT_DEVIATION_COUNT,
  DASHBOARD_DURATION_WARNING_MINS,
  DASHBOARD_VISIT_WARNING_COUNT,
  INCOMPLETE_SESSION_FLOOR_SECS,
} from "@/lib/configs/behaviorThresholds";

export type TrendMetricId = "visits" | "duration" | "airQuality";

export interface TrendMetricConfig {
  readonly metricName: string;
  readonly yAxisTitle: string;
  readonly unit: string;
  readonly color: string;
  readonly allowDecimals: boolean;
  readonly normalRange: { readonly min: number; readonly max: number } | null;
}

export interface TrendReference {
  readonly baseline: number;
  readonly normalMin: number;
  readonly normalMax: number;
}

export interface TrendReferenceSet {
  readonly visits: TrendReference;
  readonly duration: TrendReference;
  readonly airQuality: TrendReference;
}

export interface BaselineMetricsInput {
  readonly avgVisitsPerDay: number;
  readonly avgDurationSecs: number;
  readonly mq135DeltaPercent: number;
  readonly lastUpdated?: string;
}

export interface TrendPointInput {
  readonly day: string;
  readonly visits: number;
  readonly avgDuration: number;
  readonly mq135Delta: number;
}

const roundForDisplay = (value: number) => Math.round(value * 100) / 100;

const TREND_METRIC_CONFIG: Readonly<Record<TrendMetricId, TrendMetricConfig>> = {
  visits: {
    metricName: "Visit Frequency",
    yAxisTitle: "Visits per day",
    unit: "visits",
    color: "#1B7A6E",
    allowDecimals: false,
    normalRange: { min: 0, max: DASHBOARD_VISIT_WARNING_COUNT },
  },
  duration: {
    metricName: "Average Duration",
    yAxisTitle: "Duration (minutes)",
    unit: "minutes",
    color: "#E8924A",
    allowDecimals: true,
    normalRange: {
      min: roundForDisplay(INCOMPLETE_SESSION_FLOOR_SECS / 60),
      max: DASHBOARD_DURATION_WARNING_MINS,
    },
  },
  airQuality: {
    metricName: "Air quality change",
    yAxisTitle: "Change from baseline (%)",
    unit: "%",
    color: "#1B7A6E",
    allowDecimals: true,
    normalRange: null,
  },
};

export function getTrendMetricConfig(metric: TrendMetricId): TrendMetricConfig {
  return TREND_METRIC_CONFIG[metric];
}

export function formatTrendTick(metric: TrendMetricId, value: number): string {
  const rounded = roundForDisplay(value);
  if (metric === "duration") return `${rounded} min`;
  if (metric === "airQuality") return `${rounded}%`;
  return String(Math.round(rounded));
}

export function getTrendYAxisDomain(
  metric: TrendMetricId,
  data: readonly { readonly value: number }[],
  reference?: TrendReference | null,
): readonly [number, number] {
  const config = getTrendMetricConfig(metric);
  const values = data
    .map((point) => point.value)
    .filter(Number.isFinite);
  const candidates = [
    0,
    ...values,
    ...(config.normalRange
      ? [config.normalRange.min, config.normalRange.max]
      : []),
    ...(reference
      ? [reference.baseline, reference.normalMin, reference.normalMax]
      : []),
  ];
  const minimum = Math.min(...candidates);
  const maximum = Math.max(...candidates, 1);
  const lower = minimum < 0 ? Math.floor(minimum * 1.1) : 0;
  const upper = Math.max(lower + 1, Math.ceil(maximum * 1.1));
  return [lower, upper];
}

const isEstablishedBaseline = (
  baseline: BaselineMetricsInput | null | undefined,
): baseline is BaselineMetricsInput => Boolean(
  baseline &&
  baseline.avgVisitsPerDay > 0 &&
  baseline.avgDurationSecs > 0 &&
  baseline.lastUpdated?.trim(),
);

export function buildCatTrendReferences(
  baseline: BaselineMetricsInput | null | undefined,
): TrendReferenceSet | null {
  if (!isEstablishedBaseline(baseline)) return null;

  const durationBaseline = baseline.avgDurationSecs / 60;
  const durationDeviation = BASELINE_DURATION_DEVIATION_SECS / 60;
  return {
    visits: {
      baseline: baseline.avgVisitsPerDay,
      normalMin: Math.max(0, baseline.avgVisitsPerDay - BASELINE_VISIT_DEVIATION_COUNT),
      normalMax: baseline.avgVisitsPerDay + BASELINE_VISIT_DEVIATION_COUNT,
    },
    duration: {
      baseline: roundForDisplay(durationBaseline),
      normalMin: roundForDisplay(Math.max(0, durationBaseline - durationDeviation)),
      normalMax: roundForDisplay(durationBaseline + durationDeviation),
    },
    airQuality: {
      baseline: baseline.mq135DeltaPercent,
      normalMin: 0,
      normalMax:
        baseline.mq135DeltaPercent + BASELINE_AIR_QUALITY_DEVIATION_PERCENT,
    },
  };
}

export function buildAggregateTrendReferences(
  baselines: readonly BaselineMetricsInput[],
): TrendReferenceSet | null {
  const established = baselines.filter(isEstablishedBaseline);
  if (established.length === 0) return null;

  const totalWeight = established.reduce(
    (total, baseline) => total + baseline.avgVisitsPerDay,
    0,
  );
  const weighted = (getValue: (baseline: BaselineMetricsInput) => number) =>
    roundForDisplay(
      established.reduce(
        (total, baseline) =>
          total + getValue(baseline) * baseline.avgVisitsPerDay,
        0,
      ) / totalWeight,
    );

  return {
    visits: {
      baseline: roundForDisplay(totalWeight),
      normalMin: roundForDisplay(
        established.reduce(
          (total, baseline) =>
            total + Math.max(0, baseline.avgVisitsPerDay - BASELINE_VISIT_DEVIATION_COUNT),
          0,
        ),
      ),
      normalMax: roundForDisplay(
        established.reduce(
          (total, baseline) =>
            total + baseline.avgVisitsPerDay + BASELINE_VISIT_DEVIATION_COUNT,
          0,
        ),
      ),
    },
    duration: {
      baseline: weighted((baseline) => baseline.avgDurationSecs / 60),
      normalMin: weighted((baseline) =>
        Math.max(0, baseline.avgDurationSecs - BASELINE_DURATION_DEVIATION_SECS) / 60
      ),
      normalMax: weighted((baseline) =>
        (baseline.avgDurationSecs + BASELINE_DURATION_DEVIATION_SECS) / 60
      ),
    },
    airQuality: {
      baseline: weighted((baseline) => baseline.mq135DeltaPercent),
      normalMin: 0,
      normalMax: weighted(
        (baseline) =>
          baseline.mq135DeltaPercent + BASELINE_AIR_QUALITY_DEVIATION_PERCENT,
      ),
    },
  };
}

export function getMetricTrendPoints(
  data: readonly TrendPointInput[],
  metric: TrendMetricId,
): readonly { readonly label: string; readonly value: number }[] {
  return data.map((point) => {
    if (metric === "visits") return { label: point.day, value: point.visits };
    if (metric === "duration") {
      return { label: point.day, value: roundForDisplay(point.avgDuration / 60) };
    }
    return { label: point.day, value: point.mq135Delta };
  });
}

export function formatTrendTooltipLine(
  metricName: string,
  value: number,
  unit: string,
  label: string,
): string {
  return `${metricName}: ${roundForDisplay(value)} ${unit} — ${label}`;
}
