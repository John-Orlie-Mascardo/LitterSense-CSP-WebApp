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
} from "@/lib/configs/behaviorThresholds";

export type TrendMetricId = "visits" | "duration" | "airQuality";

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
