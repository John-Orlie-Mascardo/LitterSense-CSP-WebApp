/**
 * catBehavior.ts
 *
 * Builds the per-owner behavior index (computed baselines and same-day visit
 * counts) and the shared "today" cat summary used by Home, My Cats, the cat
 * page, and Predictive Health, so every screen shows the same result.
 *
 * Pure: no network calls and no writes. The baseline is computed on read.
 */

import {
  buildPersonalBaseline,
  getManilaDateKey,
  getVisitManilaDateKey,
  isCountedVisit,
  type PersonalBaseline,
  type PersonalBaselineVisit,
} from "@/lib/utils/personalBaseline";
import {
  getIndexedSessionBehavior,
  summarizeCatBehavior,
  type BehaviorDisplay,
  type CatBehaviorIndex,
} from "@/lib/presentation/behaviorStates";

export interface CatBehaviorVisit extends PersonalBaselineVisit {
  readonly id: string;
  readonly anomalyType?: string | null;
}

export interface CatBehaviorSummary extends BehaviorDisplay {
  readonly baseline: PersonalBaseline | null;
}

const getVisitTime = (visit: CatBehaviorVisit) => {
  const parsed = Date.parse(visit.endedAt || visit.startedAt || "");
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const compareVisitOrder = (left: CatBehaviorVisit, right: CatBehaviorVisit) =>
  getVisitTime(left) - getVisitTime(right) || left.id.localeCompare(right.id);

export function buildCatBehaviorIndex(
  visits: readonly CatBehaviorVisit[],
  now = new Date(),
): CatBehaviorIndex {
  const visitsByCat = new Map<string, CatBehaviorVisit[]>();
  for (const visit of visits) {
    const catId = visit.catId;
    if (!catId?.trim()) continue;
    const catVisits = visitsByCat.get(catId) ?? [];
    catVisits.push(visit);
    visitsByCat.set(catId, catVisits);
  }

  const baselineByCatId = new Map<string, PersonalBaseline>();
  const countedVisitsTodayBySessionId = new Map<string, number>();
  const catIdsWithCountedVisits = new Set<string>();

  for (const [catId, catVisits] of visitsByCat) {
    baselineByCatId.set(catId, buildPersonalBaseline(catVisits, now));

    const countedByDay = new Map<string, CatBehaviorVisit[]>();
    for (const visit of catVisits) {
      if (!isCountedVisit(visit)) continue;
      catIdsWithCountedVisits.add(catId);
      const dayKey = getVisitManilaDateKey(visit);
      if (!dayKey) continue;
      const dayVisits = countedByDay.get(dayKey) ?? [];
      dayVisits.push(visit);
      countedByDay.set(dayKey, dayVisits);
    }

    for (const dayVisits of countedByDay.values()) {
      dayVisits.sort(compareVisitOrder).forEach((visit, position) => {
        countedVisitsTodayBySessionId.set(visit.id, position + 1);
      });
    }
  }

  return { baselineByCatId, countedVisitsTodayBySessionId, catIdsWithCountedVisits };
}

/** The cat's state for today (Asia/Manila), shared by every screen that shows it. */
export function getCatBehaviorToday(
  catId: string,
  sessions: readonly CatBehaviorVisit[],
  index: CatBehaviorIndex | null | undefined,
  now = new Date(),
): CatBehaviorSummary {
  const today = getManilaDateKey(now);
  const baseline = index?.baselineByCatId.get(catId) ?? null;
  const summary = summarizeCatBehavior({
    sessionStates: sessions
      .filter((session) => getVisitManilaDateKey(session) === today)
      .map((session) => getIndexedSessionBehavior(session, index)),
    hasCountedVisits: index?.catIdsWithCountedVisits.has(catId) ?? false,
    baseline,
  });
  return { ...summary, baseline };
}
