import { Session } from "./Session";
import { HealthLog } from "./HealthLog";

export interface ReportData {
  id: string;
  catName: string;
  catId: string;
  period: string;
  generatedOn: string;
  ownerName: string;
  summary: {
    totalSessions: number;
    avgSessionsPerDay: number;
    avgDuration: string;
    anomaliesDetected: number;
    overallStatus: "healthy" | "watch" | "alert";
    statusMessage: string;
  };
  sessions: Session[];
  healthLogs: HealthLog[];
}
