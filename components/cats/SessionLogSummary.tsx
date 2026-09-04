/**
 * SessionLogSummary.tsx
 *
 * Displays a color-coded per-cat session log breakdown showing counts for all
 * six behavior states: Normal, Watch, Abnormal, Incomplete, Insufficient, Unattributed.
 *
 * Reads from CatSessionLog which is automatically kept in sync with Firestore
 * sessions, including hardware-written sessions.
 */

import type { CatSessionLog } from "@/lib/interfaces/CatSessionLog";
import { BEHAVIOR_STATE_BY_ID, type BehaviorStateId } from "@/lib/presentation/behaviorStates";

interface SessionLogSummaryProps {
  readonly log: CatSessionLog | undefined;
}

interface StateRow {
  readonly id: BehaviorStateId;
  readonly count: number;
}

const STATE_ORDER: BehaviorStateId[] = [
  "normal",
  "watch",
  "abnormal",
  "incomplete",
  "insufficient",
  "unattributed",
];

// Map from state id to a vivid pill color set (bg + text)
const STATE_PILL_CLASSES: Record<BehaviorStateId, { bg: string; text: string; border: string; countBg: string }> = {
  normal:       { bg: "bg-emerald-50",   text: "text-emerald-700",  border: "border-emerald-200", countBg: "bg-emerald-100" },
  watch:        { bg: "bg-amber-50",     text: "text-amber-700",    border: "border-amber-200",   countBg: "bg-amber-100"   },
  abnormal:     { bg: "bg-red-50",       text: "text-red-700",      border: "border-red-200",     countBg: "bg-red-100"     },
  incomplete:   { bg: "bg-orange-50",    text: "text-orange-700",   border: "border-orange-200",  countBg: "bg-orange-100"  },
  insufficient: { bg: "bg-slate-50",     text: "text-slate-600",    border: "border-slate-200",   countBg: "bg-slate-100"   },
  unattributed: { bg: "bg-purple-50",    text: "text-purple-700",   border: "border-purple-200",  countBg: "bg-purple-100"  },
};

function SessionLogPill({ id, count }: StateRow) {
  const state = BEHAVIOR_STATE_BY_ID[id];
  const colors = STATE_PILL_CLASSES[id];

  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 ${colors.bg} ${colors.border}`}
    >
      {/* Count bubble */}
      <span
        className={`min-w-[2.25rem] text-center rounded-lg px-2 py-0.5 text-lg font-bold leading-tight ${colors.countBg} ${colors.text}`}
      >
        {count}
      </span>
      {/* State label */}
      <span className={`text-center text-[11px] font-semibold leading-tight ${colors.text}`}>
        {state.label}
      </span>
    </div>
  );
}

export function SessionLogSummary({ log }: SessionLogSummaryProps) {
  const rows: StateRow[] = STATE_ORDER.map((id) => ({
    id,
    count: log ? (log[id] ?? 0) : 0,
  }));

  const totalSessions = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="rounded-xl border border-litter-border bg-theme-overlay p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-litter-text">Session Log</h3>
        <span className="text-xs text-theme-muted font-medium">
          {totalSessions} total session{totalSessions !== 1 ? "s" : ""}
        </span>
      </div>

      {/* State pills grid — 3 columns */}
      {totalSessions === 0 ? (
        <p className="text-center text-sm text-theme-muted py-2">
          No sessions recorded yet. Sessions will appear here once the device
          starts recording.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {rows.map((row) => (
            <SessionLogPill key={row.id} id={row.id} count={row.count} />
          ))}
        </div>
      )}

      {/* Footer with last-updated timestamp */}
      {log?.updatedAt && (
        <p className="mt-3 text-[11px] text-theme-muted text-right">
          Updated {new Date(log.updatedAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}
