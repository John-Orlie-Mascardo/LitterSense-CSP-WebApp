"use client";

import { useState, useRef } from "react";
import {
  FileText,
  Download,
  Table,
  Share2,
  Trash2,
  ChevronDown,
  Loader2,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  Wind,
  Timer,
  Clock,
  PlusCircle,
  Lightbulb,
  MoreVertical,
  ArrowLeft,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastContainer, type ToastProps } from "@/components/ui/Toast";
import { mockCats, getTrendData, type PastReport } from "@/lib/data/mockData";
import { useReports } from "@/lib/hooks/useReports";
import {
  formatDuration,
  formatDate,
  getStatusColor,
  generateId,
  getHealthLogTypeColor,
} from "@/lib/utils/formatters";

const dateRanges = [
  { value: "7", label: "Last 7 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "Last 90 Days" },
];

export default function ReportsPage() {
  const router = useRouter();
  const {
    isGenerating,
    progress,
    currentReport,
    pastReports,
    generateReport,
    deleteReport,
  } = useReports();

  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [selectedRange, setSelectedRange] = useState<string>("7");
  const [toasts, setToasts] = useState<Omit<ToastProps, "onClose">[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const addToast = (message: string, type: ToastProps["type"] = "info") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const handleGenerate = async () => {
    await generateReport({
      catId: selectedCat,
      dateRange: selectedRange as "7" | "30" | "90" | "custom",
    });
    setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleExportPDF = () => {
    if (!currentReport) return;
    addToast(
      `Report saved as ${currentReport.catName.replaceAll(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`,
      "success"
    );
  };

  const handleExportCSV = () => {
    if (!currentReport) return;
    const headers = "Date,Time,Duration,MQ-135 Delta,MQ-136 Delta,Anomaly\n";
    const rows = currentReport.sessions
      .map(
        (s) =>
          `${s.date},${s.time},${s.durationSecs},${s.mq135Delta},${s.mq136Delta},${s.anomaly ? "Yes" : "No"}`
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

  const handleShare = async () => {
    if (!currentReport) return;
    const shareData = {
      title: `LitterSense Health Report - ${currentReport.catName}`,
      text: `Health report for ${currentReport.catName} (${currentReport.period})`,
      url: globalThis.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {}
    } else {
      navigator.clipboard.writeText(globalThis.location.href);
      addToast("Link copied to clipboard", "success");
    }
  };

  const handleDeletePastReport = (id: string) => {
    deleteReport(id);
    setDeleteConfirmId(null);
    addToast("Report deleted", "info");
  };

  return (
    <div className="min-h-screen bg-[#F2F2F2] pb-24">
      <TopBar />
      <ToastContainer
        toasts={toasts}
        onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <main className="pt-20 px-4 max-w-lg mx-auto">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between pt-4 mb-5">
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.back()}
              className="mt-0.5 w-9 h-9 rounded-full bg-[#D4EDE8] flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="w-4 h-4 text-[#1E6B5E]" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-[#1C1C1C]">Health Reports</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Generate and share reports with your vet
              </p>
            </div>
          </div>
          <button className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
            <MoreVertical className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* ── Generate New Report Card ── */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E2D9] mb-6">
          {/* Card title */}
          <div className="flex items-center gap-2 mb-4">
            <PlusCircle className="w-5 h-5 text-[#1C1C1C]" strokeWidth={2} />
            <h2 className="text-base font-bold text-[#1C1C1C]">Generate New Report</h2>
          </div>

          {/* Select Pet */}
          <div className="mb-4">
            <label htmlFor="select-cat" className="block text-sm font-medium text-[#1C1C1C] mb-1.5">
              Select Pet
            </label>
            <div className="relative">
              <select
                id="select-cat"
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#E8E2D9] bg-white text-[#1C1C1C] appearance-none focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] text-sm"
              >
                <option value="all">All Cats</option>
                {mockCats.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Date Range */}
          <div className="mb-5">
            <label htmlFor="select-range" className="block text-sm font-medium text-[#1C1C1C] mb-1.5">
              Date Range
            </label>
            <div className="relative">
              <select
                id="select-range"
                value={selectedRange}
                onChange={(e) => setSelectedRange(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#E8E2D9] bg-white text-[#1C1C1C] appearance-none focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] text-sm"
              >
                {dateRanges.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-3.5 rounded-xl bg-[#1E6B5E] text-white font-semibold text-sm hover:bg-[#165a4e] active:bg-[#124d42] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1E6B5E] rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* ── Generated Report Preview ── */}
        {currentReport && (
          <div ref={reportRef} className="mb-6">
            <h2 className="text-base font-bold text-[#1C1C1C] mb-3">Generated Report</h2>
            <ReportPreview report={currentReport} />

            {/* Export Controls */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E2D9] mt-3 flex flex-wrap gap-3 justify-center">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1E6B5E] text-white rounded-lg font-medium text-sm hover:bg-[#165a4e] transition-colors"
              >
                <Download className="w-4 h-4" />
                Export as PDF
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
              >
                <Table className="w-4 h-4" />
                Export as CSV
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Share with Vet
              </button>
            </div>
          </div>
        )}

        {/* ── Previous Reports ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#1C1C1C]">Previous Reports</h2>
            <button className="text-sm font-semibold text-[#1E6B5E] hover:underline">
              VIEW ALL
            </button>
          </div>

          {pastReports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8E2D9] shadow-sm p-8 text-center">
              <FileSpreadsheet className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No reports generated yet</p>
              <p className="text-xs text-gray-400 mt-1">Create your first report above.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E8E2D9] shadow-sm overflow-hidden">
              {pastReports.map((report, idx) => (
                <PastReportCard
                  key={report.id}
                  report={report}
                  isLast={idx === pastReports.length - 1}
                  onDelete={() => setDeleteConfirmId(report.id)}
                  onDownload={() => addToast(`Downloading ${report.filename}...`, "info")}
                  onView={() => addToast("Report preview coming soon", "info")}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Pro Tip Banner ── */}
        <div className="bg-[#EAF7F5] border border-[#C6EBE4] rounded-2xl px-4 py-4 mb-6 flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-[#1E6B5E] shrink-0 mt-0.5" />
          <p className="text-sm text-[#1C1C1C] leading-relaxed">
            <span className="font-semibold">Pro Tip:</span> You can directly email these reports to
            your veterinarian by tapping the share icon after downloading.
          </p>
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
  readonly report: {
    readonly catId: string;
    readonly catName: string;
    readonly period: string;
    readonly generatedOn: string;
    readonly ownerName: string;
    readonly summary: {
      readonly totalSessions: number;
      readonly avgSessionsPerDay: number;
      readonly avgDuration: string;
      readonly anomaliesDetected: number;
      readonly overallStatus: "healthy" | "watch" | "alert";
      readonly statusMessage: string;
    };
    readonly sessions: ReadonlyArray<{
      readonly id: string;
      readonly date: string;
      readonly time: string;
      readonly durationSecs: number;
      readonly mq135Delta: number;
      readonly mq136Delta: number;
      readonly anomaly: boolean;
    }>;
    readonly healthLogs: ReadonlyArray<{
      readonly id: string;
      readonly date: string;
      readonly type: string;
      readonly note: string;
    }>;
  };
}

function ReportPreview({ report }: ReportPreviewProps) {
  const statusColors = getStatusColor(report.summary.overallStatus);
  const trendData = getTrendData(report.catId === "all" ? "1" : report.catId);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#E8E2D9] overflow-hidden">

      {/* Report header */}
      <div className="p-5 border-b border-[#E8E2D9]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#1E6B5E] flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
              <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8Z" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-[#1E6B5E]">LitterSense</p>
            <p className="text-xs text-gray-500">Health Report</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-400 text-xs">Generated</p>
            <p className="font-medium text-[#1C1C1C]">{report.generatedOn}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Cat</p>
            <p className="font-medium text-[#1C1C1C]">{report.catName}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Period</p>
            <p className="font-medium text-[#1C1C1C]">{report.period}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Owner</p>
            <p className="font-medium text-[#1C1C1C]">{report.ownerName}</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="p-5 border-b border-[#E8E2D9]">
        <p className="font-semibold text-[#1C1C1C] text-sm mb-3">Summary</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-[#F5F5F5] rounded-xl p-3">
            <p className="text-xl font-bold text-[#1C1C1C]">{report.summary.totalSessions}</p>
            <p className="text-xs text-gray-500">Total Sessions</p>
          </div>
          <div className="bg-[#F5F5F5] rounded-xl p-3">
            <p className="text-xl font-bold text-[#1C1C1C]">{report.summary.avgSessionsPerDay}</p>
            <p className="text-xs text-gray-500">Avg/Day</p>
          </div>
          <div className="bg-[#F5F5F5] rounded-xl p-3">
            <p className="text-xl font-bold text-[#1C1C1C]">{report.summary.avgDuration}</p>
            <p className="text-xs text-gray-500">Avg Duration</p>
          </div>
          <div className="bg-[#F5F5F5] rounded-xl p-3">
            <p className="text-xl font-bold text-[#1C1C1C]">{report.summary.anomaliesDetected}</p>
            <p className="text-xs text-gray-500">Anomalies</p>
          </div>
        </div>
        <div className={`p-3 rounded-xl ${statusColors.bg} ${statusColors.text} flex items-center gap-2`}>
          {report.summary.overallStatus === "healthy" ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span className="text-sm font-medium">{report.summary.statusMessage}</span>
        </div>
      </div>

      {/* Session Log */}
      <div className="p-5 border-b border-[#E8E2D9]">
        <p className="font-semibold text-[#1C1C1C] text-sm mb-3">Session Log</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-[#E8E2D9]">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Time</th>
                <th className="pb-2 font-medium">Duration</th>
                <th className="pb-2 font-medium">MQ-135 Δ</th>
                <th className="pb-2 font-medium">MQ-136 Δ</th>
                <th className="pb-2 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.slice(0, 10).map((session) => (
                <tr key={session.id} className={session.anomaly ? "bg-amber-50" : ""}>
                  <td className="py-1.5 text-[#1C1C1C]">{session.date}</td>
                  <td className="py-1.5 text-[#1C1C1C]">{session.time}</td>
                  <td className="py-1.5 text-[#1C1C1C]">{formatDuration(session.durationSecs)}</td>
                  <td className="py-1.5 text-[#1C1C1C]">{session.mq135Delta}%</td>
                  <td className="py-1.5 text-[#1C1C1C]">{session.mq136Delta}%</td>
                  <td className="py-1.5">
                    {session.anomaly && (
                      <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full">
                        Flagged
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.sessions.length > 10 && (
          <p className="text-xs text-gray-400 mt-2">
            Full log included in export ({report.sessions.length - 10} more entries)
          </p>
        )}
      </div>

      {/* Trend Charts */}
      {trendData && (
        <div className="p-5 border-b border-[#E8E2D9]">
          <p className="font-semibold text-[#1C1C1C] text-sm mb-3">Trends</p>
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-[#F5F5F5] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-[#1E6B5E]" />
                <span className="text-xs font-medium text-gray-600">Visit Frequency</span>
              </div>
              <SparklineChart
                data={trendData.map((d) => ({ value: d.visits, label: d.day }))}
                height={60}
                showArea={false}
              />
            </div>
            <div className="bg-[#F5F5F5] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-[#1E6B5E]" />
                <span className="text-xs font-medium text-gray-600">Avg Duration</span>
              </div>
              <SparklineChart
                data={trendData.map((d) => ({ value: d.avgDuration, label: d.day }))}
                color="#E8924A"
                height={60}
                showArea={false}
              />
            </div>
            <div className="bg-[#F5F5F5] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wind className="w-4 h-4 text-[#1E6B5E]" />
                <span className="text-xs font-medium text-gray-600">Gas Quality</span>
              </div>
              <SparklineChart
                data={trendData.map((d) => ({ value: d.mq135Delta, label: d.day }))}
                height={60}
                showArea={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Vet Notes */}
      <div className="p-5 border-b border-[#E8E2D9]">
        <p className="font-semibold text-[#1C1C1C] text-sm mb-3">Vet Notes</p>
        {report.healthLogs.length === 0 ? (
          <p className="text-sm text-gray-400">No vet notes for this period</p>
        ) : (
          <div className="space-y-2">
            {report.healthLogs.map((log) => {
              const typeColors = getHealthLogTypeColor(log.type);
              return (
                <div key={log.id} className="bg-[#F5F5F5] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors.bg} ${typeColors.text}`}>
                      {log.type}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(log.date)}</span>
                  </div>
                  <p className="text-sm text-[#1C1C1C]">{log.note}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recommendations */}
      <div className="p-5">
        <p className="font-semibold text-[#1C1C1C] text-sm mb-2">Recommendations</p>
        <p className="text-sm text-gray-500 leading-relaxed">
          {report.summary.anomaliesDetected === 0
            ? "No behavioral anomalies detected during this period. Continue regular monitoring."
            : `${report.summary.anomaliesDetected} anomalous sessions detected. Increased visit frequency and extended duration may indicate early signs of FLUTD or urinary discomfort. Veterinary consultation is recommended.`}
        </p>
      </div>
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
    <button
      className={`w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors text-left ${
        isLast ? "" : "border-b border-[#E8E2D9]"
      }`}
      onClick={onView}
    >
      {/* Teal file icon */}
      <div className="w-10 h-10 rounded-xl bg-[#D4EDE8] flex items-center justify-center shrink-0 pointer-events-none">
        <FileText className="w-5 h-5 text-[#1E6B5E]" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1C1C1C] truncate">{report.filename ?? report.catName}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {report.range} · Generated {formatDate(report.generatedOn)}
        </p>
      </div>

      {/* Download + Delete */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#1E6B5E] transition-colors"
          aria-label="Download"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          aria-label="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </button>
  );
}