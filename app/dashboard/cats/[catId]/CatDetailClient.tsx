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
  Camera,
  Upload,
  X as XIcon,
  PawPrint,
  Scale,
  CalendarDays,
  Wifi,
  ScanLine,
  Loader2,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { TabBar } from "@/components/ui/TabBar";
import { StatCard } from "@/components/dashboard/StatCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastContainer } from "@/components/ui/Toast";
import { BreedPicker, MonthYearPicker } from "@/components/cats/CatFormFields";
import { useCats } from "@/lib/contexts/CatContext";
import { type ToastParams } from "@/lib/interfaces/ToastParams";
import { type Session } from "@/lib/interfaces/Session";
import { type HealthLog } from "@/lib/interfaces/HealthLog";
import {
  getSessionsByCatId,
  getHealthLogsByCatId,
  getTrendData,
  deviceStats,
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

interface EditFormData {
  name: string;
  breed: string;
  dob: string;
  weightKg: string;
  rfidTag: string;
  photo: string | null;
}

export default function CatDetailClient() {
  const params = useParams();
  const router = useRouter();
  const catId = params.catId as string;
  const { getCatById, getDetailsByCatId, getStatsByCatId, updateCat, updateDetails, removeCat } = useCats();

  const cat = getCatById(catId);
  const details = getDetailsByCatId(catId);
  const stats = getStatsByCatId(catId);
  const trendData = getTrendData(catId);

  const [activeTab, setActiveTab] = useState("overview");
  const [toasts, setToasts] = useState<Omit<ToastParams, "onClose">[]>([]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteStep1Open, setIsDeleteStep1Open] = useState(false);
  const [isDeleteStep2Open, setIsDeleteStep2Open] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof EditFormData, string>>>({});
  const [editForm, setEditForm] = useState<EditFormData>({
    name: cat?.name ?? "",
    breed: details?.breed ?? "",
    dob: details?.dob ?? "",
    weightKg: details?.weightKg ? String(details.weightKg) : "",
    rfidTag: details?.rfidTag === "—" ? "" : (details?.rfidTag ?? ""),
    photo: cat?.avatar ?? null,
  });

  const addToast = (message: string, type: ToastParams["type"] = "info") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const openEdit = () => {
    // Refresh form with latest saved values
    setEditForm({
      name: cat?.name ?? "",
      breed: details?.breed ?? "",
      dob: details?.dob ?? "",
      weightKg: details?.weightKg ? String(details.weightKg) : "",
      rfidTag: details?.rfidTag === "—" ? "" : (details?.rfidTag ?? ""),
      photo: cat?.avatar ?? null,
    });
    setEditErrors({});
    setIsEditOpen(true);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEditForm((p) => ({ ...p, photo: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleEditSave = async () => {
    const errs: Partial<Record<keyof EditFormData, string>> = {};
    if (!editForm.name.trim()) errs.name = "Name is required";
    if (!editForm.breed.trim()) errs.breed = "Breed is required";
    if (!editForm.dob) errs.dob = "Date of birth is required";
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return; }

    setIsSaving(true);
    await updateCat(catId, { name: editForm.name.trim(), avatar: editForm.photo });
    await updateDetails(catId, {
      breed: editForm.breed,
      dob: editForm.dob,
      weightKg: editForm.weightKg ? parseFloat(editForm.weightKg) : 0,
      rfidTag: editForm.rfidTag || "—",
    });
    setIsSaving(false);
    setIsEditOpen(false);
    addToast("Cat profile updated!", "success");
  };

  const handleDelete = async () => {
    await removeCat(catId);
    router.push("/dashboard/cats");
  };

  if (!cat) {
    return (
      <div className="min-h-screen bg-litter-card flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-litter-text mb-2">Cat not found</h1>
          <button onClick={() => router.push("/dashboard/cats")} className="text-litter-primary hover:underline">
            Back to My Cats
          </button>
        </div>
      </div>
    );
  }

  const statusColors = getStatusColor(cat.status);
  const statusLabel = getStatusLabel(cat.status);

  return (
    <div className="min-h-screen bg-litter-bg pb-24">
      <TopBar />
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">

        {/* ── Back button ── */}
        <div className="flex items-center justify-between mb-5 pt-4">
          <button
            onClick={() => router.push("/dashboard/cats")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-litter-card border border-litter-border text-sm font-medium text-theme-secondary hover:border-litter-primary hover:text-litter-primary transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            My Cats
          </button>

          <button
            onClick={openEdit}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-litter-card border border-litter-border text-sm font-medium text-theme-secondary hover:border-litter-primary hover:text-litter-primary transition-all shadow-sm"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
        </div>

        {/* ── Profile Header ── */}
        <section className="bg-litter-card rounded-2xl p-6 shadow-sm border border-litter-border mb-6">
          <div className="flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative w-24 h-24 mb-4">
              <div className="w-full h-full rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-3xl overflow-hidden">
                {cat.avatar ? (
                  <img src={cat.avatar} alt={cat.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  cat.name.charAt(0).toUpperCase()
                )}
              </div>
              {cat.isOnline && (
                <span className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-litter-text mb-2">{cat.name}</h1>

            <p className="text-theme-muted mb-3">
              {details?.breed || "Unknown breed"}
              {details?.dob ? ` · ${calculateAge(details.dob)}` : ""}
              {details?.weightKg ? ` · ${details.weightKg} kg` : ""}
            </p>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#E8F5F1] text-[#1B7A6E] text-xs font-mono font-medium mb-3">
              <Tag className="w-3 h-3" />
              RFID: {details?.rfidTag || "—"}
            </span>

            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors.bg} ${statusColors.text}`}>
              {statusLabel}
            </span>
          </div>
        </section>

        {/* ── Edit BottomSheet ── */}
        <BottomSheet isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Cat Profile">
          <div className="space-y-6">

            {/* Photo */}
            <label className="group relative flex flex-col items-center justify-center gap-2 cursor-pointer">
              <div className={`relative w-full h-32 rounded-2xl overflow-hidden border-2 border-dashed transition-colors ${editForm.photo ? "border-litter-primary" : "border-litter-border hover:border-litter-primary"} bg-litter-primary-light/30`}>
                {editForm.photo ? (
                  <>
                    <img src={editForm.photo} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <Camera className="w-6 h-6 text-white" />
                      <span className="text-white text-xs font-medium">Change photo</span>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-litter-primary/10 flex items-center justify-center group-hover:bg-litter-primary/20 transition-colors">
                      <Upload className="w-5 h-5 text-litter-primary" />
                    </div>
                    <p className="text-sm font-medium text-litter-primary">Upload photo</p>
                  </div>
                )}
              </div>
              {editForm.photo && (
                <button type="button" onClick={(e) => { e.preventDefault(); setEditForm((p) => ({ ...p, photo: null })); }}
                  className="flex items-center gap-1 text-xs text-litter-muted hover:text-red-500 transition-colors">
                  <XIcon className="w-3 h-3" /> Remove photo
                </button>
              )}
              <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </label>

            {/* Basic Info */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-litter-muted">Basic Info</p>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  Cat Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <PawPrint className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-litter-muted pointer-events-none" />
                  <input type="text" value={editForm.name}
                    onChange={(e) => { setEditForm((p) => ({ ...p, name: e.target.value })); setEditErrors((p) => ({ ...p, name: undefined })); }}
                    placeholder="e.g. Whiskers"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${editErrors.name ? "border-red-500" : "border-litter-border"} bg-[var(--color-input)] text-litter-text placeholder:text-[var(--color-placeholder)] focus:outline-none focus:ring-2 focus:ring-litter-primary focus:border-transparent transition-all`}
                  />
                </div>
                {editErrors.name && <p className="text-red-500 text-xs mt-1">{editErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  Breed <span className="text-red-500">*</span>
                </label>
                <BreedPicker value={editForm.breed} hasError={!!editErrors.breed}
                  onChange={(v) => { setEditForm((p) => ({ ...p, breed: v })); setEditErrors((p) => ({ ...p, breed: undefined })); }} />
                {editErrors.breed && <p className="text-red-500 text-xs mt-1">{editErrors.breed}</p>}
              </div>
            </div>

            {/* Health Details */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-litter-muted">Health Details</p>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="w-4 h-4 text-litter-muted" />
                    Date of Birth <span className="text-red-500">*</span>
                  </span>
                </label>
                <MonthYearPicker value={editForm.dob} hasError={!!editErrors.dob}
                  onChange={(v) => { setEditForm((p) => ({ ...p, dob: v })); setEditErrors((p) => ({ ...p, dob: undefined })); }} />
                {editErrors.dob && <p className="text-red-500 text-xs mt-1">{editErrors.dob}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1.5">Weight (kg)</label>
                <div className="relative">
                  <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-litter-muted pointer-events-none" />
                  <input type="number" step="0.1" min="0" value={editForm.weightKg}
                    onChange={(e) => setEditForm((p) => ({ ...p, weightKg: e.target.value }))}
                    placeholder="4.2"
                    className="w-full pl-9 pr-3 py-3 rounded-xl border border-litter-border bg-[var(--color-input)] text-litter-text placeholder:text-[var(--color-placeholder)] focus:outline-none focus:ring-2 focus:ring-litter-primary focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Device */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-litter-muted">Device</p>
              <div className="rounded-2xl border border-litter-border bg-litter-primary-light/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-litter-primary/10 flex items-center justify-center">
                    <Wifi className="w-4 h-4 text-litter-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-litter-text">RFID Tag ID</p>
                    <p className="text-xs text-litter-muted">Tap the scan button on your LitterSense device</p>
                  </div>
                </div>
                <div className="relative">
                  <input type="text" value={editForm.rfidTag}
                    onChange={(e) => setEditForm((p) => ({ ...p, rfidTag: e.target.value }))}
                    placeholder="Scan or enter RFID tag"
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-litter-border bg-[var(--color-input)] text-litter-text placeholder:text-[var(--color-placeholder)] focus:outline-none focus:ring-2 focus:ring-litter-primary focus:border-transparent transition-all"
                  />
                  <button type="button" title="Auto-fill from device"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-litter-muted hover:text-litter-primary hover:bg-litter-primary/10 transition-all">
                    <ScanLine className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Save */}
            <button type="button" onClick={handleEditSave} disabled={isSaving}
              className="w-full px-4 py-3 rounded-xl bg-litter-primary text-white font-semibold hover:bg-[#165a4e] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm">
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><PawPrint className="w-4 h-4" /> Save Changes</>}
            </button>

            {/* Danger zone */}
            <div className="border-t border-litter-border pt-4">
              <button
                type="button"
                onClick={() => { setIsEditOpen(false); setTimeout(() => setIsDeleteStep1Open(true), 150); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 hover:border-red-400 active:scale-[0.98] transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Remove This Cat
              </button>
            </div>
          </div>
        </BottomSheet>

        {/* ── Delete Step 1 ── */}
        <ConfirmDialog
          isOpen={isDeleteStep1Open}
          onClose={() => setIsDeleteStep1Open(false)}
          onConfirm={() => { setIsDeleteStep1Open(false); setIsDeleteStep2Open(true); }}
          title={`Remove ${cat.name}?`}
          message={`Are you sure you want to remove ${cat.name} from your LitterSense account? This will also delete all health records, litter session history, and activity data linked to ${cat.name}.`}
          confirmText="Yes, Remove"
          cancelText="Keep Cat"
          variant="danger"
        />

        {/* ── Delete Step 2 (final warning) ── */}
        <ConfirmDialog
          isOpen={isDeleteStep2Open}
          onClose={() => setIsDeleteStep2Open(false)}
          onConfirm={handleDelete}
          title="Permanently Delete All Data?"
          message={`You are about to permanently delete ${cat.name}'s profile along with all associated records. This includes session logs, health notes, and litter activity history. This action cannot be reversed — once deleted, the data is gone forever. Are you absolutely sure you want to continue?`}
          confirmText="Yes, Delete Everything"
          cancelText="Cancel"
          variant="danger"
        />

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
                  details={details ?? null}
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
                  details={details ?? null}
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
  } | null;
}

function OverviewTab({ stats, details }: OverviewTabProps) {
  const sessions = getSessionsByCatId("1"); // Mock recent anomalies
  const recentAnomalies = sessions.filter((s) => s.anomaly).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Health Insight */}
      {details?.healthInsight && (
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
      {details ? (
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
      ) : (
        <div className="bg-theme-overlay rounded-xl p-4 border border-litter-border text-center">
          <p className="text-sm text-litter-muted">Baseline data will appear once the device starts recording sessions.</p>
        </div>
      )}

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
  } | null;
}

function TrendsTab({ trendData, details }: TrendsTabProps) {
  if (!trendData || !details) {
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
  addToast: (message: string, type: ToastParams["type"]) => void;
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
