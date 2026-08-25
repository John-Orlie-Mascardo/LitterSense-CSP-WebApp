/**
 * Live litter-box view.
 *
 * Shows the configured device stream and an optional recording-browser surface.
 *
 * DONE: live stream controls and responsive player
 * PLACEHOLDER: recording filters and recording events remain mock-only behind a feature flag
 *
 * NEXT: device/video owners must connect recording history before enabling that tab.
 */

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

const ESP32_STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? "/api/stream";
const SHOW_RECORDINGS_UI = false;

type LiveStreamState = "unknown" | "connected" | "error";
type ActiveTab = "live" | "recordings";
type ActiveView = "live" | "recordings";
type SelectedDate = "all" | "today" | "yesterday";

const RECORDING_PREVIEW_LIMIT = 3;

// ─── Mock Data ────────────────────────────────────────────────────────────────

// FIXME(defense): Recording filters and events are mock data. Keep the feature
// disabled until real recording history is connected before the Aug 26-28 defense.
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

function getFilteredRecordings(
  recordings: RecordingEvent[],
  selectedCat: string,
  selectedDate: SelectedDate,
) {
  return recordings.filter((recording) => {
    const catMatch = selectedCat === "All Cats" || recording.cat === selectedCat;
    const dateMatch = selectedDate === "all" || recording.date === selectedDate;
    return catMatch && dateMatch;
  });
}

