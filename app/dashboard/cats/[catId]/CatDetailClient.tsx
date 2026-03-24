"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Clock,
  Timer,
  Wind,
  Droplets,
  Info,
  Plus,
  Trash2,
  FileText,
  Filter,
  AlertTriangle,
  Tag,
  Lightbulb,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { TabBar } from "@/components/ui/TabBar";
import { StatCard } from "@/components/dashboard/StatCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastContainer, type ToastProps } from "@/components/ui/Toast";
import {
  getCatById,
  getCatDetailsById,
  getSessionsByCatId,
  getHealthLogsByCatId,
  getTrendData,
  mockStats,
  deviceStats,
  type Session,
  type HealthLog,
} from "@/lib/data/mockData";
import {
  getStatusColor,
  getStatusLabel,
  calculateAge,
  formatDuration,
  formatDate,
  getDeltaLabel,
  getHealthLogTypeColor,
  generateId,
} from "@/lib/utils/formatters";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History" },
  { id: "trends", label: "Trends" },
  { id: "health", label: "Health Log" },
];

export default function CatDetailClient() {
  const params = useParams();
  const router = useRouter();
  const catId = params.catId as string;

  const cat = getCatById(catId);
  const details = getCatDetailsById(catId);
  const stats = mockStats[catId];
  const trendData = getTrendData(catId);

  const [activeTab, setActiveTab] = useState("overview");
  const [toasts, setToasts] = useState<Omit<ToastProps, "onClose">[]>([]);

  const addToast = (message: string, type: ToastProps["type"] = "info") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  if (!cat || !details) {
    return (
      <div className="min-h-screen bg-litter-card flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-litter-text mb-2">
            Cat not found
          </h1>
          <button
            onClick={() => router.push("/dashboard/cats")}
            className="text-litter-primary hover:underline"
          >
            Back to My Cats
          </button>
        </div>
      </div>
    );
  }

  const statusColors = getStatusColor(cat.status);
  const statusLabel = getStatusLabel(cat.status);

  return (
    <div className="min-h-screen bg-litter-card pb-24">
      <TopBar />
      <ToastContainer
        toasts={toasts}
        onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.push("/dashboard/cats")}
          className="flex items-center gap-2 text-theme-muted hover:text-litter-primary mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back to My Cats</span>
        </button>

        {/* Profile Header */}
        <section className="relative bg-litter-card rounded-2xl p-6 shadow-sm border border-litter-border mb-6">
          {/* Edit button */}
          <button className="absolute top-4 right-4 p-2 rounded-lg hover:bg-theme-overlay transition-colors">
            <Pencil className="w-5 h-5 text-theme-muted" />
          </button>

          <div className="flex flex-col items-center text-center">
            {/* Avatar with online indicator */}
            <div className="relative w-24 h-24 mb-4">
              <div className="w-full h-full rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-3xl overflow-hidden">
                {cat.avatar ? (
                  <img
                    src={cat.avatar}
                    alt={cat.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  cat.name.charAt(0).toUpperCase()
                )}
              </div>
              {cat.isOnline && (
                <span className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
              )}
            </div>

            {/* Name */}
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-litter-text mb-2">
              {cat.name}
            </h1>

            {/* Details row */}
            <p className="text-theme-muted mb-3">
              {details.breed} · {calculateAge(details.dob)} · {details.weightKg}
              kg
            </p>

            {/* RFID chip */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#E8F5F1] text-[#1B7A6E] text-xs font-mono font-medium mb-3">
              <Tag className="w-3 h-3" />
              RFID: {details.rfidTag}
            </span>

            {/* Status badge */}
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors.bg} ${statusColors.text}`}
            >
              {statusLabel}
            </span>
          </div>
        </section>

        {/* Tabs */}
        <div className="bg-litter-card rounded-2xl shadow-sm border border-litter-border overflow-hidden mb-6">
          <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          <div className="p-4 sm:p-6">
            <div>
              {activeTab === "overview" && (
                <OverviewTab
                  key="overview"
                  catId={catId}
                  stats={stats}
                  details={details}
                />
              )}
              {activeTab === "history" && (
                <HistoryTab key="history" catId={catId} />
              )}
              {activeTab === "trends" && (
                <TrendsTab
                  key="trends"
                  catId={catId}
                  trendData={trendData}
                  details={details}
                />
              )}
              {activeTab === "health" && (
                <HealthLogTab key="health" catId={catId} addToast={addToast} />
              )}
            </div>
          </div>
        </div>
        {/* Generate Report CTA */}
        <div className="mb-6">
          <button
            onClick={() => router.push(`/dashboard/reports?catId=${catId}`)}
            className="w-full flex items-center justify-center gap-2 bg-[#1B7A6E] hover:bg-[#156056] text-white font-semibold py-4 rounded-2xl transition-colors"
          >
            <FileText className="w-5 h-5" />
            Generate Report for {cat.name}
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

// Overview Tab
interface OverviewTabProps {
  catId: string;
  stats:
    | {
        visits: number;
        avgDuration: string;
      }
    | undefined;
  details: {
    healthInsight: string;
    baseline: {
      avgVisitsPerDay: number;
      avgDurationSecs: number;
      mq135DeltaPercent: number;
      mq136DeltaPercent: number;
      lastUpdated: string;
    };
  };
}

function OverviewTab({ stats, details }: OverviewTabProps) {
  const sessions = getSessionsByCatId("1"); // Mock recent anomalies
  const recentAnomalies = sessions.filter((s) => s.anomaly).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Health Insight */}
      {details.healthInsight && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex gap-3">
          <Lightbulb className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-700 mb-1">Health Insight</p>
            <p className="text-sm text-blue-600">{details.healthInsight}</p>
          </div>
        </div>
      )}

      {/* Today's Summary */}
      <div>
        <h3 className="font-semibold text-litter-text mb-3">
          Today&apos;s Summary
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={Clock}
            value={stats?.visits || 0}
            label="Visits Today"
            status="normal"
          />
          <StatCard
            icon={Timer}
            value={stats?.avgDuration || "--"}
            label="Avg Duration"
            status="normal"
          />
          <StatCard
            icon={Wind}
            value={deviceStats.airQuality}
            label="Air Quality"
            status={
              deviceStats.airQuality === "Normal"
                ? "healthy"
                : deviceStats.airQuality === "Elevated"
                  ? "watch"
                  : "alert"
            }
          />
          <StatCard
            icon={Droplets}
            value={`${deviceStats.litterLevel}%`}
            label="Litter Level"
            status={
              deviceStats.litterLevel >= 80
                ? "alert"
                : deviceStats.litterLevel >= 60
                  ? "watch"
                  : "healthy"
            }
          />
        </div>
      </div>

      {/* Baseline Profile */}
      <div className="bg-theme-overlay rounded-xl p-4 border border-litter-border">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-semibold text-litter-text">Baseline Profile</h3>
          <div className="group relative">
            <Info className="w-4 h-4 text-theme-muted cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Baseline is recalculated every 7 days using a rolling average of
              recorded sessions.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-litter-card rounded-lg p-3">
            <p className="text-theme-muted">Normal visits/day</p>
            <p className="font-semibold text-litter-text">
              {details.baseline.avgVisitsPerDay - 1}–
              {details.baseline.avgVisitsPerDay + 1}
            </p>
          </div>
          <div className="bg-litter-card rounded-lg p-3">
            <p className="text-theme-muted">Normal duration</p>
            <p className="font-semibold text-litter-text">
              {formatDuration(details.baseline.avgDurationSecs - 30)} –{" "}
              {formatDuration(details.baseline.avgDurationSecs + 30)}
            </p>
          </div>
          <div className="bg-litter-card rounded-lg p-3">
            <p className="text-theme-muted">Normal MQ-135 Δ</p>
            <p className="font-semibold text-litter-text">
              &lt; {details.baseline.mq135DeltaPercent + 7}%
            </p>
          </div>
          <div className="bg-litter-card rounded-lg p-3">
            <p className="text-theme-muted">Normal MQ-136 Δ</p>
            <p className="font-semibold text-litter-text">
              &lt; {details.baseline.mq136DeltaPercent + 5}%
            </p>
          </div>
        </div>

        <p className="text-xs text-theme-muted mt-3">
          Last updated {formatDate(details.baseline.lastUpdated)}
        </p>
      </div>

      {/* Recent Anomalies */}
      <div>
        <h3 className="font-semibold text-litter-text mb-3">Recent Anomalies</h3>
        {recentAnomalies.length === 0 ? (
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-green-700">No anomalies detected this week 🎉</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentAnomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className="flex items-center justify-between bg-amber-50 rounded-xl p-3 border border-amber-100"
              >
                <div>
                  <p className="font-medium text-amber-800">
                    {anomaly.anomalyType}
                  </p>
                  <p className="text-sm text-amber-600">
                    {formatDate(anomaly.date)} at {anomaly.time}
                  </p>
                </div>
                <span className="px-2 py-1 bg-amber-200 text-amber-800 text-xs rounded-full font-medium">
                  Watch
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// History Tab
interface HistoryTabProps {
  catId: string;
}

function HistoryTab({ catId }: HistoryTabProps) {
  const [filter, setFilter] = useState<"all" | "anomalies">("all");
  const sessions = getSessionsByCatId(catId);
  const filteredSessions =
    filter === "anomalies" ? sessions.filter((s) => s.anomaly) : sessions;

  return (
    <div>
      {/* Filter bar */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-litter-primary text-white"
              : "bg-theme-overlay text-theme-secondary hover:bg-gray-200"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("anomalies")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === "anomalies"
              ? "bg-litter-primary text-white"
              : "bg-theme-overlay text-theme-secondary hover:bg-gray-200"
          }`}
        >
          Anomalies Only
        </button>
      </div>

      {filteredSessions.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No sessions found"
          description="No sessions match your current filter."
        />
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({ session }: { session: Session }) {
  const deltaLabel = getDeltaLabel(session.mq135Delta);

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-xl border ${
        session.anomaly
          ? "bg-amber-50 border-amber-200"
          : "bg-litter-card border-litter-border"
      }`}
    >
      <div>
        <p className="font-medium text-litter-text">{formatDate(session.date)}</p>
        <p className="text-sm text-theme-muted">{session.time}</p>
      </div>
      <div className="text-center">
        <p className="font-medium text-litter-text">
          {formatDuration(session.durationSecs)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${deltaLabel.color}`} />
          <span className="text-sm text-theme-secondary">{session.mq135Delta}%</span>
        </div>
        {session.anomaly && (
          <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full">
            Flagged
          </span>
        )}
      </div>
    </div>
  );
}

