/**
 * trendCharts.ts
 *
 * Prepares owner-facing chart points, baseline references, ranges, and tooltip copy.
 *
 * DONE: seconds-to-minutes display conversion, centralized ranges, aggregate references
 * PLACEHOLDER: graph series remain supplied by the existing mock-data pipeline
 *
 * Bands come from the computed personal baseline (median ± 2.5 × MAD); no fixed ranges.
 */

import type { PersonalBaseline } from "@/lib/utils/personalBaseline";

export type TrendMetricId = "visits" | "duration" | "airQuality";

export interface TrendMetricConfig {
  readonly metricName: string;
  readonly yAxisTitle: string;
  readonly unit: string;
  readonly color: string;
  readonly allowDecimals: boolean;
}

export interface TrendReference {
  readonly baseline: number;
  readonly normalMin: number;
  readonly normalMax: number;
}

export interface TrendReferenceSet {
  readonly visits: TrendReference;
  readonly duration: TrendReference;
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
  },
  duration: {
    metricName: "Average Duration",
    yAxisTitle: "Duration (minutes)",
    unit: "minutes",
    color: "#E8924A",
    allowDecimals: true,
  },
  airQuality: {
    metricName: "Air quality change",
    yAxisTitle: "Change from baseline (%)",
    unit: "%",
    color: "#1B7A6E",
    allowDecimals: true,
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
  const values = data
    .map((point) => point.value)
    .filter(Number.isFinite);
  const candidates = [
    0,
    ...values,
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

/** A computed baseline (personalBaseline.ts) whose medians and bands are filled in. */
interface EstablishedBaseline extends PersonalBaseline {
  readonly established: true;
  readonly medianVisitsPerDay: number;
  readonly medianDurationSecs: number;
  readonly visitBand: readonly [number, number];
  readonly durationBand: readonly [number, number];
}

const isEstablishedBaseline = (
  baseline: PersonalBaseline | null | undefined,
): baseline is EstablishedBaseline => Boolean(
  baseline?.established &&
  baseline.medianVisitsPerDay !== null &&
  baseline.medianDurationSecs !== null &&
  baseline.visitBand &&
  baseline.durationBand,
);

// The lower limit can fall below zero (display only); a chart never shows negative visits or time.
const atLeastZero = (value: number) => Math.max(0, value);

/** The cat's band (median, lower and upper limit) from the computed baseline; null until it is established. */
export function buildCatTrendReferences(
  baseline: PersonalBaseline | null | undefined,
): TrendReferenceSet | null {
  if (!isEstablishedBaseline(baseline)) return null;

  return {
    visits: {
      baseline: roundForDisplay(baseline.medianVisitsPerDay),
      normalMin: roundForDisplay(atLeastZero(baseline.visitBand[0])),
      normalMax: roundForDisplay(baseline.visitBand[1]),
    },
    duration: {
      baseline: roundForDisplay(baseline.medianDurationSecs / 60),
      normalMin: roundForDisplay(atLeastZero(baseline.durationBand[0]) / 60),
      normalMax: roundForDisplay(baseline.durationBand[1] / 60),
    },
  };
}

/**
 * All-cats band: visit values add up across cats; duration values are weighted by
 * each cat's median visits per day. Only cats with an established baseline count.
 */
export function buildAggregateTrendReferences(
  baselines: readonly (PersonalBaseline | null | undefined)[],
): TrendReferenceSet | null {
  const established = baselines.filter(isEstablishedBaseline);
  if (established.length === 0) return null;

  const sum = (getValue: (baseline: EstablishedBaseline) => number) =>
    established.reduce((total, baseline) => total + getValue(baseline), 0);
  const totalWeight = sum((baseline) => baseline.medianVisitsPerDay);
  const weighted = (getValue: (baseline: EstablishedBaseline) => number) =>
    roundForDisplay(totalWeight > 0
      ? sum((baseline) => getValue(baseline) * baseline.medianVisitsPerDay) / totalWeight
      : sum(getValue) / established.length);

  return {
    visits: {
      baseline: roundForDisplay(totalWeight),
      normalMin: roundForDisplay(sum((baseline) => atLeastZero(baseline.visitBand[0]))),
      normalMax: roundForDisplay(sum((baseline) => baseline.visitBand[1])),
    },
    duration: {
      baseline: weighted((baseline) => baseline.medianDurationSecs / 60),
      normalMin: weighted((baseline) => atLeastZero(baseline.durationBand[0]) / 60),
      normalMax: weighted((baseline) => baseline.durationBand[1] / 60),
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
