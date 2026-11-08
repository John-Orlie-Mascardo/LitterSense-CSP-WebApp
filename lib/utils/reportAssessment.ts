import type { Session } from "@/lib/interfaces/Session";
import { ABNORMAL_DURATION_SECS } from "@/lib/configs/behaviorThresholds";

type ReportSessionAssessmentInput = Pick<
  Session,
  "anomaly" | "anomalyType" | "durationSecs" | "sessionStatus" | "summaryVisits"
>;

export function isReportSessionConcern(session: ReportSessionAssessmentInput) {
  const status = session.sessionStatus?.toUpperCase();
  if (status === "ABNORMAL" || status === "NO_EXIT_TIMEOUT") return true;
  if (session.anomalyType === "No exit timeout") return true;
  if (session.durationSecs >= ABNORMAL_DURATION_SECS) return true;

  if (!session.anomaly) return false;
  if (status === "SHORT_SESSION" || session.anomalyType === "Short session") {
    return false;
  }

  return session.anomalyType === "Extended duration";
}

export function getReportConcernCount(sessions: ReportSessionAssessmentInput[]) {
  return sessions.reduce(
    (sum, session) =>
      sum + (isReportSessionConcern(session) ? session.summaryVisits ?? 1 : 0),
    0,
  );
}
