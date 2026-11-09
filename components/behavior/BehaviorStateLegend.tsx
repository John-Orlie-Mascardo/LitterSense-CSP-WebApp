/**
 * BehaviorStateLegend.tsx
 *
 * Shared behavior state key used by Home, Reports, and print output: five states,
 * with Normal's provisional variant listed under Normal.
 *
 * DONE: shared copy rendering, responsive grid, optional mobile disclosure,
 * reference-only semantics, "X of 7 days" for the selected cat
 * PLACEHOLDER: none
 *
 * NEXT: manuscript owners approve wording changes in behaviorStates.ts only.
 */

import { ChevronDown } from "lucide-react";
import { getBehaviorStateKeyEntries } from "@/lib/presentation/behaviorStates";

export function BehaviorStateLegend({
  compact = false,
  collapsible = false,
  baselineDaysUsed,
  className = "",
}: {
  readonly compact?: boolean;
  readonly collapsible?: boolean;
  /** The selected cat's qualifying baseline days; omit when the key covers several cats. */
  readonly baselineDaysUsed?: number | null;
  readonly className?: string;
}) {
  const entries = getBehaviorStateKeyEntries(baselineDaysUsed);
  const legendEntries = (
    <div className={`grid ${compact ? "gap-2" : "gap-3 sm:grid-cols-2"}`}>
      {entries.map((entry) => (
        <div key={entry.key} className="flex items-start gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${entry.dotClass}`} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-litter-text">{entry.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-litter-muted">
              {entry.description}
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
            <span className="text-xs font-semibold uppercase tracking-wider">
              Behavior state key
            </span>
            <span className="flex items-center gap-2" aria-hidden="true">
              <span className="flex gap-1">
                {entries.map((entry) => (
                  <span
                    key={entry.key}
                    className={`h-2 w-2 rounded-full ${entry.dotClass}`}
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
