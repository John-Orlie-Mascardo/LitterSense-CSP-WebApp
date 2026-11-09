import type { Session } from "@/lib/interfaces/Session";
import {
  getIndexedSessionBehavior,
  type CatBehaviorIndex,
} from "@/lib/presentation/behaviorStates";

type ReportSessionAssessmentInput = Pick<
  Session,
  "id" | "catId" | "anomaly" | "anomalyType" | "durationSecs" | "sessionStatus"
>;

export function isReportSessionConcern(
  session: ReportSessionAssessmentInput,
  behaviorIndex?: CatBehaviorIndex | null,
) {
  return getIndexedSessionBehavior(session, behaviorIndex).state === "abnormal";
}

export function getReportConcernCount(
  sessions: readonly ReportSessionAssessmentInput[],
  behaviorIndex?: CatBehaviorIndex | null,
) {
  return sessions.reduce(
    (sum, session) => sum + (isReportSessionConcern(session, behaviorIndex) ? 1 : 0),
    0,
  );
}
