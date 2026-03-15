"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  status?: "healthy" | "watch" | "alert" | "normal";
  delay?: number;
}

const statusColors = {
  healthy: "bg-green-100 text-green-600 border-green-200",
  watch: "bg-amber-100 text-amber-600 border-amber-200",
  alert: "bg-red-100 text-red-600 border-red-200",
  normal: "bg-[#D4EDE8] text-[#1E6B5E] border-[#1E6B5E]/20",
};

const statusBarColors = {
  healthy: "bg-green-500",
  watch: "bg-amber-500",
  alert: "bg-red-500",
  normal: "bg-[#1E6B5E]",
};

export function StatCard({ icon: Icon, value, label, status = "normal", delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-[#E8E2D9] relative overflow-hidden"
    >
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
      <div className={`absolute bottom-0 left-0 right-0 h-1 ${statusBarColors[status]}`} />
    </motion.div>
  );
}
