"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  Maximize2,
  Settings,
  Trash2,
  Cat,
  Layers,
  Calendar,
  Clock,
  Filter,
  Video,
  Radio,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";

const ESP32_STREAM_URL = "/api/stream";

// ─── Mock Data ────────────────────────────────────────────────────────────────

type RecordingEvent = {
  id: string;
  type: "cat_visit" | "cleaning";
  title: string;
  timestamp: string;
  duration: string;
  date: string;
  cat?: string;
  thumbnailColor: string;
};

const MOCK_CATS = ["All Cats", "Mochi", "Luna", "Nala"];

const MOCK_RECORDINGS: RecordingEvent[] = [
  {
    id: "1",
    type: "cat_visit",
    title: "Cat Visit Detected",
    timestamp: "Today, 2:45 PM",
    duration: "4m 12s",
    date: "today",
    cat: "Mochi",
    thumbnailColor: "#D4EDE8",
  },
  {
    id: "2",
    type: "cleaning",
    title: "Cleaning Cycle Complete",
    timestamp: "Today, 1:15 PM",
    duration: "2m 05s",
    date: "today",
    cat: undefined,
    thumbnailColor: "#E8F4F0",
  },
  {
    id: "3",
    type: "cat_visit",
    title: "Cat Visit Detected",
    timestamp: "Today, 10:30 AM",
    duration: "3m 48s",
    date: "today",
    cat: "Luna",
    thumbnailColor: "#D4EDE8",
  },
  {
    id: "4",
    type: "cat_visit",
    title: "Cat Visit Detected",
    timestamp: "Yesterday, 9:22 PM",
    duration: "5m 01s",
    date: "yesterday",
    cat: "Mochi",
    thumbnailColor: "#D4EDE8",
  },
  {
    id: "5",
    type: "cleaning",
    title: "Cleaning Cycle Complete",
    timestamp: "Yesterday, 6:00 PM",
    duration: "1m 55s",
    date: "yesterday",
    cat: undefined,
    thumbnailColor: "#E8F4F0",
  },
  {
    id: "6",
    type: "cat_visit",
    title: "Cat Visit Detected",
    timestamp: "Yesterday, 3:10 PM",
    duration: "2m 30s",
    date: "yesterday",
    cat: "Nala",
    thumbnailColor: "#D4EDE8",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveView() {
  const [error, setError] = useState(false);

  return (
    <div className="relative w-full aspect-video bg-[#1C1C1C] rounded-2xl overflow-hidden shadow-lg">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Radio className="w-10 h-10 text-theme-secondary" />
          <p className="text-theme-muted text-sm">Cannot reach camera</p>
          <p className="text-theme-secondary text-xs">{ESP32_STREAM_URL}</p>
          <button
            onClick={() => setError(false)}
            className="mt-2 px-3 py-1 rounded-full bg-litter-primary text-white text-xs font-medium hover:bg-[#165a4e] transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* MJPEG streams never fire onLoad — render directly, onError handles failures */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ESP32_STREAM_URL}
            alt="ESP32-CAM live stream"
            className="w-full h-full object-cover"
            onError={() => setError(true)}
          />
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-xs font-semibold tracking-wide">LIVE</span>
          </div>
        </>
      )}
    </div>
  );
}

