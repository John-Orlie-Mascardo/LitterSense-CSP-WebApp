/**
 * Cat Selector Chip (03.01.05)
 *
 * Displays a single cat as a selectable pill/chip in the dashboard cat selector row.
 * Shows avatar (initial or photo), name, and health status dot.
 * Active state uses teal background; inactive is white with gray border.
 */

"use client";

import { Cat } from "@/lib/interfaces/Cat";

interface CatChipProps {
  cat: Cat;
  isActive: boolean;
  onClick: () => void;
}

const statusColors = {
  healthy: "bg-green-500",
  watch: "bg-amber-500",
  alert: "bg-red-500",
};

export function CatChip({ cat, isActive, onClick }: CatChipProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-full border-2 transition-all duration-200 shrink-0 ${
        isActive
          ? "bg-litter-primary border-litter-primary text-white shadow-md"
          : "bg-litter-card border-litter-border text-litter-text hover:border-litter-primary/40 hover:shadow-sm"
      }`}
    >
      {/* Avatar */}
      <div className="relative">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            isActive ? "bg-litter-card/20 text-white" : "bg-litter-primary-light text-litter-primary"
          }`}
        >
          {cat.avatar ? (
            <img
              src={cat.avatar}
              alt={cat.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            cat.name.charAt(0).toUpperCase()
          )}
        </div>
        {/* Status dot */}
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${
            isActive ? "border-litter-primary" : "border-white"
          } ${statusColors[cat.status]}`}
        />
      </div>

      {/* Name */}
      <span className="font-medium text-sm whitespace-nowrap">{cat.name}</span>
    </button>
  );
}
