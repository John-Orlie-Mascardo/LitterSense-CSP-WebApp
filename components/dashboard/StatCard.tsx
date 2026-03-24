/**
 * Stat Card (03.01.06)
 *
 * Displays a single health metric with icon, value, label, and color-coded status bar.
 * Used in a 2x2 grid on mobile, 4-column row on desktop.
 *
 * Status colors:
 * - healthy (green) — metric is within normal range
 * - watch (amber) — metric is borderline, worth monitoring
 * - alert (red) — metric is abnormal, action may be needed
 * - normal (teal) — default, no specific health signal
 */

"use client";

import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  status?: "healthy" | "watch" | "alert" | "normal";
  statusLabel?: string;
}

const iconColors = {
  healthy: "text-litter-primary",
  watch:   "text-amber-500",
  alert:   "text-red-500",
  normal:  "text-litter-primary",
};

const statusBarColors = {
  healthy: "bg-litter-primary",
  watch:   "bg-amber-500",
  alert:   "bg-red-500",
  normal:  "bg-litter-primary",
};

const statusLabelColors = {
  healthy: "text-litter-primary",
  watch:   "text-amber-500",
  alert:   "text-red-500",
  normal:  "text-litter-primary",
};

export function StatCard({ icon: Icon, value, label, status = "normal", statusLabel }: Readonly<StatCardProps>) {
  return (
    <div className="bg-litter-card rounded-2xl p-4 sm:p-5 shadow-sm border border-litter-border relative overflow-hidden">
      {/* Top row: icon left, status label right */}
      <div className="flex items-center justify-between mb-3">
        <Icon className={`w-6 h-6 ${iconColors[status]}`} />
        {statusLabel && (
          <span className={`font-body text-xs font-semibold tracking-wide uppercase ${statusLabelColors[status]}`}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* Value */}
      <p className="text-2xl sm:text-3xl font-bold text-litter-text font-display tracking-tight leading-none">
        {value}
      </p>

      {/* Label */}
      <p className="font-body text-sm text-litter-muted mt-1 leading-tight">{label}</p>

      {/* Status indicator bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-1 ${statusBarColors[status]}`}
      />
    </div>
  );
}
