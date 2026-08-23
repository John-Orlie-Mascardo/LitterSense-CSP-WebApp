/**
 * reportSessionGroups.ts
 *
 * Groups existing report sessions into stable per-cat presentation sections.
 *
 * DONE: named ordering, state derivation, visit counts, final Unattributed group
 * PLACEHOLDER: none
 *
 * NEXT: report UI owners should keep grouping changes presentation-only.
 */

import {
  getMostSevereState,
  getSessionDisplayState,
  type BehaviorStateId,
} from "./behaviorStates";

export const UNATTRIBUTED_GROUP_NAME = "Unattributed sessions";
export const UNATTRIBUTED_GROUP_DESCRIPTION =
  "Litter box use was detected but no collar tag was read.";

export interface ReportCatSnapshot {
  readonly id: string;
  readonly name: string;
  readonly avatar?: string | null;
  readonly baselineEstablished: boolean;
}

export interface ReportSessionLike {
  readonly id: string;
  readonly catId: string;
  readonly catName: string;
  readonly anomaly?: boolean;
  readonly anomalyType?: string | null;
  readonly sessionStatus?: string | null;
  readonly summaryVisits?: number;
}

export type ReportSessionWithState<TSession extends ReportSessionLike> = TSession & {
  readonly displayState: BehaviorStateId;
};

export interface ReportSessionGroup<TSession extends ReportSessionLike> {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly sessionCount: number;
  readonly state: BehaviorStateId;
  readonly sessions: readonly ReportSessionWithState<TSession>[];
  readonly isUnattributed: boolean;
  readonly description?: string;
}

const isUnattributedSession = (session: ReportSessionLike) =>
  !session.catId || session.catName === UNATTRIBUTED_GROUP_NAME;

const countVisits = (sessions: readonly ReportSessionLike[]) =>
  sessions.reduce((total, session) => total + (session.summaryVisits ?? 1), 0);

export function buildReportSessionGroups<TSession extends ReportSessionLike>(
  sessions: readonly TSession[],
  cats: readonly ReportCatSnapshot[],
): ReportSessionGroup<TSession>[] {
  const namedSessions = sessions.filter((session) => !isUnattributedSession(session));
  const unattributedSessions = sessions.filter(isUnattributedSession);
  const catById = new Map(cats.map((cat) => [cat.id, cat]));

  for (const session of namedSessions) {
    if (!catById.has(session.catId)) {
      catById.set(session.catId, {
        id: session.catId,
        name: session.catName,
        avatar: null,
        baselineEstablished: false,
      });
    }
  }

  const groups: ReportSessionGroup<TSession>[] = [...catById.values()].map((cat) => {
    const catSessions = namedSessions.filter((session) => session.catId === cat.id);
    const sessionsWithState = catSessions.map((session) => ({
      ...session,
      displayState: getSessionDisplayState({
        sessionStatus: session.sessionStatus,
        anomaly: session.anomaly,
        anomalyType: session.anomalyType,
        isAttributed: true,
        baselineEstablished: cat.baselineEstablished,
      }),
    }));

    return {
      id: cat.id,
      name: cat.name,
      avatar: cat.avatar ?? null,
      sessionCount: countVisits(catSessions),
      state: getMostSevereState(sessionsWithState.map((session) => session.displayState)),
      sessions: sessionsWithState,
      isUnattributed: false,
    };
  });

  if (unattributedSessions.length > 0) {
    groups.push({
      id: "unattributed",
      name: UNATTRIBUTED_GROUP_NAME,
      avatar: null,
      sessionCount: countVisits(unattributedSessions),
      state: "unattributed",
      sessions: unattributedSessions.map((session) => ({
        ...session,
        displayState: "unattributed" as const,
      })),
      isUnattributed: true,
      description: UNATTRIBUTED_GROUP_DESCRIPTION,
    });
  }

  return groups;
}
