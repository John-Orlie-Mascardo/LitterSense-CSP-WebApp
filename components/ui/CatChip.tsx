"use client";

import { motion } from "framer-motion";
import { Cat } from "@/lib/mockData";

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
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`flex items-center gap-2.5 px-4 py-2.5 rounded-full border-2 transition-all duration-200 min-w-fit shrink-0 ${
        isActive
          ? "bg-[#1E6B5E] border-[#1E6B5E] text-white shadow-md"
          : "bg-white border-[#E8E2D9] text-[#1C1C1C] hover:border-[#1E6B5E]/40 hover:shadow-sm"
      }`}
    >
      {/* Avatar */}
      <div className="relative">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            isActive ? "bg-white/20 text-white" : "bg-[#D4EDE8] text-[#1E6B5E]"
          }`}
        >
          {cat.avatar ? (
            <img src={cat.avatar} alt={cat.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            cat.name.charAt(0).toUpperCase()
          )}
        </div>
        {/* Status dot */}
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${
            isActive ? "border-[#1E6B5E]" : "border-white"
          } ${statusColors[cat.status]}`}
        />
      </div>

      {/* Name */}
      <span className="font-medium text-sm whitespace-nowrap">{cat.name}</span>
    </motion.button>
  );
}
