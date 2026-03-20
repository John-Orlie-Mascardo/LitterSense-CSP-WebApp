/**
 * Cat Selector Chip (03.01.05)
 *
 * Displays a single cat as a selectable pill/chip in the dashboard cat selector row.
 * Shows avatar (initial or photo), name, and health status dot.
 * Active state uses teal background; inactive is white with gray border.
 */

"use client";

import { Cat } from "@/lib/data/mockData";

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
          ? "bg-[#1B7A6E] border-[#1B7A6E] text-white shadow-md"
          : "bg-white border-[#D1D5DB] text-[#1C1C1C] hover:border-[#1B7A6E]/40 hover:shadow-sm"
      }`}
    >
      {/* Avatar */}
      <div className="relative">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            isActive ? "bg-white/20 text-white" : "bg-[#E8F5F1] text-[#1B7A6E]"
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
            isActive ? "border-[#1B7A6E]" : "border-white"
          } ${statusColors[cat.status]}`}
        />
      </div>

      {/* Name */}
      <span className="font-medium text-sm whitespace-nowrap">{cat.name}</span>
    </button>
  );
}
