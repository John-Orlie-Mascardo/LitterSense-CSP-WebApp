import type { Session } from "@/lib/interfaces/Session";

type ReportSessionAssessmentInput = Pick<
  Session,
  "anomaly" | "anomalyType" | "durationSecs" | "sessionStatus" | "summaryVisits"
>;

const REPORT_EXTENDED_DURATION_SECS = 600;

export function isReportSessionConcern(session: ReportSessionAssessmentInput) {
  const status = session.sessionStatus?.toUpperCase();
  if (status === "ABNORMAL" || status === "NO_EXIT_TIMEOUT") return true;
  if (session.anomalyType === "No exit timeout") return true;
  if (session.durationSecs >= REPORT_EXTENDED_DURATION_SECS) return true;

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
