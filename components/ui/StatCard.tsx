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

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  status?: "healthy" | "watch" | "alert" | "normal";
  statusLabel?: string;
  delay?: number;
}

const iconColors = {
  healthy: "text-[#1E6B5E]",
  watch:   "text-amber-500",
  alert:   "text-red-500",
  normal:  "text-[#1E6B5E]",
};

const statusBarColors = {
  healthy: "bg-[#1E6B5E]",
  watch:   "bg-amber-500",
  alert:   "bg-red-500",
  normal:  "bg-[#1E6B5E]",
};

const statusLabelColors = {
  healthy: "text-[#1E6B5E]",
  watch:   "text-amber-500",
  alert:   "text-red-500",
  normal:  "text-[#1E6B5E]",
};

export function StatCard({ icon: Icon, value, label, status = "normal", statusLabel, delay = 0 }: Readonly<StatCardProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-litter-border relative overflow-hidden"
    >
      {/* Top row: icon left, status label right */}
      <div className="flex items-center justify-between mb-3">
        <Icon className={`w-6 h-6 ${iconColors[status]}`} />
        {statusLabel && (
          <span className={`text-xs font-semibold tracking-wide uppercase ${statusLabelColors[status]}`}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* Value */}
      <p className="text-2xl sm:text-3xl font-bold text-litter-text font-display tracking-tight leading-none">
        {value}
      </p>

      {/* Label */}
      <p className="text-sm text-litter-muted mt-1">{label}</p>

      {/* Status indicator bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-1 ${statusBarColors[status]}`}
      />
    </motion.div>
  );
}
