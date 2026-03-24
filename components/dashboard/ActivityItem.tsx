"use client";

import { getCatById } from "@/lib/data/mockData";

interface ActivityItemProps {
  catId: string;
  action: string;
  time: string;
  duration?: string;
  anomaly?: boolean;
  anomalyNote?: string;
}

export function ActivityItem({
  catId,
  action,
  time,
  duration,
  anomaly = false,
  anomalyNote,
}: ActivityItemProps) {
  const cat = getCatById(catId);

  return (
    <div className="flex items-center gap-3 p-4 bg-litter-card rounded-xl border border-litter-border shadow-sm">
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
        <p className="font-body text-litter-text font-semibold text-sm leading-snug">
          {cat?.name} {action}
        </p>
        {duration && (
          <p className="font-body text-litter-muted text-xs mt-0.5">Duration: {duration}</p>
        )}
      </div>

      {/* Right side: time + anomaly badge */}
      <div className="flex items-center gap-2 shrink-0">
        {anomaly && (
          <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold uppercase tracking-wide">
            {anomalyNote || "Unusual"}
          </span>
        )}
        <span className="font-body text-litter-muted text-xs">{time}</span>
      </div>
    </div>
  );
}
