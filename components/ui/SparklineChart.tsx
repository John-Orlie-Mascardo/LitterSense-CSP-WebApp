"use client";

import { LineChart, Line, ResponsiveContainer, Area, AreaChart, Tooltip, ReferenceLine } from "recharts";

interface SparklineChartProps {
  data: { value: number; label: string }[];
  baseline?: number;
  color?: string;
  showArea?: boolean;
  height?: number;
}

export function SparklineChart({
  data,
  baseline,
  color = "#1E6B5E",
  showArea = true,
  height = 80,
}: SparklineChartProps) {
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 rounded-lg shadow-lg border border-[#E8E2D9] text-xs">
          <p className="font-medium text-gray-700">{label}</p>
          <p className="text-[#1E6B5E] font-semibold">{payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id={`gradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          {baseline !== undefined && (
            <ReferenceLine
              y={baseline}
              stroke="#9CA3AF"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          {showArea && (
            <Area
              type="monotone"
              dataKey="value"
              stroke="none"
              fill={`url(#gradient-${color.replace("#", "")})`}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
