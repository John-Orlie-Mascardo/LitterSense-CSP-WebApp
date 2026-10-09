/**
 * useReports.ts
 *
 * Builds and archives reports from the owner’s existing Firebase-backed records.
 *
 * DONE: record filtering, Unattributed retention, cat/trend snapshots, archive actions
 * PLACEHOLDER: none
 *
 * NEXT: data owners should move long-running generation to a server job if needed.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "@/lib/utils/operationalClient";
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
import {
  buildAggregateTrendReferences,
  buildCatTrendReferences,
  type BaselineMetricsInput,
} from "@/lib/presentation/trendCharts";

export type ReportSession = Session & {
  catName: string;
};

export type ReportHealthLog = HealthLog & {
  catName: string;
};

export type { ReportData };

type ReportCache = {
  ownerId: string | null;
  currentReport: ReportData | null;
  pastReports: PastReport[];
  archive: Record<string, ReportData>;
};

const emptyReportCache = (ownerId: string | null): ReportCache => ({
  ownerId, currentReport: null, pastReports: [], archive: {},
});

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
  const ownerId = user?.uid ?? null;
  const {
    cats,
    sessions: rawSessions,
    getDetailsByCatId,
    getHealthLogsByCatId,
    getSessionsByCatId,
    getTrendData,
    historyLoading,
  } = useCats();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reportCache, setReportCache] = useState<ReportCache>(() => emptyReportCache(ownerId));
  const reportOwner = useRef({ ownerId, generation: 0, active: true });
  const visibleCache = reportCache.ownerId === ownerId ? reportCache : emptyReportCache(ownerId);
  const { currentReport, pastReports, archive: reportArchive } = visibleCache;
  const isCurrentOwner = useCallback(() => reportOwner.current.active && reportOwner.current.ownerId === ownerId, [ownerId]);

  const setCurrentReport = useCallback((value: ReportData | null | ((previous: ReportData | null) => ReportData | null)) => {
    if (!isCurrentOwner()) return;
    setReportCache(previous => {
      if (!isCurrentOwner()) return previous;
      const current = previous.ownerId === ownerId ? previous : emptyReportCache(ownerId);
      return { ...current, currentReport: typeof value === "function" ? value(current.currentReport) : value };
    });
  }, [isCurrentOwner, ownerId]);

  useEffect(() => {
    let active = true;
    const generation = reportOwner.current.generation + 1;
    reportOwner.current = { ownerId, generation, active: true };
    queueMicrotask(() => {
      if (active) setReportCache(previous => previous.ownerId === ownerId ? previous : emptyReportCache(ownerId));
    });
    const stop = () => {
      active = false;
      if (reportOwner.current.generation === generation) reportOwner.current.active = false;
    };
    if (!ownerId) return stop;

    const unsubscribe = onSnapshot(
      collection(db, "users", ownerId, "reports"),
      (snapshot) => {
        if (!active) return;
        const nextArchive: Record<string, ReportData> = {};
        const loaded = snapshot.docs.map((reportDoc) => {
          const data = reportDoc.data();
          if (data.report && typeof data.report === "object") {
            nextArchive[reportDoc.id] = data.report as ReportData;
          }
          return normalizePastReport(reportDoc.id, data);
        });
        setReportCache(previous => {
          if (!active) return previous;
          const current = previous.ownerId === ownerId ? previous : emptyReportCache(ownerId);
          return { ...current, pastReports: sortPastReports(loaded), archive: nextArchive };
        });
      },
      (error) => {
        console.error("Failed to sync previous reports:", error);
      },
    );

    return () => { stop(); unsubscribe(); };
  }, [ownerId]);

  const generateReport = useCallback(async (config: ReportConfig): Promise<ReportData> => {
    if (historyLoading) throw new Error("Visit history is still loading. Please wait before generating a report.");
    if (!isCurrentOwner()) throw new Error("Your account has changed. Please generate the report again.");
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

    const selectedReportCats = actualCatId === "all" ? cats : cat ? [cat] : [];
    const reportBaselines = selectedReportCats.flatMap((reportCat) => {
      const baseline = getDetailsByCatId(reportCat.id)?.baseline;
      return baseline ? [baseline as BaselineMetricsInput] : [];
    });

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
      cats: selectedReportCats.map((reportCat) => ({
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
      trendReferences: actualCatId === "all"
        ? buildAggregateTrendReferences(reportBaselines)
        : buildCatTrendReferences(reportBaselines[0]),
    };

    setCurrentReport(report);
    setReportCache(previous => {
      if (!isCurrentOwner()) return previous;
      const current = previous.ownerId === ownerId ? previous : emptyReportCache(ownerId);
      return { ...current, archive: { ...current.archive, [report.id]: report } };
    });
    setProgress(100);
    setIsGenerating(false);

    const newPastReport: PastReport = {
      id: report.id,
      catId: actualCatId,
      catName,
      range: period,
      generatedOn: new Date().toISOString().split("T")[0],
      filename: `${catName.replaceAll(/[<>:"/\\|?*]/g, "_").trim() || "All Cats"}_cat health reports.pdf`,
    };
    if (user) {
      await setDoc(doc(db, "users", user.uid, "reports", newPastReport.id), {
        ...newPastReport,
        report: JSON.parse(JSON.stringify(report)) as ReportData,
        createdAt: serverTimestamp(),
      });
    } else {
      setReportCache(previous => {
        if (!isCurrentOwner()) return previous;
        const current = previous.ownerId === ownerId ? previous : emptyReportCache(ownerId);
        return { ...current, pastReports: sortPastReports([newPastReport, ...current.pastReports]) };
      });
    }

    return report;
  }, [cats, getDetailsByCatId, getHealthLogsByCatId, getSessionsByCatId, getTrendData, historyLoading, isCurrentOwner, ownerId, rawSessions, setCurrentReport, user]);

  const deleteReport = useCallback(async (reportId: string) => {
    if (!isCurrentOwner()) return;
    const generation = reportOwner.current.generation;
    if (user) {
      await deleteDoc(doc(db, "users", user.uid, "reports", reportId));
    }
    if (!isCurrentOwner() || reportOwner.current.generation !== generation) return;
    setReportCache(previous => {
      if (!isCurrentOwner() || reportOwner.current.generation !== generation || previous.ownerId !== ownerId) return previous;
      const archive = { ...previous.archive };
      delete archive[reportId];
      return { ...previous, archive, pastReports: !user ? previous.pastReports.filter(report => report.id !== reportId) : previous.pastReports };
    });
  }, [isCurrentOwner, ownerId, user]);

  const viewReport = useCallback((reportId: string) => {
    if (!isCurrentOwner()) return false;
    const report = reportArchive[reportId];
    if (!report) return false;
    setCurrentReport(report);
    return true;
  }, [isCurrentOwner, reportArchive, setCurrentReport]);

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