function getVisibleRecordings(recordings: RecordingEvent[], showAllRecordings: boolean) {
  if (showAllRecordings) return recordings;
  return recordings.slice(0, RECORDING_PREVIEW_LIMIT);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveView({
  onStreamStateChange,
}: {
  readonly onStreamStateChange: (state: LiveStreamState) => void;
}) {
  const [error, setError] = useState(false);

  return (
    <div className="relative w-full aspect-video bg-[#1C1C1C] rounded-2xl overflow-hidden shadow-lg">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Radio className="w-10 h-10 text-theme-secondary" />
          <p className="text-theme-muted text-sm">Cannot reach camera</p>
          <p className="text-theme-secondary text-xs">{ESP32_STREAM_URL}</p>
          <button
            onClick={() => {
              setError(false);
              onStreamStateChange("unknown");
            }}
            className="mt-2 px-3 py-1 rounded-full bg-litter-primary text-white text-xs font-medium hover:bg-[#165a4e] transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ESP32_STREAM_URL}
            alt="ESP32-CAM live stream"
            className="w-full h-full object-cover"
            onLoad={() => {
              setError(false);
              onStreamStateChange("connected");
            }}
            onError={() => {
              setError(true);
              onStreamStateChange("error");
            }}
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
  const progress = 30;

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
      <div
        className="absolute inset-0 opacity-30"
        style={{ background: `linear-gradient(135deg, ${recording.thumbnailColor}, #1A2E2B)` }}
      />
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1">
        <Clock className="w-3 h-3 text-white" />
        <span className="text-white text-xs font-medium">{recording.timestamp}</span>
      </div>
      <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1">
        <span className="text-white text-xs font-semibold tracking-wide">HD</span>
      </div>
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
      <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-3">
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
            <button onClick={() => {}} className="text-white/80 hover:text-white transition-colors" title="Settings">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={() => {}} className="text-white/80 hover:text-white transition-colors" title="Fullscreen">
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
      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 ${
        isSelected
          ? "bg-litter-primary-light border border-litter-primary/30"
          : "bg-litter-card border border-litter-border hover:border-litter-primary/20 hover:bg-litter-bg"
      }`}
      onClick={onSelect}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: recording.thumbnailColor }}
      >
        {recording.type === "cat_visit" ? (
          <Cat className="w-5 h-5 text-litter-primary" />
        ) : (
          <Layers className="w-5 h-5 text-litter-primary" />
        )}
      </div>
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
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-1.5 rounded-lg text-theme-muted hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
        title="Delete recording"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

function LiveHeader({
  activeTab,
  onActiveTabChange,
}: {
  readonly activeTab: ActiveTab;
  readonly onActiveTabChange: (tab: ActiveTab) => void;
}) {
  return (
    <section className="mb-5">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-litter-text mb-1">
        Live
      </h1>
      <p className="text-[#6B7280] text-sm">
        {SHOW_RECORDINGS_UI
          ? "Review your LitterSense camera recordings"
          : "Watch your LitterSense camera live feed"}
      </p>
      {SHOW_RECORDINGS_UI ? (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onActiveTabChange("live")}
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
            onClick={() => onActiveTabChange("recordings")}
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
      ) : (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-litter-primary/20 bg-litter-primary/10 px-4 py-1.5 text-sm font-medium text-litter-primary">
          <Radio className="w-3.5 h-3.5" />
          Live
        </div>
      )}
    </section>
  );
}

function DeviceGate({
  isConnecting,
  onConnect,
}: {
  readonly isConnecting: boolean;
  readonly onConnect: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-litter-border bg-litter-card shadow-xl p-8 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-64 w-64 rounded-full bg-litter-primary/10 blur-3xl" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-litter-primary/20 bg-litter-primary/10 shadow-inner">
          <Radio className="h-9 w-9 text-litter-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-litter-text">No Device Connected</h2>
          <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-theme-muted">
            {SHOW_RECORDINGS_UI
              ? "Pair your LitterSense unit to watch the live feed and browse recording history."
              : "Pair your LitterSense unit to watch the live feed."}
          </p>
        </div>
        <div className="w-full rounded-2xl border border-litter-border bg-litter-bg p-4 text-left space-y-3 mt-1">
          {[
            { step: "1", label: "Power on your LitterSense device" },
            { step: "2", label: "Make sure it's on the same Wi-Fi network" },
            { step: "3", label: "Tap Connect below to pair" },
          ].map(({ step, label }) => (
            <div key={step} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-litter-primary text-[11px] font-bold text-white">
                {step}
              </span>
              <span className="text-sm text-theme-muted">{label}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onConnect}
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
    </div>
  );
}

function LiveViewer({
  activeView,
  selectedRecording,
  onStreamStateChange,
}: {
  readonly activeView: ActiveView;
  readonly selectedRecording: RecordingEvent | null;
  readonly onStreamStateChange: (state: LiveStreamState) => void;
}) {
  return (
    <div className="mb-4">
      {activeView === "live" ? (
        <LiveView onStreamStateChange={onStreamStateChange} />
      ) : (
        <VideoPlayer recording={selectedRecording} />
      )}
    </div>
  );
}

function RecordingDeviceInfo({ selectedRecording }: { readonly selectedRecording: RecordingEvent }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <p className="font-semibold text-litter-text text-base">LitterSense Unit #67</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="w-2 h-2 rounded-full bg-litter-primary" />
          <span className="text-sm text-litter-primary font-medium">Live</span>
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
  );
}

function DeviceStatusCard({
  statusLabel,
  statusColor,
  onDisconnect,
}: {
  readonly statusLabel: string;
  readonly statusColor: string;
  readonly onDisconnect: () => void;
}) {
  return (
    <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-4 mb-4">
      <p className="text-[10px] font-bold tracking-widest text-litter-primary uppercase mb-3">
        Device Status
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-4 w-4 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusColor} opacity-50`} />
            <span className={`relative inline-flex h-4 w-4 rounded-full ${statusColor}`} />
          </span>
          <div>
            <p className="text-sm font-bold text-litter-text leading-tight">{statusLabel}</p>
            <p className="text-xs text-theme-muted leading-tight mt-0.5">LitterSense Unit #67</p>
          </div>
        </div>
        <button
          onClick={onDisconnect}
          className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function RecordingFilters({
  selectedDate,
  selectedCat,
  onDateChange,
  onCatChange,
}: {
  readonly selectedDate: SelectedDate;
  readonly selectedCat: string;
  readonly onDateChange: (date: SelectedDate) => void;
  readonly onCatChange: (cat: string) => void;
}) {
  return (
    <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-4 mb-4">
      <p className="text-[10px] font-bold tracking-widest text-litter-primary uppercase mb-3">
        Filters
      </p>
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-3.5 h-3.5 text-theme-muted shrink-0" />
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "today", "yesterday"] as const).map((date) => (
            <button
              key={date}
              onClick={() => onDateChange(date)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                selectedDate === date
                  ? "bg-litter-primary text-white border-litter-primary"
                  : "bg-litter-bg text-theme-muted border-litter-border hover:border-litter-primary/40"
              }`}
            >
              {date === "all" ? "All Dates" : date.charAt(0).toUpperCase() + date.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-theme-muted shrink-0" />
        <div className="flex gap-1.5 flex-wrap">
          {MOCK_CATS.map((cat) => (
            <button
              key={cat}
              onClick={() => onCatChange(cat)}
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
  );
}

function RecordingHistory({
  filteredRecordings,
  visibleRecordings,
  showAllRecordings,
  selectedRecordingId,
  onToggleShowAllRecordings,
  onSelectRecording,
  onDeleteRecording,
}: {
  readonly filteredRecordings: RecordingEvent[];
  readonly visibleRecordings: RecordingEvent[];
  readonly showAllRecordings: boolean;
  readonly selectedRecordingId?: string;
  readonly onToggleShowAllRecordings: () => void;
  readonly onSelectRecording: (recording: RecordingEvent) => void;
  readonly onDeleteRecording: (id: string) => void;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-base text-litter-text">Recording History</h2>
        {filteredRecordings.length > RECORDING_PREVIEW_LIMIT && (
          <button
            onClick={onToggleShowAllRecordings}
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
                isSelected={selectedRecordingId === recording.id}
                onSelect={() => onSelectRecording(recording)}
                onDelete={() => onDeleteRecording(recording.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectedLiveView({
  activeTab,
  selectedRecording,
  selectedDate,
  selectedCat,
  filteredRecordings,
  visibleRecordings,
  showAllRecordings,
  liveStreamState,
  onStreamStateChange,
  onDisconnect,
  onDateChange,
  onCatChange,
  onToggleShowAllRecordings,
  onSelectRecording,
  onDeleteRecording,
}: {
  readonly activeTab: ActiveTab;
  readonly selectedRecording: RecordingEvent | null;
  readonly selectedDate: SelectedDate;
  readonly selectedCat: string;
  readonly filteredRecordings: RecordingEvent[];
  readonly visibleRecordings: RecordingEvent[];
  readonly showAllRecordings: boolean;
  readonly liveStreamState: LiveStreamState;
  readonly onStreamStateChange: (state: LiveStreamState) => void;
  readonly onDisconnect: () => void;
  readonly onDateChange: (date: SelectedDate) => void;
  readonly onCatChange: (cat: string) => void;
  readonly onToggleShowAllRecordings: () => void;
  readonly onSelectRecording: (recording: RecordingEvent) => void;
  readonly onDeleteRecording: (id: string) => void;
}) {
  const activeView: ActiveView = SHOW_RECORDINGS_UI ? activeTab : "live";
  const statusLabel =
    liveStreamState === "connected"
      ? "Connected"
      : liveStreamState === "error"
        ? "Error"
        : "Connecting";
  const statusColor =
    liveStreamState === "connected"
      ? "bg-green-500"
      : liveStreamState === "error"
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div>
      <LiveViewer
        activeView={activeView}
        selectedRecording={selectedRecording}
        onStreamStateChange={onStreamStateChange}
      />

      {activeView === "recordings" && selectedRecording && (
        <RecordingDeviceInfo selectedRecording={selectedRecording} />
      )}

      <DeviceStatusCard
        statusLabel={statusLabel}
        statusColor={statusColor}
        onDisconnect={onDisconnect}
      />

      {SHOW_RECORDINGS_UI && (
        <>
          <RecordingFilters
            selectedDate={selectedDate}
            selectedCat={selectedCat}
            onDateChange={onDateChange}
            onCatChange={onCatChange}
          />
          <RecordingHistory
            filteredRecordings={filteredRecordings}
            visibleRecordings={visibleRecordings}
            showAllRecordings={showAllRecordings}
            selectedRecordingId={selectedRecording?.id}
            onToggleShowAllRecordings={onToggleShowAllRecordings}
            onSelectRecording={onSelectRecording}
            onDeleteRecording={onDeleteRecording}
          />
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LivePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("live");
  const [recordings, setRecordings] = useState<RecordingEvent[]>(MOCK_RECORDINGS);
  const [selectedRecording, setSelectedRecording] = useState<RecordingEvent | null>(MOCK_RECORDINGS[0]);
  const [selectedCat, setSelectedCat] = useState("All Cats");
  const [selectedDate, setSelectedDate] = useState<SelectedDate>("all");
  const [showAllRecordings, setShowAllRecordings] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [liveStreamState, setLiveStreamState] = useState<LiveStreamState>("unknown");

  const handleConnect = () => {
    setIsConnecting(true);
    setLiveStreamState("unknown");
    setDeviceConnected(true);
    setIsConnecting(false);
  };

  const handleDisconnect = () => {
    setDeviceConnected(false);
    setLiveStreamState("unknown");
  };

  const handleDelete = (id: string) => {
    const remainingRecordings = recordings.filter((recording) => recording.id !== id);
    setRecordings(remainingRecordings);
    if (selectedRecording?.id === id) {
      setSelectedRecording(remainingRecordings[0] ?? null);
    }
  };

  const filteredRecordings = getFilteredRecordings(recordings, selectedCat, selectedDate);
  const visibleRecordings = getVisibleRecordings(filteredRecordings, showAllRecordings);

  return (
    <div className="min-h-screen bg-litter-bg pb-24 lg:pb-10">
      <TopBar />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
        <LiveHeader activeTab={activeTab} onActiveTabChange={setActiveTab} />

        {deviceConnected ? (
          <ConnectedLiveView
            activeTab={activeTab}
            selectedRecording={selectedRecording}
            selectedDate={selectedDate}
            selectedCat={selectedCat}
            filteredRecordings={filteredRecordings}
            visibleRecordings={visibleRecordings}
            showAllRecordings={showAllRecordings}
            liveStreamState={liveStreamState}
            onStreamStateChange={setLiveStreamState}
            onDisconnect={handleDisconnect}
            onDateChange={setSelectedDate}
            onCatChange={setSelectedCat}
            onToggleShowAllRecordings={() => setShowAllRecordings((value) => !value)}
            onSelectRecording={setSelectedRecording}
            onDeleteRecording={handleDelete}
          />
        ) : (
          <DeviceGate isConnecting={isConnecting} onConnect={handleConnect} />
        )}
      </main>

      <BottomNav />
    </div>
  );
}
