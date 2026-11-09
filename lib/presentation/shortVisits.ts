/**
 * shortVisits.ts
 *
 * Display-only filter for the cat page History tab: visits under 1 minute are
 * hidden by default. Hidden visits still count everywhere else (states, the
 * baseline, the 7th-visit rule, and the session log); this only changes the list.
 */

import { SHORT_VISIT_HIDE_S } from "@/lib/configs/behaviorThresholds";

export const SHOW_SHORT_VISITS_LABEL = `Show short visits (under ${SHORT_VISIT_HIDE_S / 60} min)`;

interface ShortVisitInput {
  readonly durationSecs?: number | null;
  readonly sessionStatus?: string | null;
}

/** A completed visit shorter than 60 s. Daily summaries and in-progress rows are never "short". */
export function isShortVisit(session: ShortVisitInput): boolean {
  const status = session.sessionStatus?.toUpperCase() ?? "";
  if (status === "DAILY_SUMMARY" || status === "IN_PROGRESS") return false;
  return typeof session.durationSecs === "number" &&
    Number.isFinite(session.durationSecs) &&
    session.durationSecs < SHORT_VISIT_HIDE_S;
}

export function filterShortVisits<T extends ShortVisitInput>(
  sessions: readonly T[],
  showShortVisits: boolean,
): { readonly visible: readonly T[]; readonly hiddenCount: number } {
  if (showShortVisits) return { visible: sessions, hiddenCount: 0 };
  const visible = sessions.filter((session) => !isShortVisit(session));
  return { visible, hiddenCount: sessions.length - visible.length };
}
