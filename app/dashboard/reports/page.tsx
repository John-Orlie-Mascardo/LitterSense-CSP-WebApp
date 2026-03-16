"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
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
  Clock,
  CheckCircle,
  Wind,
  Timer,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { SparklineChart } from "@/components/ui/SparklineChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastContainer, type ToastProps } from "@/components/ui/Toast";
import { mockCats, getTrendData, type PastReport } from "@/lib/mockData";
import { useReports } from "@/lib/useReports";
import {
  formatDuration,
  formatDate,
  getStatusColor,
  generateId,
  getHealthLogTypeColor,
} from "@/lib/formatters";

const dateRanges = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export default function ReportsPage() {
  const {
    isGenerating,
    progress,
    currentReport,
    pastReports,
    generateReport,
    deleteReport,
    setCurrentReport,
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

    // Scroll to report
    setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleExportPDF = () => {
    if (!currentReport) return;
    addToast(`Report saved as ${currentReport.catName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`, "success");
  };

  const handleExportCSV = () => {
    if (!currentReport) return;

    // Generate CSV content
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
    a.download = `LitterSense_${currentReport.catName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    addToast("CSV exported successfully", "success");
  };

  const handleShare = async () => {
    if (!currentReport) return;

    const shareData = {
      title: `LitterSense Health Report - ${currentReport.catName}`,
      text: `Health report for ${currentReport.catName} (${currentReport.period})`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      addToast("Link copied to clipboard", "success");
    }
  };

  const handleDeletePastReport = (id: string) => {
    deleteReport(id);
    setDeleteConfirmId(null);
    addToast("Report deleted", "info");
  };

  return (
    <div className="min-h-screen bg-[#FDFAF6] pb-24">
      <TopBar />
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1C1C1C] mb-1">
            Health Reports
          </h1>
          <p className="text-[#6B7280] text-sm sm:text-base">
            Generate and share reports with your vet
          </p>
        </motion.section>

        {/* Generate Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-[#1E6B5E] rounded-2xl p-5 sm:p-6 text-white mb-6"
        >
          <h2 className="font-display text-xl font-semibold mb-4">Generate New Report</h2>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {/* Cat Selector */}
            <div>
              <label className="block text-sm text-white/80 mb-1.5">Select Cat</label>
              <div className="relative">
                <select
                  value={selectedCat}
                  onChange={(e) => setSelectedCat(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  <option value="all" className="text-[#1C1C1C]">All Cats</option>
                  {mockCats.map((cat) => (
                    <option key={cat.id} value={cat.id} className="text-[#1C1C1C]">
                      {cat.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60 pointer-events-none" />
              </div>
            </div>

            {/* Date Range Selector */}
            <div>
              <label className="block text-sm text-white/80 mb-1.5">Date Range</label>
              <div className="relative">
                <select
                  value={selectedRange}
                  onChange={(e) => setSelectedRange(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  {dateRanges.map((range) => (
                    <option key={range.value} value={range.value} className="text-[#1C1C1C]">
                      {range.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full sm:w-auto px-6 py-3 bg-[#E8924A] text-white rounded-xl font-medium hover:bg-[#d4803d] active:bg-[#c07235] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            <div className="mt-4 h-1 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}
        </motion.section>

        {/* Generated Report Preview */}
        {currentReport && (
          <motion.section
            ref={reportRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h2 className="font-display text-xl font-semibold text-[#1C1C1C] mb-4">
              Generated Report
            </h2>
            <ReportPreview report={currentReport} />

            {/* Export Controls */}
            <div className="sticky bottom-20 bg-white rounded-xl p-4 shadow-lg border border-[#E8E2D9] flex flex-wrap gap-3 justify-center">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1E6B5E] text-white rounded-lg font-medium hover:bg-[#165a4e] transition-colors"
              >
                <Download className="w-5 h-5" />
                Export as PDF
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                <Table className="w-5 h-5" />
                Export as CSV
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                <Share2 className="w-5 h-5" />
                Share with Vet
              </button>
            </div>
          </motion.section>
        )}

        {/* Past Reports List */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h2 className="font-display text-xl font-semibold text-[#1C1C1C] mb-4">
            Previous Reports
          </h2>

          {pastReports.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No reports generated yet"
              description="Create your first report above."
            />
          ) : (
            <div className="space-y-3">
              {pastReports.map((report) => (
                <PastReportCard
                  key={report.id}
                  report={report}
                  onDelete={() => setDeleteConfirmId(report.id)}
                  onDownload={() => addToast(`Downloading ${report.filename}...`, "info")}
                  onView={() => addToast("Report preview coming soon", "info")}
                />
              ))}
            </div>
          )}
        </motion.section>
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

// Report Preview Component
interface ReportPreviewProps {
  report: {
    catId: string;
    catName: string;
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
    sessions: Array<{
      id: string;
      date: string;
      time: string;
      durationSecs: number;
      mq135Delta: number;
      mq136Delta: number;
      anomaly: boolean;
    }>;
    healthLogs: Array<{
      id: string;
      date: string;
      type: string;
      note: string;
    }>;
  };
}

function ReportPreview({ report }: ReportPreviewProps) {
  const statusColors = getStatusColor(report.summary.overallStatus);
  const trendData = getTrendData(report.catId === "all" ? "1" : report.catId);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#E8E2D9] overflow-hidden">
      {/* Report Header */}
      <div className="p-6 border-b border-[#E8E2D9]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#1E6B5E] flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
              <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8Z" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-[#1E6B5E]">LitterSense</h3>
            <p className="text-sm text-gray-500">Health Report</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Generated</p>
            <p className="font-medium text-[#1C1C1C]">{report.generatedOn}</p>
          </div>
          <div>
            <p className="text-gray-500">Cat</p>
            <p className="font-medium text-[#1C1C1C]">{report.catName}</p>
          </div>
          <div>
            <p className="text-gray-500">Period</p>
            <p className="font-medium text-[#1C1C1C]">{report.period}</p>
          </div>
          <div>
            <p className="text-gray-500">Owner</p>
            <p className="font-medium text-[#1C1C1C]">{report.ownerName}</p>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div className="p-6 border-b border-[#E8E2D9]">
        <h4 className="font-semibold text-[#1C1C1C] mb-4">Summary</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#FDFAF6] rounded-xl p-3">
            <p className="text-2xl font-bold text-[#1C1C1C]">{report.summary.totalSessions}</p>
            <p className="text-sm text-gray-500">Total Sessions</p>
          </div>
          <div className="bg-[#FDFAF6] rounded-xl p-3">
            <p className="text-2xl font-bold text-[#1C1C1C]">{report.summary.avgSessionsPerDay}</p>
            <p className="text-sm text-gray-500">Avg/Day</p>
          </div>
          <div className="bg-[#FDFAF6] rounded-xl p-3">
            <p className="text-2xl font-bold text-[#1C1C1C]">{report.summary.avgDuration}</p>
            <p className="text-sm text-gray-500">Avg Duration</p>
          </div>
          <div className="bg-[#FDFAF6] rounded-xl p-3">
            <p className="text-2xl font-bold text-[#1C1C1C]">{report.summary.anomaliesDetected}</p>
            <p className="text-sm text-gray-500">Anomalies</p>
          </div>
        </div>

        <div className={`mt-4 p-3 rounded-xl ${statusColors.bg} ${statusColors.text}`}>
          <div className="flex items-center gap-2">
            {report.summary.overallStatus === "healthy" ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
            <span className="font-medium">{report.summary.statusMessage}</span>
          </div>
        </div>
      </div>

      {/* Session Log Table */}
      <div className="p-6 border-b border-[#E8E2D9]">
        <h4 className="font-semibold text-[#1C1C1C] mb-4">Session Log</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-[#E8E2D9]">
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
                <tr
                  key={session.id}
                  className={session.anomaly ? "bg-amber-50" : ""}
                >
                  <td className="py-2">{session.date}</td>
                  <td className="py-2">{session.time}</td>
                  <td className="py-2">{formatDuration(session.durationSecs)}</td>
                  <td className="py-2">{session.mq135Delta}%</td>
                  <td className="py-2">{session.mq136Delta}%</td>
                  <td className="py-2">
                    {session.anomaly && (
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full">
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
          <p className="text-sm text-gray-500 mt-3">
            Full log included in export ({report.sessions.length - 10} more entries)
          </p>
        )}
      </div>

      {/* Trend Charts */}
      {trendData && (
        <div className="p-6 border-b border-[#E8E2D9]">
          <h4 className="font-semibold text-[#1C1C1C] mb-4">Trends</h4>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-[#FDFAF6] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-[#1E6B5E]" />
                <span className="text-sm font-medium text-gray-700">Visit Frequency</span>
              </div>
              <SparklineChart
                data={trendData.map((d) => ({ value: d.visits, label: d.day }))}
                height={60}
                showArea={false}
              />
            </div>
            <div className="bg-[#FDFAF6] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-[#1E6B5E]" />
                <span className="text-sm font-medium text-gray-700">Avg Duration</span>
              </div>
              <SparklineChart
                data={trendData.map((d) => ({ value: d.avgDuration, label: d.day }))}
                color="#E8924A"
                height={60}
                showArea={false}
              />
            </div>
            <div className="bg-[#FDFAF6] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wind className="w-4 h-4 text-[#1E6B5E]" />
                <span className="text-sm font-medium text-gray-700">Gas Quality</span>
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
      <div className="p-6 border-b border-[#E8E2D9]">
        <h4 className="font-semibold text-[#1C1C1C] mb-4">Vet Notes</h4>
        {report.healthLogs.length === 0 ? (
          <p className="text-gray-500 text-sm">No vet notes for this period</p>
        ) : (
          <div className="space-y-3">
            {report.healthLogs.map((log) => {
              const typeColors = getHealthLogTypeColor(log.type);
              return (
                <div key={log.id} className="bg-[#FDFAF6] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors.bg} ${typeColors.text}`}>
                      {log.type}
                    </span>
                    <span className="text-sm text-gray-500">{formatDate(log.date)}</span>
                  </div>
                  <p className="text-sm text-[#1C1C1C]">{log.note}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recommendations */}
      <div className="p-6">
        <h4 className="font-semibold text-[#1C1C1C] mb-3">Recommendations</h4>
        <p className="text-sm text-gray-600">
          {report.summary.anomaliesDetected === 0
            ? "No behavioral anomalies detected during this period. Continue regular monitoring."
            : `${report.summary.anomaliesDetected} anomalous sessions detected. Increased visit frequency and extended duration may indicate early signs of FLUTD or urinary discomfort. Veterinary consultation is recommended.`}
        </p>
      </div>
    </div>
  );
}

// Past Report Card
interface PastReportCardProps {
  report: PastReport;
  onDelete: () => void;
  onDownload: () => void;
  onView: () => void;
}

function PastReportCard({ report, onDelete, onDownload, onView }: PastReportCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 border border-[#E8E2D9] shadow-sm flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-[#1C1C1C] truncate">{report.catName}</h4>
        <p className="text-sm text-gray-500">{report.range}</p>
        <p className="text-xs text-gray-400">Generated {formatDate(report.generatedOn)}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onDownload}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Download"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-500 transition-colors"
          aria-label="Delete"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
