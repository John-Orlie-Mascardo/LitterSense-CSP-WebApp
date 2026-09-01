/**
 * MetricTrendChart.tsx
 *
 * Shared owner-facing chart for one seven-day litter-box behavior metric.
 *
 * DONE: titled axes, visible ticks, units, baseline/range overlays, readable tooltip
 * PLACEHOLDER: series values remain supplied unchanged by existing mock trend data
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
import type { TrendReference } from "@/lib/presentation/trendCharts";
import { formatTrendTooltipLine } from "@/lib/presentation/trendCharts";

export interface MetricTrendChartProps {
  readonly data: readonly { readonly label: string; readonly value: number }[];
  readonly metricName: string;
  readonly yAxisTitle: string;
  readonly unit: string;
  readonly color: string;
  readonly hasData: boolean;
  readonly reference?: TrendReference | null;
  readonly baselineMessage?: "building" | "unavailable";
  readonly emptyMessage: string;
  readonly height?: number;
}

interface MetricTooltipProps {
  readonly active?: boolean;
  readonly payload?: readonly { readonly value?: number | string }[];
  readonly label?: string | number;
  readonly metricName: string;
  readonly unit: string;
}

function MetricTooltip({
  active,
  payload,
  label,
  metricName,
  unit,
}: MetricTooltipProps) {
  const value = payload?.[0]?.value;
  if (!active || typeof value !== "number") return null;

  return (
    <div className="rounded-lg border border-litter-border bg-litter-card px-3 py-2 shadow-lg">
      <p className="whitespace-nowrap text-xs font-semibold text-litter-text">
        {formatTrendTooltipLine(metricName, value, unit, String(label ?? ""))}
      </p>
    </div>
  );
}

export function MetricTrendChart({
  data,
  metricName,
  yAxisTitle,
  unit,
  color,
  hasData,
  reference,
  baselineMessage,
  emptyMessage,
  height = 240,
}: MetricTrendChartProps) {
  const gradientId = `metric-fill-${useId().replaceAll(":", "")}`;

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
            data={data}
            margin={{ top: 18, right: 22, left: 20, bottom: 28 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.24} />
                <stop offset="95%" stopColor={color} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--color-litter-border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--color-litter-border)" }}
              tick={{ fontSize: 11, fill: "var(--color-litter-muted)" }}
              label={{
                value: "Day",
                position: "insideBottom",
                offset: -16,
                fill: "var(--color-litter-muted)",
                fontSize: 11,
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={{ stroke: "var(--color-litter-border)" }}
              tick={{ fontSize: 11, fill: "var(--color-litter-muted)" }}
              width={58}
              label={{
                value: yAxisTitle,
                angle: -90,
                position: "insideLeft",
                offset: -8,
                fill: "var(--color-litter-muted)",
                fontSize: 10,
              }}
            />
            {reference && (
              <ReferenceArea
                y1={reference.normalMin}
                y2={reference.normalMax}
                fill="#1E6B5E"
                fillOpacity={0.1}
                strokeOpacity={0}
                label={{
                  value: "Normal range",
                  position: "insideTopLeft",
                  fill: "var(--color-litter-muted)",
                  fontSize: 10,
                }}
              />
            )}
            <Tooltip
              content={(
                <MetricTooltip metricName={metricName} unit={unit} />
              )}
            />
            <Area
              type="monotone"
              dataKey="value"
              name={metricName}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
            />
            {reference && (
              <ReferenceLine
                y={reference.baseline}
                stroke="#9CA3AF"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: "Baseline",
                  position: "insideTopRight",
                  fill: "var(--color-litter-muted)",
                  fontSize: 10,
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
