"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { getCatById } from "@/lib/mockData";

interface ActivityItemProps {
  catId: string;
  action: string;
  time: string;
  anomaly?: boolean;
  anomalyNote?: string;
  index?: number;
}

const borderColors = {
  normal: "border-l-[#1E6B5E]",
  warning: "border-l-amber-500",
  alert: "border-l-red-500",
};

export function ActivityItem({
  catId,
  action,
  time,
  anomaly = false,
  anomalyNote,
  index = 0,
}: ActivityItemProps) {
  const cat = getCatById(catId);
  const borderColor = anomaly ? borderColors.warning : borderColors.normal;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className={`flex items-center gap-3 p-3 bg-white rounded-xl border border-[#E8E2D9] border-l-4 ${borderColor} shadow-sm`}
    >
      {/* Cat Avatar */}
      <div className="w-10 h-10 rounded-full bg-[#D4EDE8] flex items-center justify-center text-[#1E6B5E] font-medium text-sm shrink-0">
        {cat?.avatar ? (
          <img src={cat.avatar} alt={cat?.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          cat?.name.charAt(0).toUpperCase()
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[#1C1C1C] font-medium text-sm">
          <span className="font-semibold">{cat?.name}</span> {action}
        </p>
        <p className="text-[#6B7280] text-xs mt-0.5">{time}</p>
      </div>

      {/* Anomaly Badge */}
      {anomaly && (
        <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium shrink-0">
          <AlertTriangle className="w-3 h-3" />
          <span className="hidden sm:inline">{anomalyNote || "Alert"}</span>
        </div>
      )}
    </motion.div>
  );
}
