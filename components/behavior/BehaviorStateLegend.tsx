/**
 * BehaviorStateLegend.tsx
 *
 * Shared six-state reference key used by Home, Reports, and print output.
 *
 * DONE: shared copy rendering, responsive grid, optional mobile disclosure,
 * reference-only semantics
 * PLACEHOLDER: none
 *
 * NEXT: manuscript owners approve wording changes in behaviorStates.ts only.
 */

import { ChevronDown } from "lucide-react";
import { BEHAVIOR_STATES } from "@/lib/presentation/behaviorStates";

export function BehaviorStateLegend({
  compact = false,
  collapsible = false,
  className = "",
}: {
  readonly compact?: boolean;
  readonly collapsible?: boolean;
  readonly className?: string;
}) {
  const legendEntries = (
    <div className={`grid ${compact ? "gap-2" : "gap-3 sm:grid-cols-2"}`}>
      {BEHAVIOR_STATES.map((state) => (
        <div key={state.id} className="flex items-start gap-2.5">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${state.dotClass}`} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-litter-text">{state.label}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-litter-muted">
              {state.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  if (collapsible) {
    return (
      <aside
        aria-label="Behavior state key"
        className={`overflow-hidden rounded-2xl border border-litter-border bg-litter-card shadow-sm ${className}`}
      >
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-litter-muted select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-litter-primary [&::-webkit-details-marker]:hidden">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Behavior state key
            </span>
            <span className="flex items-center gap-2" aria-hidden="true">
              <span className="flex gap-1">
                {BEHAVIOR_STATES.map((state) => (
                  <span
                    key={state.id}
                    className={`h-2 w-2 rounded-full ${state.dotClass}`}
                  />
                ))}
              </span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-litter-border px-3 pt-3 pb-3">
            {legendEntries}
          </div>
        </details>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Behavior state key"
      className={`rounded-2xl border border-litter-border bg-litter-card shadow-sm ${
        compact ? "p-3" : "p-4"
      } ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-litter-muted">
        Behavior state key
      </p>
      <div className="mt-3">{legendEntries}</div>
    </aside>
  );
}