// Trends Tab
interface TrendsTabProps {
  catId: string;
  trendData: Array<{
    day: string;
    visits: number;
    avgDuration: number;
    mq135Delta: number;
  }> | null;
  details: {
    baseline: {
      avgVisitsPerDay: number;
      avgDurationSecs: number;
      mq135DeltaPercent: number;
    };
  };
}

function TrendsTab({ trendData, details }: TrendsTabProps) {
  if (!trendData) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No trend data"
        description="Not enough data to show trends."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Visit Frequency */}
      <div className="bg-theme-overlay rounded-xl p-4 border border-litter-border">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5 text-litter-primary" />
          <h4 className="font-semibold text-litter-text">
            Visit Frequency (7 days)
          </h4>
        </div>
        <SparklineChart
          data={trendData.map((d) => ({ value: d.visits, label: d.day }))}
          baseline={details.baseline.avgVisitsPerDay}
          color="#1B7A6E"
        />
      </div>

      {/* Average Duration */}
      <div className="bg-theme-overlay rounded-xl p-4 border border-litter-border">
        <div className="flex items-center gap-2 mb-3">
          <Timer className="w-5 h-5 text-litter-primary" />
          <h4 className="font-semibold text-litter-text">
            Average Duration (7 days)
          </h4>
        </div>
        <SparklineChart
          data={trendData.map((d) => ({ value: d.avgDuration, label: d.day }))}
          baseline={details.baseline.avgDurationSecs}
          color="#E8924A"
        />
      </div>

      {/* Gas Quality */}
      <div className="bg-theme-overlay rounded-xl p-4 border border-litter-border">
        <div className="flex items-center gap-2 mb-3">
          <Wind className="w-5 h-5 text-litter-primary" />
          <h4 className="font-semibold text-litter-text">
            MQ-135 Delta (7 days)
          </h4>
        </div>
        <SparklineChart
          data={trendData.map((d) => ({ value: d.mq135Delta, label: d.day }))}
          baseline={details.baseline.mq135DeltaPercent}
          color="#1B7A6E"
        />
      </div>

      {/* Link to Reports */}
      <a
        href="/dashboard/reports"
        className="block text-center text-litter-primary font-medium hover:underline"
      >
        View full report →
      </a>
    </div>
  );
}