function VideoPlayer({ recording }: { readonly recording: RecordingEvent | null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const progress = 30; // mock progress

  if (!recording) {
    return (
      <div className="relative w-full aspect-video bg-[#1C1C1C] rounded-2xl overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <Video className="w-10 h-10 text-theme-secondary mx-auto mb-2" />
          <p className="text-theme-muted text-sm">Select a recording to play</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-[#1A2E2B] rounded-2xl overflow-hidden shadow-lg">
      {/* Mock video thumbnail */}
      <div
        className="absolute inset-0 opacity-30"
        style={{ background: `linear-gradient(135deg, ${recording.thumbnailColor}, #1A2E2B)` }}
      />

      {/* Timestamp badge (replaces LIVE badge) */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1">
        <Clock className="w-3 h-3 text-white" />
        <span className="text-white text-xs font-medium">{recording.timestamp}</span>
      </div>

      {/* HD badge */}
      <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1">
        <span className="text-white text-xs font-semibold tracking-wide">HD</span>
      </div>

      {/* Play/Pause button */}
      <button
        onClick={() => setIsPlaying((p) => !p)}
        className="absolute inset-0 flex items-center justify-center group"
      >
        <div className="w-14 h-14 rounded-full bg-litter-primary flex items-center justify-center shadow-lg group-hover:bg-[#165a4e] group-hover:scale-105 transition-all duration-200">
          {isPlaying ? (
            <Pause className="w-6 h-6 text-white" />
          ) : (
            <Play className="w-6 h-6 text-white translate-x-0.5" />
          )}
        </div>
      </button>

      {/* Bottom controls bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        {/* Progress bar */}
        <div className="w-full h-1 bg-litter-card/30 rounded-full mb-2 cursor-pointer">
          <div
            className="h-full bg-litter-primary rounded-full relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-litter-card rounded-full shadow-md" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-white text-xs">{recording.duration}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {}}
              className="text-white/80 hover:text-white transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => {}}
              className="text-white/80 hover:text-white transition-colors"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordingRow({
  recording,
  isSelected,
  onSelect,
  onDelete,
}: {
  readonly recording: RecordingEvent;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 ${
        isSelected
          ? "bg-litter-primary-light border border-litter-primary/30"
          : "bg-litter-card border border-litter-border hover:border-litter-primary/20 hover:bg-litter-bg"
      }`}
      onClick={onSelect}
    >
      {/* Thumbnail icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: recording.thumbnailColor }}
      >
        {recording.type === "cat_visit" ? (
          <Cat className="w-5 h-5 text-litter-primary" />
        ) : (
          <Layers className="w-5 h-5 text-litter-primary" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isSelected ? "text-litter-primary" : "text-litter-text"}`}>
          {recording.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-theme-muted">{recording.timestamp}</span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-theme-muted">{recording.duration}</span>
          {recording.cat && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-litter-primary font-medium">{recording.cat}</span>
            </>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1.5 rounded-lg text-theme-muted hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
        title="Delete recording"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlaybackPage() {
  const [activeTab, setActiveTab] = useState<"live" | "recordings">("live");
  const [recordings, setRecordings] = useState<RecordingEvent[]>(MOCK_RECORDINGS);
  const [selectedRecording, setSelectedRecording] = useState<RecordingEvent | null>(
    MOCK_RECORDINGS[0]
  );
  const [selectedCat, setSelectedCat] = useState("All Cats");
  const [selectedDate, setSelectedDate] = useState<"all" | "today" | "yesterday">("all");
  const [showAllRecordings, setShowAllRecordings] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    setTimeout(() => {
      setDeviceConnected(true);
      setIsConnecting(false);
    }, 1800);
  };

  const handleDisconnect = () => {
    setDeviceConnected(false);
  };

  const handleDelete = (id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    if (selectedRecording?.id === id) {
      const remaining = recordings.find((r) => r.id !== id);
      setSelectedRecording(remaining ?? null);
    }
  };

  const filteredRecordings = recordings.filter((r) => {
    const catMatch = selectedCat === "All Cats" || r.cat === selectedCat;
    const dateMatch = selectedDate === "all" || r.date === selectedDate;
    return catMatch && dateMatch;
  });

  const visibleRecordings = showAllRecordings
    ? filteredRecordings
    : filteredRecordings.slice(0, 3);

  return (
    <div className="min-h-screen bg-litter-bg pb-24">
      <TopBar />

      <main className="pt-20 px-4 sm:px-6 max-w-lg mx-auto">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-5"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-litter-text mb-1">
            Playback
          </h1>
          <p className="text-[#6B7280] text-sm">
            Review your LitterSense camera recordings
          </p>

          {/* Tab toggle */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setActiveTab("live")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeTab === "live"
                  ? "bg-litter-primary text-white border-litter-primary"
                  : "bg-litter-card text-theme-muted border-litter-border hover:border-litter-primary/40"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Live
            </button>
            <button
              onClick={() => setActiveTab("recordings")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeTab === "recordings"
                  ? "bg-litter-primary text-white border-litter-primary"
                  : "bg-litter-card text-theme-muted border-litter-border hover:border-litter-primary/40"
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              Recordings
            </button>
          </div>
        </motion.section>

        {/* ── Device Gate ─────────────────────────────────────── */}
        {!deviceConnected ? (
          <motion.div
            key="connect-gate"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.45 }}
            className="relative overflow-hidden rounded-3xl border border-litter-border bg-litter-card shadow-xl p-8 text-center"
          >
            {/* decorative radial glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="h-64 w-64 rounded-full bg-litter-primary/10 blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-4">
              {/* icon ring */}
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-litter-primary/20 bg-litter-primary/10 shadow-inner">
                <Radio className="h-9 w-9 text-litter-primary" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-litter-text">No Device Connected</h2>
                <p className="mt-1 text-sm text-theme-muted max-w-[260px] mx-auto">
                  Pair your LitterSense unit to watch the live feed and browse recording history.
                </p>
              </div>

              {/* steps */}
              <div className="w-full rounded-2xl border border-litter-border bg-litter-bg p-4 text-left space-y-3 mt-1">
                {[
                  { step: "1", label: "Power on your LitterSense device" },
                  { step: "2", label: "Make sure it's on the same Wi-Fi network" },
                  { step: "3", label: "Tap Connect below to pair" },
                ].map(({ step, label }) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-litter-primary text-[11px] font-bold text-white">
                      {step}
                    </span>
                    <span className="text-sm text-theme-muted">{label}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="mt-2 flex items-center gap-2 rounded-full bg-litter-primary px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-litter-primary/25 transition-all hover:bg-[#165a4e] hover:shadow-litter-primary/40 disabled:opacity-60"
              >
                {isConnecting ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                      className="block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                    />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Radio className="h-4 w-4" />
                    Connect Device
                  </>
                )}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="connected-view"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Video player */}
            <div className="mb-4">
              {activeTab === "live" ? (
                <LiveView />
              ) : (
                <VideoPlayer recording={selectedRecording} />
              )}
            </div>

            {/* Device Info Row (recordings only) */}
            {activeTab === "recordings" && selectedRecording && (
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-litter-text text-base">LitterSense Unit #67</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-litter-primary" />
                    <span className="text-sm text-litter-primary font-medium">Playback</span>
                    <span className="text-theme-muted text-sm">·</span>
                    <span className="text-sm text-theme-muted">{selectedRecording.timestamp}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="w-9 h-9 rounded-xl border border-litter-border bg-litter-card flex items-center justify-center text-litter-primary hover:bg-litter-primary-light transition-colors shadow-sm">
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button className="w-9 h-9 rounded-xl border border-litter-border bg-litter-card flex items-center justify-center text-litter-primary hover:bg-litter-primary-light transition-colors shadow-sm">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Device Status Card ── */}
            <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-4 mb-4">
              <p className="text-[10px] font-bold tracking-widest text-litter-primary uppercase mb-3">
                Device Status
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-4 w-4 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-50" />
                    <span className="relative inline-flex h-4 w-4 rounded-full bg-green-500" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-litter-text leading-tight">Connected</p>
                    <p className="text-xs text-theme-muted leading-tight mt-0.5">LitterSense Unit #67</p>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {/* ── Filters Card ── */}
            <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-4 mb-4">
              <p className="text-[10px] font-bold tracking-widest text-litter-primary uppercase mb-3">
                Filters
              </p>

              {/* Date row */}
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-3.5 h-3.5 text-theme-muted shrink-0" />
                <div className="flex gap-1.5 flex-wrap">
                  {(["all", "today", "yesterday"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                        selectedDate === d
                          ? "bg-litter-primary text-white border-litter-primary"
                          : "bg-litter-bg text-theme-muted border-litter-border hover:border-litter-primary/40"
                      }`}
                    >
                      {d === "all" ? "All Dates" : d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cat row */}
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-theme-muted shrink-0" />
                <div className="flex gap-1.5 flex-wrap">
                  {MOCK_CATS.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCat(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        selectedCat === cat
                          ? "bg-litter-primary text-white border-litter-primary"
                          : "bg-litter-bg text-theme-muted border-litter-border hover:border-litter-primary/40"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Recording History ── */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-base text-litter-text">Recording History</h2>
                {filteredRecordings.length > 3 && (
                  <button
                    onClick={() => setShowAllRecordings((v) => !v)}
                    className="text-litter-primary text-sm font-semibold hover:underline"
                  >
                    {showAllRecordings ? "Show Less" : "View All"}
                  </button>
                )}
              </div>

              {filteredRecordings.length === 0 ? (
                <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-10 text-center">
                  <Video className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-litter-text">No recordings found</p>
                  <p className="text-xs text-theme-muted mt-1">Try changing the filters above.</p>
                </div>
              ) : (
                <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm overflow-hidden">
                  {visibleRecordings.map((recording, idx) => (
                    <div
                      key={recording.id}
                      className={idx < visibleRecordings.length - 1 ? "border-b border-litter-border" : ""}
                    >
                      <RecordingRow
                        recording={recording}
                        isSelected={selectedRecording?.id === recording.id}
                        onSelect={() => setSelectedRecording(recording)}
                        onDelete={() => handleDelete(recording.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}