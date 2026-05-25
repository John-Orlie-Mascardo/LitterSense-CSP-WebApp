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
    overallStatus: 'normal' | 'abnormal';
    statusMessage: string;
  };
  sessions: ReportSession[];
  healthLogs: ReportHealthLog[];
  trendData: CatTrendPoint[] | null;
}
