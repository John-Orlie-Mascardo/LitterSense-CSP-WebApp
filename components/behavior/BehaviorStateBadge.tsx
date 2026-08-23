/**
 * BehaviorStateBadge.tsx
 *
 * Shared semantic badge for LitterSense behavior classifications.
 *
 * DONE: six-state styling, optional dot, compact and standard sizes
 * PLACEHOLDER: none
 *
 * NEXT: use this component for new behavior badges instead of duplicating copy.
 */

import {
  BEHAVIOR_STATE_BY_ID,
  type BehaviorStateId,
} from "@/lib/presentation/behaviorStates";

export function BehaviorStateBadge({
  state,
  compact = false,
  showDot = true,
  className = "",
}: {
  readonly state: BehaviorStateId;
  readonly compact?: boolean;
  readonly showDot?: boolean;
  readonly className?: string;
}) {
  const definition = BEHAVIOR_STATE_BY_ID[state];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${definition.badgeClass} ${
        compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
      } ${className}`}
    >
      {showDot ? (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${definition.dotClass}`} />
      ) : null}
      {definition.label}
    </span>
  );
}

