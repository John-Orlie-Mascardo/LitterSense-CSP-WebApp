/**
 * sessionLogCounts.ts
 *
 * Pure derivation helper: given a cat's sessions and whether their baseline
 * is established, returns a count for each of the six behavior states.
 *
 * This is intentionally pure (no side-effects) so it can be called in both
 * CatContext (for Firestore writes) and in UI components (for optimistic display).
 */

import { getSessionDisplayState } from "@/lib/presentation/behaviorStates";
import type { CatSessionLog } from "@/lib/interfaces/CatSessionLog";
import type { Session } from "@/lib/interfaces/Session";

export type SessionLogCounts = Omit<CatSessionLog, "catId" | "updatedAt">;

const EMPTY_COUNTS: SessionLogCounts = {
  normal: 0,
  watch: 0,
  abnormal: 0,
  incomplete: 0,
  insufficient: 0,
  unattributed: 0,
};

/**
 * Derive session log counts for a single cat.
 *
 * @param sessions - All sessions for this cat (including daily summaries).
 * @param baselineEstablished - Whether this cat has an established baseline.
 * @returns An object with a count for each behavior state.
 */
export function deriveSessionLogCounts(
  sessions: readonly Session[],
  baselineEstablished: boolean,
): SessionLogCounts {
  const counts = { ...EMPTY_COUNTS };

  for (const session of sessions) {
    // Daily summary rows are aggregate placeholders — count each hidden visit
    const visits = session.summaryVisits ?? 1;
    const isAttributed = Boolean(session.catId);

    const state = getSessionDisplayState({
      sessionStatus: session.sessionStatus,
      anomaly: session.anomaly,
      anomalyType: session.anomalyType,
      isAttributed,
      baselineEstablished,
    });

    counts[state] = (counts[state] ?? 0) + visits;
  }

  return counts;
}
