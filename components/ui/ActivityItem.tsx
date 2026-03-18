"use client";

import { motion } from "framer-motion";
import { getCatById } from "@/lib/mockData";

interface ActivityItemProps {
  catId: string;
  action: string;
  time: string;
  duration?: string;
  anomaly?: boolean;
  anomalyNote?: string;
  index?: number;
}

export function ActivityItem({
  catId,
  action,
  time,
  duration,
  anomaly = false,
  anomalyNote,
  index = 0,
}: ActivityItemProps) {
  const cat = getCatById(catId);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className="flex items-center gap-3 p-4 bg-white rounded-xl border border-litter-border shadow-sm"
    >
      {/* Cat Avatar */}
      <div className="w-10 h-10 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-semibold text-sm shrink-0">
        {cat?.avatar ? (
          <img
            src={cat.avatar}
            alt={cat?.name}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          cat?.name.charAt(0).toUpperCase()
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-litter-text font-semibold text-sm">
          {cat?.name} {action}
        </p>
        {duration && (
          <p className="text-litter-muted text-xs mt-0.5">Duration: {duration}</p>
        )}
      </div>

      {/* Right side: time + anomaly badge */}
      <div className="flex items-center gap-2 shrink-0">
        {anomaly && (
          <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold uppercase tracking-wide">
            {anomalyNote || "Unusual"}
          </span>
        )}
        <span className="text-litter-muted text-xs">{time}</span>
      </div>
    </motion.div>
  );
}