// Health Log Tab
interface HealthLogTabProps {
  catId: string;
  addToast: (message: string, type: ToastProps["type"]) => void;
}

function HealthLogTab({ catId, addToast }: HealthLogTabProps) {
  const [logs, setLogs] = useState<HealthLog[]>(getHealthLogsByCatId(catId));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newLog, setNewLog] = useState({
    type: "Observation" as HealthLog["type"],
    note: "",
  });

  const handleSave = () => {
    if (!newLog.note.trim()) return;

    const log: HealthLog = {
      id: generateId(),
      catId,
      date: new Date().toISOString().split("T")[0],
      type: newLog.type,
      note: newLog.note,
    };

    setLogs((prev) => [log, ...prev]);
    setNewLog({ type: "Observation", note: "" });
    setIsModalOpen(false);
    addToast("Health note added successfully", "success");
  };

  const handleDelete = (id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    setDeleteConfirmId(null);
    addToast("Health note deleted", "info");
  };

  return (
    <div>
      {/* Add Note button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 bg-litter-primary text-white rounded-lg font-medium hover:bg-[#165a4e] transition-colors mb-4"
      >
        <Plus className="w-5 h-5" />
        Add Note
      </button>

      {logs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No health notes yet"
          description="Log vet visits and observations here to keep a complete health record."
        />
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              onDelete={() => setDeleteConfirmId(log.id)}
            />
          ))}
        </div>
      )}

      {/* Add Note Modal */}
      <BottomSheet
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Health Note"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">
              Note Type
            </label>
            <select
              value={newLog.type}
              onChange={(e) =>
                setNewLog((prev) => ({
                  ...prev,
                  type: e.target.value as HealthLog["type"],
                }))
              }
              className="w-full px-4 py-3 rounded-xl border border-litter-border focus:outline-none focus:ring-2 focus:ring-[#1B7A6E] focus:border-transparent transition-all"
            >
              <option value="Vet Visit">Vet Visit</option>
              <option value="Medication">Medication</option>
              <option value="Observation">Observation</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1.5">
              What happened?
            </label>
            <textarea
              value={newLog.note}
              onChange={(e) =>
                setNewLog((prev) => ({ ...prev, note: e.target.value }))
              }
              placeholder="Describe the event..."
              maxLength={500}
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-litter-border focus:outline-none focus:ring-2 focus:ring-[#1B7A6E] focus:border-transparent transition-all resize-none"
            />
            <p className="text-xs text-theme-muted mt-1 text-right">
              {newLog.note.length}/500
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={!newLog.note.trim()}
            className="w-full px-4 py-3 rounded-xl bg-litter-primary text-white font-medium hover:bg-[#165a4e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save Note
          </button>
        </div>
      </BottomSheet>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        title="Delete Note"
        message="Are you sure you want to delete this health note? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}

function LogCard({ log, onDelete }: { log: HealthLog; onDelete: () => void }) {
  const typeColors = getHealthLogTypeColor(log.type);

  return (
    <div className="bg-litter-card rounded-xl p-4 border border-litter-border shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm text-theme-muted">{formatDate(log.date)}</p>
          <span
            className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeColors.bg} ${typeColors.text}`}
          >
            {log.type}
          </span>
        </div>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg hover:bg-red-50 text-theme-muted hover:text-red-500 transition-colors"
          aria-label="Delete note"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <p className="text-litter-text">{log.note}</p>
    </div>
  );
}
