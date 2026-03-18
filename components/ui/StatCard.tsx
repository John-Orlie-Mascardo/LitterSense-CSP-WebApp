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
}

const statusColors = {
  healthy: "bg-green-100 text-green-600 border-green-200",
  watch: "bg-amber-100 text-amber-600 border-amber-200",
  alert: "bg-red-100 text-red-600 border-red-200",
  normal: "bg-[#E8F5F1] text-[#1B7A6E] border-[#1B7A6E]/20",
};

const statusBarColors = {
  healthy: "bg-green-500",
  watch: "bg-amber-500",
  alert: "bg-red-500",
  normal: "bg-[#1B7A6E]",
};

export function StatCard({
  icon: Icon,
  value,
  label,
  status = "normal",
}: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-[#D1D5DB] relative overflow-hidden">
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl ${statusColors[status]}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl sm:text-3xl font-bold text-[#1C1C1C] font-display tracking-tight">
            {value}
          </p>
          <p className="text-sm text-[#6B7280] mt-0.5">{label}</p>
        </div>
      </div>

      {/* Status indicator bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-1 ${statusBarColors[status]}`}
      />
    </div>
  );
}
