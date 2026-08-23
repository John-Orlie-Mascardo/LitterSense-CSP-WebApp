/**
 * useReports.ts
 *
 * Builds and archives reports from the owner’s existing Firebase-backed records.
 *
 * DONE: real record filtering, Unattributed retention, cat snapshots, archive actions
 * PLACEHOLDER: none
 *
 * NEXT: data owners should move long-running generation to a server job if needed.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useCats, type CatTrendPoint } from "@/lib/contexts/CatContext";
import {
  type HealthLog,
  type PastReport,
  type Session,
} from "../data/data";
import { generateId } from "../utils/formatters";
import { normalizePastReport, sortPastReports } from "@/lib/utils/reportHistory";
import { getReportConcernCount } from "@/lib/utils/reportAssessment";
import { getSessionSortValue as getSessionSortTimestamp } from "../utils/sessionTime";
import { ReportConfig } from "@/lib/interfaces/ReportConfig";
import type { ReportData } from "@/lib/interfaces/ReportData";
import { hasEstablishedBaseline } from "@/lib/presentation/behaviorStates";
import { UNATTRIBUTED_GROUP_NAME } from "@/lib/presentation/reportSessionGroups";

export type ReportSession = Session & {
  catName: string;
};

export type ReportHealthLog = HealthLog & {
  catName: string;
};

export type { ReportData };

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
  return getSessionSortTimestamp(session);
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
    sessions: rawSessions,
    getDetailsByCatId,
    getHealthLogsByCatId,
    getSessionsByCatId,
    getTrendData,
  } = useCats();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null);
  const [pastReports, setPastReports] = useState<PastReport[]>([]);
  const [reportArchive, setReportArchive] = useState<Record<string, ReportData>>({});

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setPastReports([]));
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "users", user.uid, "reports"),
      (snapshot) => {
        const nextArchive: Record<string, ReportData> = {};
        const loaded = snapshot.docs.map((reportDoc) => {
          const data = reportDoc.data();
          if (data.report && typeof data.report === "object") {
            nextArchive[reportDoc.id] = data.report as ReportData;
          }
          return normalizePastReport(reportDoc.id, data);
        });
        setPastReports(sortPastReports(loaded));
        setReportArchive(nextArchive);
      },
      (error) => {
        console.error("Failed to sync previous reports:", error);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const generateReport = useCallback(async (config: ReportConfig): Promise<ReportData> => {
    setIsGenerating(true);
    setProgress(0);

    setProgress(20);

    const cat = config.catId === "all"
      ? null
      : cats.find((item) => item.id === config.catId);
    const catName = cat?.name || "All Cats";
    const actualCatId = cat?.id || "all";
    const catNameById = new Map(cats.map((item) => [item.id, item.name]));
    const knownCatIds = new Set(cats.map((item) => item.id));
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
        ? [
            ...cats.flatMap((item) => getSessionsByCatId(item.id)),
            ...rawSessions.filter((session) => !knownCatIds.has(session.catId)),
          ]
        : getSessionsByCatId(actualCatId);
    const filteredSessions = sourceSessions
      .filter((session) => session.date >= startKey && session.date <= endKey)
      .map<ReportSession>((session) => ({
        ...session,
        catName: catNameById.get(session.catId) ?? UNATTRIBUTED_GROUP_NAME,
      }))
      .sort((a, b) => getSessionSortValue(b) - getSessionSortValue(a));

    setProgress(60);

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
    const anomaliesDetected = getReportConcernCount(filteredSessions);

    let overallStatus: "normal" | "abnormal" = "normal";
    let statusMessage = "No concerning patterns detected";

    if (anomaliesDetected > 0) {
      if (anomaliesDetected > 2) {
        overallStatus = "abnormal";
        statusMessage = "Multiple anomalies detected - recommend vet consultation";
      } else {
        overallStatus = "abnormal";
        statusMessage = "Abnormal visit frequency - monitor closely";
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
      cats: (actualCatId === "all" ? cats : cat ? [cat] : []).map((reportCat) => ({
        id: reportCat.id,
        name: reportCat.name,
        avatar: reportCat.avatar,
        baselineEstablished: hasEstablishedBaseline(getDetailsByCatId(reportCat.id)),
      })),
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
    setReportArchive((prev) => ({ ...prev, [report.id]: report }));
    setProgress(100);
    setIsGenerating(false);

    const newPastReport: PastReport = {
      id: report.id,
      catId: actualCatId,
      catName,
      range: period,
      generatedOn: new Date().toISOString().split("T")[0],
      filename: `LitterSense_${catName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`,
    };
    if (user) {
      await setDoc(doc(db, "users", user.uid, "reports", newPastReport.id), {
        ...newPastReport,
        report: JSON.parse(JSON.stringify(report)) as ReportData,
        createdAt: serverTimestamp(),
      });
    } else {
      setPastReports((prev) => sortPastReports([newPastReport, ...prev]));
    }

    return report;
  }, [cats, getDetailsByCatId, getHealthLogsByCatId, getSessionsByCatId, getTrendData, rawSessions, user]);

  const deleteReport = useCallback(async (reportId: string) => {
    if (user) {
      await deleteDoc(doc(db, "users", user.uid, "reports", reportId));
    }
    if (!user) {
      setPastReports((prev) => prev.filter((report) => report.id !== reportId));
    }
    setReportArchive((prev) => {
      const next = { ...prev };
      delete next[reportId];
      return next;
    });
  }, [user]);

  const viewReport = useCallback((reportId: string) => {
    const report = reportArchive[reportId];
    if (!report) return false;
    setCurrentReport(report);
    return true;
  }, [reportArchive]);

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
    viewReport,
    downloadReport,
    setCurrentReport,
  };
}
