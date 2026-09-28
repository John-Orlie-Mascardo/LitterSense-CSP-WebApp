/**
 * MetricTrendChart.tsx
 *
 * Shared owner-facing trend renderer for single- and dual-metric charts.
 *
 * DONE: centralized domains/ticks/titles/units, normal band, baseline line,
 * dual axes, readable tooltip, and no-data/baseline notices
 * PLACEHOLDER: series values remain supplied unchanged by existing data flows
 *
 * NEXT: chart owners should add metrics through the typed presentation contract.
 */

"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatTrendTick,
  formatTrendTooltipLine,
  getTrendMetricConfig,
  getTrendYAxisDomain,
  type TrendMetricId,
  type TrendReference,
} from "@/lib/presentation/trendCharts";

type TrendChartPoint = { readonly label: string; readonly value: number };

interface SecondaryTrendSeries {
  readonly metric: TrendMetricId;
  readonly data: readonly TrendChartPoint[];
  readonly reference?: TrendReference | null;
}

export interface MetricTrendChartProps {
  readonly data: readonly TrendChartPoint[];
  readonly metric: TrendMetricId;
  readonly hasData: boolean;
  readonly reference?: TrendReference | null;
  readonly secondary?: SecondaryTrendSeries;
  readonly baselineMessage?: "building" | "unavailable";
  readonly emptyMessage: string;
  readonly height?: number;
}

interface MetricTooltipProps {
  readonly active?: boolean;
  readonly payload?: readonly {
    readonly value?: number | string;
    readonly dataKey?: string | number;
  }[];
  readonly label?: string | number;
  readonly primaryMetric: TrendMetricId;
  readonly secondaryMetric?: TrendMetricId;
}

function MetricTooltip({
  active,
  payload,
  label,
  primaryMetric,
  secondaryMetric,
}: MetricTooltipProps) {
  if (!active || !payload?.length) return null;
  const rows = payload.flatMap((entry) => {
    if (typeof entry.value !== "number") return [];
    const metric = entry.dataKey === "secondaryValue" && secondaryMetric
      ? secondaryMetric
      : primaryMetric;
    const config = getTrendMetricConfig(metric);
    return [formatTrendTooltipLine(
      config.metricName,
      entry.value,
      config.unit,
      String(label ?? ""),
    )];
  });
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-litter-border bg-litter-card px-3 py-2 shadow-lg">
      {rows.map((row) => (
        <p key={row} className="whitespace-nowrap text-xs font-semibold text-litter-text">
          {row}
        </p>
      ))}
    </div>
  );
}

export function MetricTrendChart({
  data,
  metric,
  hasData,
  reference,
  secondary,
  baselineMessage,
  emptyMessage,
  height = 240,
}: MetricTrendChartProps) {
  const id = useId().replaceAll(":", "");
  const primaryGradientId = `metric-fill-${id}`;
  const secondaryGradientId = `metric-secondary-fill-${id}`;
  const config = getTrendMetricConfig(metric);
  const secondaryConfig = secondary
    ? getTrendMetricConfig(secondary.metric)
    : null;
  const secondaryValues = new Map(
    secondary?.data.map((point) => [point.label, point.value]) ?? [],
  );
  const chartData = data.map((point) => ({
    label: point.label,
    primaryValue: point.value,
    secondaryValue: secondaryValues.get(point.label),
  }));
  const normalRange = config.normalRange ?? (reference
    ? { min: reference.normalMin, max: reference.normalMax }
    : null);

  if (!hasData) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-litter-border px-5 text-center">
        <p className="text-sm text-litter-muted">{emptyMessage}</p>
      </div>
    );
  }

  const baselineNotice = baselineMessage === "building"
    ? "Baseline still building"
    : baselineMessage === "unavailable"
      ? "Baseline unavailable for this saved report"
      : null;

  return (
    <div>
      {baselineNotice && (
        <p className="mb-2 text-xs font-medium text-status-insufficient">
          {baselineNotice}
        </p>
      )}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 18, right: secondary ? 62 : 22, left: 28, bottom: 28 }}
          >
            <defs>
              <linearGradient id={primaryGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={config.color} stopOpacity={0.24} />
                <stop offset="95%" stopColor={config.color} stopOpacity={0.03} />
              </linearGradient>
              {secondaryConfig && (
                <linearGradient id={secondaryGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={secondaryConfig.color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={secondaryConfig.color} stopOpacity={0.02} />
                </linearGradient>
              )}
            </defs>
            <CartesianGrid stroke="var(--color-litter-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--color-litter-border)" }}
              tick={{ fontSize: 11, fill: "var(--color-litter-muted)" }}
              label={{ value: "Day", position: "insideBottom", offset: -16, fill: "var(--color-litter-muted)", fontSize: 11 }}
            />
            <YAxis
              yAxisId={metric}
              domain={getTrendYAxisDomain(metric, data, reference)}
              allowDecimals={config.allowDecimals}
              tickFormatter={(value) => formatTrendTick(metric, Number(value))}
              tickLine={false}
              axisLine={{ stroke: "var(--color-litter-border)" }}
              tick={{ fontSize: 11, fill: "var(--color-litter-muted)" }}
              width={68}
              label={{ value: config.yAxisTitle, angle: -90, position: "insideLeft", offset: -12, fill: "var(--color-litter-muted)", fontSize: 10 }}
            />
            {secondary && secondaryConfig && (
              <YAxis
                yAxisId={secondary.metric}
                orientation="right"
                domain={getTrendYAxisDomain(secondary.metric, secondary.data, secondary.reference)}
                allowDecimals={secondaryConfig.allowDecimals}
                tickFormatter={(value) => formatTrendTick(secondary.metric, Number(value))}
                tickLine={false}
                axisLine={{ stroke: "var(--color-litter-border)" }}
                tick={{ fontSize: 11, fill: "var(--color-litter-muted)" }}
                width={58}
                label={{ value: secondaryConfig.yAxisTitle, angle: 90, position: "insideRight", offset: -10, fill: "var(--color-litter-muted)", fontSize: 10 }}
              />
            )}
            {normalRange && (
              <ReferenceArea
                yAxisId={metric}
                y1={normalRange.min}
                y2={normalRange.max}
                fill="#1E6B5E"
                fillOpacity={0.1}
                strokeOpacity={0}
                label={{ value: "Normal range", position: "insideTopLeft", fill: "var(--color-litter-muted)", fontSize: 10 }}
              />
            )}
            <Tooltip content={<MetricTooltip primaryMetric={metric} secondaryMetric={secondary?.metric} />} />
            <Area
              yAxisId={metric}
              type="monotone"
              dataKey="primaryValue"
              name={config.metricName}
              stroke={config.color}
              strokeWidth={2}
              fill={`url(#${primaryGradientId})`}
              activeDot={{ r: 4, fill: config.color, strokeWidth: 0 }}
            />
            {secondary && secondaryConfig && (
              <Area
                yAxisId={secondary.metric}
                type="monotone"
                dataKey="secondaryValue"
                name={secondaryConfig.metricName}
                stroke={secondaryConfig.color}
                strokeWidth={2}
                fill={`url(#${secondaryGradientId})`}
                activeDot={{ r: 4, fill: secondaryConfig.color, strokeWidth: 0 }}
              />
            )}
            {reference && (
              <ReferenceLine
                yAxisId={metric}
                y={reference.baseline}
                stroke="#9CA3AF"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{ value: "Baseline", position: "insideTopRight", fill: "var(--color-litter-muted)", fontSize: 10 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
