/**
 * Reports page.
 *
 * Generates activity reports from existing records and renders printable per-cat logs.
 *
 * DONE: owner-facing exports, labeled trends, shared state key, grouped logs, archive actions
 * PLACEHOLDER: none
 *
 * NEXT: report owners should add server-side PDF generation if browser printing is replaced.
 *
 * NOTE(manuscript): User-facing report ranges, state copy, and report labels must
 * remain aligned with the capstone paper.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Download,
  Table,
  Trash2,
  ChevronDown,
  Loader2,
  FileSpreadsheet,
  Wind,
  Timer,
  Clock,
  PlusCircle,
  MoreVertical,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { MetricTrendChart } from "@/components/charts/MetricTrendChart";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastContainer, type ToastParams } from "@/components/ui/Toast";
import { BehaviorStateBadge } from "@/components/behavior/BehaviorStateBadge";
import { BehaviorStateLegend } from "@/components/behavior/BehaviorStateLegend";
import { SessionAccordion } from "@/components/reports/SessionAccordion";
import { useCats } from "@/lib/contexts/CatContext";
import type { PastReport } from "@/lib/data/mockData";
import { useReports, type ReportData } from "@/lib/hooks/useReports";
import {
  formatDate,
  generateId,
} from "@/lib/utils/formatters";
import { isReportSessionConcern } from "@/lib/utils/reportAssessment";
import {
  BEHAVIOR_STATE_BY_ID,
  formatMetricValue,
  getMostSevereState,
} from "@/lib/presentation/behaviorStates";
import {
  buildReportSessionGroups,
  type ReportCatSnapshot,
} from "@/lib/presentation/reportSessionGroups";
import { getMetricTrendPoints } from "@/lib/presentation/trendCharts";

type DateRangeValue = "1" | "3" | "7" | "14" | "21" | "30";

const dateRanges: { value: DateRangeValue; label: string }[] = [
  // NOTE(manuscript): These visible period numbers must match the report ranges in the paper.
  { value: "1", label: "Last 1 Day" },
  { value: "3", label: "Last 3 Days" },
  { value: "7", label: "Last 7 Days" },
  { value: "14", label: "Last 14 Days" },
  { value: "21", label: "Last 21 Days" },
  { value: "30", label: "Last 30 Days" },
];

const csvCell = (value: string | number | boolean) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export default function ReportsPage() {
  const { cats, isLoading: catsLoading } = useCats();
  const {
    isGenerating,
    progress,
    currentReport,
    pastReports,
    generateReport,
    deleteReport,
    viewReport,
  } = useReports();

  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [selectedRange, setSelectedRange] = useState<DateRangeValue>("7");
  const [toasts, setToasts] = useState<Omit<ToastParams, "onClose">[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAllReports, setShowAllReports] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const hasCats = cats.length > 0;
  const visibleReports = showAllReports ? pastReports : pastReports.slice(0, 3);

  useEffect(() => {
    const requestedCatId = new URLSearchParams(globalThis.location.search).get("catId");
    if (requestedCatId) {
      queueMicrotask(() => setSelectedCat(requestedCatId));
    }
  }, []);

  useEffect(() => {
    if (selectedCat !== "all" && cats.length > 0 && !cats.some((cat) => cat.id === selectedCat)) {
      queueMicrotask(() => setSelectedCat("all"));
    }
  }, [cats, selectedCat]);

  const addToast = (message: string, type: ToastParams["type"] = "info") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const handleGenerate = async () => {
    if (!hasCats) {
      addToast("Add a cat before generating a report", "info");
      return;
    }

    await generateReport({
      catId: selectedCat,
      dateRange: selectedRange,
    });
    setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleExportPDF = () => {
    if (!currentReport) return;
    addToast("Opening print dialog. Choose Save as PDF to export.", "info");
    window.print();
  };

  const handleExportCSV = () => {
    if (!currentReport) return;
    const headers = "Cat,Date,Time,Visits,Duration,Air quality change (%),Odor level change (%),Anomaly\n";
    const rows = currentReport.sessions
      .map(
        (s) =>
          [
            csvCell(s.catName),
            csvCell(s.date),
            csvCell(s.time || "--"),
            csvCell(s.summaryVisits ?? 1),
            csvCell(s.durationSecs),
            csvCell(s.mq135Delta),
            csvCell(s.mq136Delta),
            csvCell(isReportSessionConcern(s) ? "Yes" : "No"),
          ].join(",")
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `LitterSense_${currentReport.catName.replaceAll(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast("CSV exported successfully", "success");
  };

  const handleDeletePastReport = async (id: string) => {
    await deleteReport(id);
    setDeleteConfirmId(null);
    addToast("Report deleted", "info");
  };

  const handleViewPastReport = (id: string) => {
    if (!viewReport(id)) {
      addToast("This report preview is no longer available in this session", "info");
      return;
    }

    setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleDownloadPastReport = (id: string) => {
    if (!viewReport(id)) {
      addToast("This report file is no longer available. Generate it again to export.", "info");
      return;
    }

    addToast("Opening print dialog. Choose Save as PDF to export.", "info");
    setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: "smooth" });
      window.print();
    }, 150);
  };

  return (
    <div
      className="reports-print-page min-h-screen bg-litter-bg pb-24 lg:pb-10"
      data-print-ready={currentReport ? "true" : "false"}
    >
      <TopBar />
      <div className="reports-screen-only">
        <ToastContainer
          toasts={toasts}
          onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </div>

      <main className="reports-print-shell pt-20 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">

        {/* ── Page Header ── */}
        <div className="reports-screen-only flex items-start justify-between pt-4 mb-5">
          <div>
            <h1 className="text-xl font-bold text-litter-text">Litter Box Activity Reports</h1>
            <p className="text-sm text-theme-muted mt-0.5">
              Generate and export behavior reports
            </p>
          </div>
          <button className="p-2 theme-icon-btn">
            <MoreVertical className="w-5 h-5 text-theme-muted" />
          </button>
        </div>

        {/* ── Generate New Report Card ── */}
        <div className="reports-screen-only bg-litter-card rounded-2xl p-5 shadow-sm border border-litter-border mb-6">
          {/* Card title */}
          <div className="flex items-center gap-2 mb-4">
            <PlusCircle className="w-5 h-5 text-litter-text" strokeWidth={2} />
            <h2 className="text-base font-bold text-litter-text">Generate New Report</h2>
          </div>

          {/* Select Pet */}
          <div className="mb-4">
            <label htmlFor="select-cat" className="block text-sm font-medium text-litter-text mb-1.5">
              Select Pet
            </label>
            <div className="relative">
              <select
                id="select-cat"
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                disabled={catsLoading || isGenerating || !hasCats}
                className="w-full px-4 py-3 rounded-xl border border-litter-border bg-litter-card text-litter-text appearance-none focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] text-sm"
              >
                <option value="all">All Cats</option>
                {cats.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted pointer-events-none" />
            </div>
            {!catsLoading && !hasCats && (
              <p className="text-xs text-theme-muted mt-2">
                Add a cat first so reports can use your saved sessions and owner notes.
              </p>
            )}
          </div>

          {/* Date Range */}
          <div className="mb-5">
            <label htmlFor="select-range" className="block text-sm font-medium text-litter-text mb-1.5">
              Date Range
            </label>
            <div className="relative">
              <select
                id="select-range"
                value={selectedRange}
                onChange={(e) => setSelectedRange(e.target.value as DateRangeValue)}
                disabled={isGenerating}
                className="w-full px-4 py-3 rounded-xl border border-litter-border bg-litter-card text-litter-text appearance-none focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] text-sm"
              >
                {dateRanges.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted pointer-events-none" />
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || catsLoading || !hasCats}
            className="w-full py-3.5 rounded-xl bg-litter-primary text-white font-semibold text-sm hover:bg-[#165a4e] active:bg-[#124d42] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating... {progress}%
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                Generate Report
              </>
            )}
          </button>

          {/* Progress bar */}
          {isGenerating && (
            <div className="mt-3 h-1.5 bg-theme-overlay rounded-full overflow-hidden">
              <div
                className="h-full bg-litter-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* ── Generated Report Preview ── */}
        {currentReport && (
          <div ref={reportRef} className="reports-print-area mb-6">
            <h2 className="reports-screen-only text-base font-bold text-litter-text mb-3">Generated Report</h2>
            <ReportPreview report={currentReport} />

            {/* Export Controls */}
            <div className="reports-screen-only bg-litter-card rounded-xl p-4 shadow-sm border border-litter-border mt-3 flex flex-wrap gap-3 justify-center">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-4 py-2.5 bg-litter-primary text-white rounded-lg font-medium text-sm hover:bg-[#165a4e] transition-colors"
              >
                <Download className="w-4 h-4" />
                Export as PDF
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2.5 border border-litter-border text-theme-secondary rounded-lg font-medium text-sm theme-row-hover"
              >
                <Table className="w-4 h-4" />
                Export as CSV
              </button>
            </div>
          </div>
        )}

        {/* ── Previous Reports ── */}
        <div className="reports-screen-only mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-litter-text">Previous Reports</h2>
            {pastReports.length > 3 && (
              <button
                onClick={() => setShowAllReports((prev) => !prev)}
                className="text-sm font-semibold text-litter-primary hover:underline"
              >
                {showAllReports ? "SHOW LESS" : "VIEW ALL"}
              </button>
            )}
          </div>

          {pastReports.length === 0 ? (
            <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-8 text-center">
              <FileSpreadsheet className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-theme-muted">No reports generated yet</p>
              <p className="text-xs text-theme-muted mt-1">Create your first report above.</p>
            </div>
          ) : (
            <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm overflow-hidden">
              {visibleReports.map((report, idx) => (
                <PastReportCard
                  key={report.id}
                  report={report}
                  isLast={idx === visibleReports.length - 1}
                  onDelete={() => setDeleteConfirmId(report.id)}
                  onDownload={() => handleDownloadPastReport(report.id)}
                  onView={() => handleViewPastReport(report.id)}
                />
              ))}
            </div>
          )}
        </div>

      </main>

      <BottomNav />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && handleDeletePastReport(deleteConfirmId)}
        title="Delete Report"
        message="Are you sure you want to delete this report? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}

// ─── Report Preview ───────────────────────────────────────────────────────────

interface ReportPreviewProps {
  readonly report: ReportData;
}

function getReportCatSnapshots(report: ReportData): ReportCatSnapshot[] {
  if (report.cats && report.cats.length > 0) return report.cats;
  if (report.catId === "all") return [];

  return [{
    id: report.catId,
    name: report.catName,
    avatar: null,
    baselineEstablished: false,
  }];
}

function ReportPreview({ report }: ReportPreviewProps) {
  const trendData = report.trendData;
  const reportCats = getReportCatSnapshots(report);
  const sessionGroups = buildReportSessionGroups(report.sessions, reportCats);
  const hasReportData = report.sessions.length > 0;
  const reportState = getMostSevereState(sessionGroups.map((group) => group.state));
  const reportStateDefinition = BEHAVIOR_STATE_BY_ID[reportState];

  return (
    <div className="reports-print-document bg-litter-card rounded-2xl shadow-sm border border-litter-border overflow-hidden">

      {/* Report header */}
      <div className="reports-print-section p-5 border-b border-litter-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-litter-primary flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
              <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8Z" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-litter-primary">LitterSense</p>
            <p className="text-xs text-theme-muted">Litter Box Activity Report</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-theme-muted text-xs">Generated</p>
            <p className="font-medium text-litter-text">{report.generatedOn}</p>
          </div>
          <div>
            <p className="text-theme-muted text-xs">Cat</p>
            <p className="font-medium text-litter-text">{report.catName}</p>
          </div>
          <div>
            <p className="text-theme-muted text-xs">Period</p>
            <p className="font-medium text-litter-text">{report.period}</p>
          </div>
          <div>
            <p className="text-theme-muted text-xs">Owner</p>
            <p className="font-medium text-litter-text">{report.ownerName}</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="reports-print-section p-5 border-b border-litter-border">
        <p className="font-semibold text-litter-text text-sm mb-3">Summary</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-theme-overlay rounded-xl p-3">
            <p className="text-xl font-bold text-litter-text">
              {formatMetricValue(report.summary.totalSessions, hasReportData)}
            </p>
            <p className="text-xs text-theme-muted">Total Sessions</p>
          </div>
          <div className="bg-theme-overlay rounded-xl p-3">
            <p className="text-xl font-bold text-litter-text">
              {formatMetricValue(report.summary.avgSessionsPerDay, hasReportData)}
            </p>
            <p className="text-xs text-theme-muted">Avg/Day</p>
          </div>
          <div className="bg-theme-overlay rounded-xl p-3">
            <p className="text-xl font-bold text-litter-text">
              {formatMetricValue(report.summary.avgDuration, hasReportData)}
            </p>
            <p className="text-xs text-theme-muted">Avg Duration</p>
          </div>
          <div className="bg-theme-overlay rounded-xl p-3">
            <p className="text-xl font-bold text-litter-text">
              {formatMetricValue(report.summary.anomaliesDetected, hasReportData)}
            </p>
            <p className="text-xs text-theme-muted">Anomalies</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-theme-overlay p-3">
          <BehaviorStateBadge state={reportState} />
          <span className="text-sm text-theme-secondary">{reportStateDefinition.description}</span>
        </div>
      </div>

      {/* Session Log */}
      <div className="reports-print-section reports-print-section--table p-5 border-b border-litter-border">
        <p className="font-semibold text-litter-text text-sm mb-3">Session Log</p>
        <BehaviorStateLegend compact className="mb-3" />
        <SessionAccordion key={report.id} sessions={report.sessions} cats={reportCats} />
      </div>

      {/* Trend Charts */}
      {trendData && (
        <div className="reports-print-section p-5 border-b border-litter-border">
          <p className="font-semibold text-litter-text text-sm mb-3">Trends</p>
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-theme-overlay rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-litter-primary" />
                <span className="text-xs font-medium text-theme-secondary">Visit Frequency (7 days)</span>
              </div>
              <MetricTrendChart
                data={getMetricTrendPoints(trendData, "visits")}
                metricName="Visit Frequency"
                yAxisTitle="Visits per day"
                unit="visits"
                color="#1B7A6E"
                hasData={hasReportData}
                reference={report.trendReferences?.visits}
                baselineMessage={report.trendReferences === undefined ? "unavailable" : report.trendReferences === null ? "building" : undefined}
                emptyMessage="No sessions were recorded in this 7-day period."
              />
            </div>
            <div className="bg-theme-overlay rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-litter-primary" />
                <span className="text-xs font-medium text-theme-secondary">Average Duration (7 days)</span>
              </div>
              <MetricTrendChart
                data={getMetricTrendPoints(trendData, "duration")}
                metricName="Average Duration"
                yAxisTitle="Duration (minutes)"
                unit="minutes"
                color="#E8924A"
                hasData={hasReportData}
                reference={report.trendReferences?.duration}
                baselineMessage={report.trendReferences === undefined ? "unavailable" : report.trendReferences === null ? "building" : undefined}
                emptyMessage="No sessions were recorded in this 7-day period."
              />
            </div>
            <div className="bg-theme-overlay rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wind className="w-4 h-4 text-litter-primary" />
                <span className="text-xs font-medium text-theme-secondary">Air quality change (7 days)</span>
              </div>
              <MetricTrendChart
                data={getMetricTrendPoints(trendData, "airQuality")}
                metricName="Air quality change"
                yAxisTitle="Change from baseline (%)"
                unit="%"
                color="#1B7A6E"
                hasData={hasReportData}
                reference={report.trendReferences?.airQuality}
                baselineMessage={report.trendReferences === undefined ? "unavailable" : report.trendReferences === null ? "building" : undefined}
                emptyMessage="No sessions were recorded in this 7-day period."
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Past Report Card ─────────────────────────────────────────────────────────

interface PastReportCardProps {
  readonly report: PastReport;
  readonly isLast: boolean;
  readonly onDelete: () => void;
  readonly onDownload: () => void;
  readonly onView: () => void;
}

function PastReportCard({ report, isLast, onDelete, onDownload, onView }: PastReportCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`w-full flex items-center gap-3 px-4 py-4 theme-row-hover text-left ${
        isLast ? "" : "border-b border-litter-border"
      }`}
      onClick={onView}
      onKeyDown={(e) => e.key === 'Enter' && onView()}
    >
      {/* Teal file icon */}
      <div className="w-10 h-10 rounded-xl bg-litter-primary-light flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-litter-primary" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-litter-text truncate">{report.filename ?? report.catName}</p>
        <p className="text-xs text-theme-muted mt-0.5">
          {report.range} · Generated {formatDate(report.generatedOn)}
        </p>
      </div>

      {/* Download + Delete */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
          className="p-2 theme-icon-btn text-theme-muted hover:text-litter-primary"
          aria-label="Download"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-2 theme-danger-btn text-theme-muted"
          aria-label="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
