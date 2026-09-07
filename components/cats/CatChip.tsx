/**
 * Cat Selector Chip (03.01.05)
 *
 * Displays a single cat as a selectable pill/chip in the dashboard cat selector row.
 * Shows avatar (initial or photo), name, and behavior-state dot.
 * Active state uses teal background; inactive uses the current theme surface.
 *
 * DONE: selection styling and shared six-state display dot
 * PLACEHOLDER: none
 *
 * NEXT: callers must derive display state from real cat evidence and baseline data.
 */

"use client";

import Image from "next/image";
import type { Cat } from "@/lib/data/data";
import {
  BEHAVIOR_STATE_BY_ID,
  type BehaviorStateId,
} from "@/lib/presentation/behaviorStates";

interface CatChipProps {
  cat: Cat;
  isActive: boolean;
  displayState: BehaviorStateId;
  onClick: () => void;
}

export function CatChip({ cat, isActive, displayState, onClick }: CatChipProps) {
  const stateDefinition = BEHAVIOR_STATE_BY_ID[displayState];
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
            <Image
              src={cat.avatar}
              alt={cat.name}
              width={32}
              height={32}
              unoptimized
              className="w-full h-full rounded-full object-cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            cat.name.charAt(0).toUpperCase()
          )}
        </div>
        {/* Status dot */}
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${
            isActive ? "border-litter-primary" : "border-white"
          } ${stateDefinition.dotClass}`}
          aria-label={stateDefinition.label}
        />
      </div>

      {/* Name */}
      <span className="font-medium text-sm whitespace-nowrap">{cat.name}</span>
    </button>
  );
}
