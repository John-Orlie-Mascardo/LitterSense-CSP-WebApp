/**
 * sessionLogCounts.ts
 *
 * Pure derivation helper: given a cat's sessions and the owner's behavior index
 * (computed baselines and same-day visit counts), returns a count for each of
 * the six behavior states.
 *
 * This is intentionally pure (no side-effects) so it can be called in both
 * CatContext (for Firestore writes) and in UI components (for optimistic display).
 */

import {
  getIndexedSessionBehavior,
  type CatBehaviorIndex,
} from "@/lib/presentation/behaviorStates";
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
 * @param index - The owner's behavior index. Without it, counted visits are Normal (provisional).
 * @returns An object with a count for each behavior state.
 */
export function deriveSessionLogCounts(
  sessions: readonly Session[],
  index?: CatBehaviorIndex | null,
): SessionLogCounts {
  const counts = { ...EMPTY_COUNTS };

  for (const session of sessions) {
    // Daily summary rows are aggregate placeholders — count each hidden visit
    const visits = session.summaryVisits ?? 1;
    const { state } = getIndexedSessionBehavior(session, index);

    counts[state] = (counts[state] ?? 0) + visits;
  }

  return counts;
}
