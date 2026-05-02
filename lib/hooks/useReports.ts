"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useCats, type CatTrendPoint } from "@/lib/contexts/CatContext";
import {
  mockPastReports,
  type HealthLog,
  type PastReport,
  type Session,
} from "../data/data";
import { generateId } from "../utils/formatters";
import { ReportConfig } from "../interfaces/reportconfig";
import { ReportData } from "../interfaces/reportData";

export type ReportSession = Session & {
  catName: string;
};

export type ReportHealthLog = HealthLog & {
  catName: string;
};

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getDateRange = (config: ReportConfig) => {
  const customEnd = config.customEndDate
    ? parseDateKey(config.customEndDate)
    : null;
  const endDate = customEnd ?? new Date();
  const rangeDays = Number.parseInt(config.dateRange, 10);
  const customStart = config.customStartDate
    ? parseDateKey(config.customStartDate)
    : null;
  const startDate =
    config.dateRange === "custom" && customStart
      ? customStart
      : addDays(endDate, -(Number.isFinite(rangeDays) ? rangeDays - 1 : 6));

  if (startDate > endDate) {
    return {
      startDate: endDate,
      endDate: startDate,
      startKey: getLocalDateKey(endDate),
      endKey: getLocalDateKey(startDate),
    };
  }

  return {
    startDate,
    endDate,
    startKey: getLocalDateKey(startDate),
    endKey: getLocalDateKey(endDate),
  };
};

const getInclusiveDayCount = (startDate: Date, endDate: Date) => {
  const start = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  const end = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
};

const getVisitCount = (session: Session) => session.summaryVisits ?? 1;

const getSessionSortValue = (session: Session) => {
  const parsed = Date.parse(`${session.date} ${session.time}`);
  if (!Number.isNaN(parsed)) return parsed;
  return Date.parse(session.date) || 0;
};

const buildAggregateTrendData = (
  sessions: ReportSession[],
): CatTrendPoint[] | null => {
  if (sessions.length === 0) return null;

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(new Date(), -(6 - index));
    return {
      key: getLocalDateKey(date),
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
    };
  });

  return days.map((day) => {
    const daySessions = sessions.filter((session) => session.date === day.key);
    const visits = daySessions.reduce(
      (sum, session) => sum + getVisitCount(session),
      0,
    );
    const totalDuration = daySessions.reduce(
      (sum, session) => sum + session.durationSecs * getVisitCount(session),
      0,
    );
    const detailedGasRows = daySessions.filter(
      (session) => !session.summaryVisits,
    );
    const mq135Delta =
      detailedGasRows.length > 0
        ? Math.round(
            detailedGasRows.reduce(
              (sum, session) => sum + session.mq135Delta,
              0,
            ) / detailedGasRows.length,
          )
        : 0;

    return {
      day: day.label,
      visits,
      avgDuration: visits > 0 ? Math.round(totalDuration / visits) : 0,
      mq135Delta,
    };
  });
};

export function useReports() {
  const { user } = useAuth();
  const {
    cats,
    getHealthLogsByCatId,
    getSessionsByCatId,
    getTrendData,
  } = useCats();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null);
  const [pastReports, setPastReports] = useState<PastReport[]>(mockPastReports);

  const generateReport = useCallback(async (config: ReportConfig): Promise<ReportData> => {
    setIsGenerating(true);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 20;
      });
    }, 400);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    clearInterval(progressInterval);
    setProgress(100);

    const cat = config.catId === "all"
      ? null
      : cats.find((item) => item.id === config.catId);
    const catName = cat?.name || "All Cats";
    const actualCatId = cat?.id || "all";
    const catNameById = new Map(cats.map((item) => [item.id, item.name]));
    const { startDate, endDate, startKey, endKey } = getDateRange(config);
    const period = `${startDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} - ${endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;

    const sourceSessions =
      actualCatId === "all"
        ? cats.flatMap((item) => getSessionsByCatId(item.id))
        : getSessionsByCatId(actualCatId);
    const filteredSessions = sourceSessions
      .filter((session) => session.date >= startKey && session.date <= endKey)
      .map<ReportSession>((session) => ({
        ...session,
        catName: catNameById.get(session.catId) ?? "Unknown Cat",
      }))
      .sort((a, b) => getSessionSortValue(b) - getSessionSortValue(a));

    const sourceHealthLogs =
      actualCatId === "all"
        ? cats.flatMap((item) => getHealthLogsByCatId(item.id))
        : getHealthLogsByCatId(actualCatId);
    const filteredHealthLogs = sourceHealthLogs
      .filter((log) => log.date >= startKey && log.date <= endKey)
      .map<ReportHealthLog>((log) => ({
        ...log,
        catName: catNameById.get(log.catId) ?? "Unknown Cat",
      }));

    const totalSessions = filteredSessions.reduce(
      (sum, session) => sum + getVisitCount(session),
      0,
    );
    const daysDiff = getInclusiveDayCount(startDate, endDate);
    const avgSessionsPerDay = Math.round((totalSessions / daysDiff) * 10) / 10;
    const totalDuration = filteredSessions.reduce(
      (sum, session) => sum + session.durationSecs * getVisitCount(session),
      0,
    );
    const avgDurationSecs =
      totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
    const avgDuration = `${Math.floor(avgDurationSecs / 60)}m ${(
      avgDurationSecs % 60
    ).toString().padStart(2, "0")}s`;
    const anomaliesDetected = filteredSessions.reduce(
      (sum, session) => sum + (session.anomaly ? getVisitCount(session) : 0),
      0,
    );

    let overallStatus: "healthy" | "watch" | "alert" = "healthy";
    let statusMessage = "No concerning patterns detected";

    if (anomaliesDetected > 0) {
      if (anomaliesDetected > 2) {
        overallStatus = "alert";
        statusMessage = "Multiple anomalies detected - recommend vet consultation";
      } else {
        overallStatus = "watch";
        statusMessage = "Elevated visit frequency - monitor closely";
      }
    }

    const report: ReportData = {
      id: generateId(),
      catName,
      catId: actualCatId,
      period,
      generatedOn: new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      ownerName: user?.displayName || user?.email || "LitterSense User",
      summary: {
        totalSessions,
        avgSessionsPerDay,
        avgDuration,
        anomaliesDetected,
        overallStatus,
        statusMessage,
      },
      sessions: filteredSessions,
      healthLogs: filteredHealthLogs,
      trendData:
        actualCatId === "all"
          ? buildAggregateTrendData(filteredSessions)
          : getTrendData(actualCatId),
    };

    setCurrentReport(report);
    setIsGenerating(false);

    const newPastReport: PastReport = {
      id: report.id,
      catId: actualCatId,
      catName,
      range: period,
      generatedOn: new Date().toISOString().split("T")[0],
      filename: `LitterSense_${catName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`,
    };
    setPastReports((prev) => [newPastReport, ...prev]);

    return report;
  }, [cats, getHealthLogsByCatId, getSessionsByCatId, getTrendData, user]);

  const deleteReport = useCallback((reportId: string) => {
    setPastReports((prev) => prev.filter((report) => report.id !== reportId));
  }, []);

  const downloadReport = useCallback((filename: string) => {
    console.log(`Downloading ${filename}...`);
  }, []);

  return {
    isGenerating,
    progress,
    currentReport,
    pastReports,
    generateReport,
    deleteReport,
    downloadReport,
    setCurrentReport,
  };
}
