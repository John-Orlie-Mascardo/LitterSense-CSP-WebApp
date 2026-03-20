"use client";

import { useState, useCallback } from "react";
import { mockCats, mockSessions, mockHealthLogs, mockPastReports, type PastReport } from "../data/mockData";
import { generateId } from "../utils/formatters";

export interface ReportConfig {
  catId: string | "all";
  dateRange: "7" | "30" | "90" | "custom";
  customStartDate?: string;
  customEndDate?: string;
}

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
  sessions: typeof mockSessions;
  healthLogs: typeof mockHealthLogs;
}

export function useReports() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null);
  const [pastReports, setPastReports] = useState<PastReport[]>(mockPastReports);

  const generateReport = useCallback(async (config: ReportConfig): Promise<ReportData> => {
    setIsGenerating(true);
    setProgress(0);

    // Simulate generation progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 20;
      });
    }, 400);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    clearInterval(progressInterval);
    setProgress(100);

    // Get cat info
    const cat = config.catId === "all" 
      ? null 
      : mockCats.find((c) => c.id === config.catId);
    
    const catName = cat?.name || "All Cats";
    const actualCatId = cat?.id || "all";

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    if (config.dateRange === "custom" && config.customStartDate) {
      startDate.setTime(new Date(config.customStartDate).getTime());
    } else {
      startDate.setDate(endDate.getDate() - parseInt(config.dateRange));
    }

    const period = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    // Filter sessions
    const filteredSessions = mockSessions.filter((session) => {
      if (config.catId !== "all" && session.catId !== config.catId) return false;
      const sessionDate = new Date(session.date);
      return sessionDate >= startDate && sessionDate <= endDate;
    });

    // Filter health logs
    const filteredHealthLogs = mockHealthLogs.filter((log) => {
      if (config.catId !== "all" && log.catId !== config.catId) return false;
      const logDate = new Date(log.date);
      return logDate >= startDate && logDate <= endDate;
    });

    // Calculate summary
    const totalSessions = filteredSessions.length;
    const daysDiff = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const avgSessionsPerDay = Math.round((totalSessions / daysDiff) * 10) / 10;
    
    const totalDuration = filteredSessions.reduce((sum, s) => sum + s.durationSecs, 0);
    const avgDurationSecs = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
    const avgDuration = `${Math.floor(avgDurationSecs / 60)}m ${(avgDurationSecs % 60).toString().padStart(2, "0")}s`;
    
    const anomaliesDetected = filteredSessions.filter((s) => s.anomaly).length;
    
    // Determine overall status
    let overallStatus: "healthy" | "watch" | "alert" = "healthy";
    let statusMessage = "No concerning patterns detected";
    
    if (anomaliesDetected > 0) {
      if (anomaliesDetected > 2) {
        overallStatus = "alert";
        statusMessage = "Multiple anomalies detected — recommend vet consultation";
      } else {
        overallStatus = "watch";
        statusMessage = "Elevated visit frequency — monitor closely";
      }
    }

    const report: ReportData = {
      id: generateId(),
      catName,
      catId: actualCatId,
      period,
      generatedOn: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      ownerName: "Maria Santos",
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
    };

    setCurrentReport(report);
    setIsGenerating(false);

    // Add to past reports
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
  }, []);

  const deleteReport = useCallback((reportId: string) => {
    setPastReports((prev) => prev.filter((r) => r.id !== reportId));
  }, []);

  const downloadReport = useCallback((filename: string) => {
    // Mock download
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
