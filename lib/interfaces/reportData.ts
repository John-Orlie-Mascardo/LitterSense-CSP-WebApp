import { CatTrendPoint } from "../contexts/CatContext";
import { ReportHealthLog, ReportSession } from "../hooks/useReports";

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
    sessions: ReportSession[];
    healthLogs: ReportHealthLog[];
    trendData: CatTrendPoint[] | null;
  }