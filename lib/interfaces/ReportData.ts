/**
 * ReportData.ts
 *
 * Describes the persisted snapshot used by report previews and exports.
 *
 * DONE: summary, sessions, notes, trends, and stable per-cat presentation snapshots
 * PLACEHOLDER: none
 *
 * NEXT: data-model owners version this shape before making incompatible archive changes.
 */

import type { CatTrendPoint } from "../contexts/CatContext";
import type { ReportHealthLog, ReportSession } from "../hooks/useReports";
import type { ReportCatSnapshot } from "../presentation/reportSessionGroups";

export interface ReportData {
  id: string;
  catName: string;
  catId: string;
  period: string;
  generatedOn: string;
  ownerName: string;
  cats?: ReportCatSnapshot[];
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
