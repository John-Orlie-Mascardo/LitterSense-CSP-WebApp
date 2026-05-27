/**
 * Dashboard / Home Page (03.01.04)
 *
 * Three states:
 * 1. Empty — no cats registered, shows onboarding prompt
 * 2. Normal - cats registered, no abnormal health banner
 * 3. Anomaly - at least one cat flagged, abnormal health banner visible
 *
 * The cat selector switches per-cat data (visits, duration).
 * Visits come from Firebase catStats, updated by live RFID scans.
 */

"use client";

import Image from "next/image";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  CloudFog,
  Droplets,
  Gauge,
  Radio,
  Timer,
} from "lucide-react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useNotifications } from "@/lib/contexts/NotificationContext";
import { useCats } from "@/lib/contexts/CatContext";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { StatCard } from "@/components/dashboard/StatCard";
import { SessionTimelineCard } from "@/components/dashboard/SessionTimelineCard";
import { CatBehaviorTrends } from "@/components/dashboard/CatBehaviorTrends";
import { CatChip } from "@/components/cats/CatChip";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { useDeviceSensors, type DeviceSensors } from "@/lib/hooks/useDeviceSensors";
import { useAirQualityReadings, type AirQualityReadings } from "@/lib/hooks/useAirQualityReadings";
import {
  getLiveRfidStatus,
  type SensorDisplayStatus,
} from "@/lib/utils/liveSensorStatus";
import { getSessionSortValue } from "@/lib/utils/sessionTime";
import type { Cat } from "@/lib/interfaces/Cat";
import type { CatDetails } from "@/lib/interfaces/CatDetails";
import type { CatStats } from "@/lib/interfaces/CatStats";
import type { Session } from "@/lib/interfaces/Session";
import type { CatTrendPoint } from "@/lib/contexts/CatContext";

const DISMISSED_ABNORMAL_STORAGE_KEY = "dashboard-dismissed-abnormal-statuses";

const getAbnormalSignature = (cat: { id: string; status: string }) => `${cat.id}:${cat.status}`;

const readDismissedAbnormalKeys = () => {
  try {
    const rawValue = globalThis.localStorage.getItem(DISMISSED_ABNORMAL_STORAGE_KEY);
    if (!rawValue) return [];

    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
};

const persistDismissedAbnormalKeys = (keys: string[]) => {
  try {
    globalThis.localStorage.setItem(DISMISSED_ABNORMAL_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Ignore storage failures; abnormal banner dismissal still works for the current render.
  }
};

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getAbnormalNotificationKey = (cat: { id: string; status: string }, dateKey: string) =>
  `dashboard-abnormal:${dateKey}:${cat.id}:${cat.status}`;

const buildAbnormalNotificationMessage = (visitCount: number, avgDuration: string) => {
  const visitLabel = `${visitCount} visit${visitCount === 1 ? "" : "s"} logged`;
  const durationLabel = avgDuration && avgDuration !== "--"
    ? `avg duration ${avgDuration}`
    : "avg duration unavailable";

  return `Abnormal litter box behavior detected today. ${visitLabel}, ${durationLabel}.`;
};


const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const formatDate = () => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return new Date().toLocaleDateString("en-US", options);
};

const getUserFirstName = (displayName: string | null | undefined) => {
  if (!displayName) return "User";
  return displayName.split(" ")[0];
};

const getVisitsStatus = (visits: number) => {
  if (visits > 6) return "abnormal";
  return "normal";
};

const getVisitsLabel = (visits: number) => {
  if (visits > 8) return "Abnormal";
  if (visits > 6) return "Abnormal";
  return "Normal";
};

const getDurationLabel = (duration: string) => {
  const mins = Number.parseInt(duration);
  if (mins >= 5) return "Abnormal";
  if (mins >= 3) return "Abnormal";
  return "Normal";
};

const getDurationStatus = (duration: string) => {
  const mins = Number.parseInt(duration);
  if (mins >= 3) return "abnormal";
  return "normal";
};

const getStatusLabel = (status: string | undefined, includeIcon: boolean = false) => {
  let baseLabel: string;
  switch (status) {
    case "normal":
      baseLabel = "Normal";
      break;
    case "abnormal":
      baseLabel = "Abnormal";
      break;
    default:
      baseLabel = "Normal";
  }
  return includeIcon ? `● ${baseLabel}` : baseLabel;
};

const useDismissedAbnormalKeys = (abnormalCats: { id: string; status: string }[]) => {
  const [storedDismissedAbnormalKeys, setStoredDismissedAbnormalKeys] = useState<string[]>(
    readDismissedAbnormalKeys,
  );

  const dismissedAbnormalKeys = useMemo(() => {
    const activeAbnormalKeys = new Set(abnormalCats.map((cat) => getAbnormalSignature(cat)));
    return storedDismissedAbnormalKeys.filter((key) => activeAbnormalKeys.has(key));
  }, [abnormalCats, storedDismissedAbnormalKeys]);

  useEffect(() => {
    persistDismissedAbnormalKeys(dismissedAbnormalKeys);
  }, [dismissedAbnormalKeys]);

  return {
    dismissedAbnormalKeys,
    isDismissedAbnormalReady: true,
    setDismissedAbnormalKeys: setStoredDismissedAbnormalKeys,
  };
};

type RecentVisit = {
  readonly cat: Cat;
  readonly session: Session;
};

const normalizeRfidTag = (value: string) =>
  value.toLowerCase().replace(/[^a-f0-9]/g, "");

const hexToDec = (hex: string) => {
  const n = Number.parseInt(hex, 16);
  return Number.isNaN(n) ? "" : n.toString();
};

const rfidMatches = (
  details: CatDetails | undefined,
  card: string,
  hex: string,
) => {
  const tag = normalizeRfidTag(details?.rfidTag ?? "");
  if (!tag) return false;

  const normalizedCard = normalizeRfidTag(card);
  const normalizedHex = normalizeRfidTag(hex);
  return (
    tag === normalizedCard ||
    tag === normalizedHex ||
    tag === hexToDec(card) ||
    tag === hexToDec(hex)
  );
};

const getSessionStartedAt = (session: Session) => {
  if (session.startedAt) {
    const parsed = Date.parse(session.startedAt);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (session.endedAt) {
    const endedAt = Date.parse(session.endedAt);
    if (!Number.isNaN(endedAt)) {
      return endedAt - Math.max(0, session.durationSecs) * 1000;
    }
  }

  return getSessionSortValue(session);
};

const getSessionTimelineSortValue = (session: Session) =>
  Math.max(getSessionSortValue(session), getSessionStartedAt(session));

const buildLiveSessionVisit = (
  sensorData: DeviceSensors | null,
  cats: Cat[],
  getDetailsByCatId: (id: string) => CatDetails | undefined,
): RecentVisit | null => {
  if (!sensorData?.sessionActive) return null;

  const activeCard = sensorData.activeRfidCard || sensorData.rfidCard;
  const activeHex = sensorData.activeRfidHex || sensorData.rfidHex;
  if (!activeCard && !activeHex) return null;

  const cat = cats.find((candidate) =>
    rfidMatches(getDetailsByCatId(candidate.id), activeCard, activeHex),
  );
  if (!cat) return null;

  const nowMs = Date.now();
  const durationMs =
    sensorData.activeSessionDurationMs ??
    (sensorData.activeSessionStartMs
      ? nowMs - sensorData.activeSessionStartMs
      : 0);
  const startedMs =
    sensorData.activeSessionStartMs ??
    nowMs - Math.max(1000, durationMs);
  const startedAt = new Date(startedMs);

  return {
    cat,
    session: {
      id: `live-rfid-${cat.id}-${startedMs}`,
      catId: cat.id,
      date: getLocalDateKey(startedAt),
      time: startedAt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      startedAt: startedAt.toISOString(),
      durationSecs: Math.max(1, Math.round(durationMs / 1000)),
      mq135Delta: 0,
      mq136Delta: 0,
      anomaly: false,
      anomalyType: null,
      sessionStatus: "IN_PROGRESS",
    },
  };
};

const hasOverlappingLiveSession = (sessions: Session[], liveSession: Session) => {
  const liveStartedAt = getSessionStartedAt(liveSession);

  return sessions.some((session) => {
    if (session.catId !== liveSession.catId) return false;
    if (session.sessionStatus === "IN_PROGRESS" || !session.endedAt) return true;

    const startedAt = getSessionStartedAt(session);
    return Math.abs(startedAt - liveStartedAt) < 30_000;
  });
};

const getRecentVisits = (
  sessions: Session[],
  getCatById: (id: string) => Cat | undefined,
  liveVisit: RecentVisit | null,
): RecentVisit[] => {
  const storedVisits = sessions
    .flatMap((session) => {
      const cat = getCatById(session.catId);
      return cat ? [{ session, cat }] : [];
    });

  const mergedVisits =
    liveVisit && !hasOverlappingLiveSession(sessions, liveVisit.session)
      ? [liveVisit, ...storedVisits]
      : storedVisits;

  return mergedVisits
    .sort(
      (a, b) =>
        getSessionTimelineSortValue(b.session) -
        getSessionTimelineSortValue(a.session),
    )
    .slice(0, 5);
};

const getReadingStatus = (
  reading: AirQualityReadings["ammonia"] | AirQualityReadings["h2s"],
) => (reading.online ? reading.status : "offline");

const getReadingStatusLabel = (
  reading: AirQualityReadings["ammonia"] | AirQualityReadings["h2s"],
) => {
  if (!reading.online) return "Offline";
  if (reading.status === "alert") return "Alert";
  if (reading.status === "watch") return "Watch";
  return "Normal";
};

const getLitterLevelStatus = (level: number) => {
  if (level <= 10) return "alert";
  if (level <= 25) return "watch";
  return "normal";
};

const getLitterLevelLabel = (level: number) => {
  if (level <= 10) return "Critical";
  if (level <= 25) return "Low";
  return "Normal";
};

function CatAvatar({
  cat,
  size,
  className,
}: {
  readonly cat: Cat;
  readonly size: 40 | 44;
  readonly className: string;
}) {
  return (
    <div className={className}>
      {cat.avatar ? (
        <Image
          src={cat.avatar}
          alt={cat.name}
          width={size}
          height={size}
          unoptimized
          className="w-full h-full object-cover"
        />
      ) : (
        cat.name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

function CatStatusBadge({
  status,
  includeIcon = false,
  className = "",
}: {
  readonly status: Cat["status"] | undefined;
  readonly includeIcon?: boolean;
  readonly className?: string;
}) {
  return (
    <span
      className={`${className} ${
        status === "normal" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      {getStatusLabel(status, includeIcon)}
    </span>
  );
}

function EmptyDashboardState({ onAddCat }: { readonly onAddCat: () => void }) {
  return (
    <section className="flex flex-col items-center justify-center text-center py-20">
      <div className="w-48 h-48 bg-litter-primary-light rounded-3xl flex items-center justify-center mb-8">
        <svg
          viewBox="0 0 24 24"
          className="w-20 h-20 text-litter-primary/40"
          fill="currentColor"
        >
          <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8ZM8.5 12C9.3 12 10 12.7 10 13.5C10 14.3 9.3 15 8.5 15C7.7 15 7 14.3 7 13.5C7 12.7 7.7 12 8.5 12ZM15.5 12C16.3 12 17 12.7 17 13.5C17 14.3 16.3 15 15.5 15C14.7 15 14 14.3 14 13.5C14 12.7 14.7 12 15.5 12ZM12 17C13.1 17 14 17.9 14 19H10C10 17.9 10.9 17 12 17Z" />
        </svg>
      </div>
      <h1 className="font-display text-2xl font-bold text-litter-text mb-2">
        Hello, welcome!
      </h1>
      <p className="text-litter-muted text-sm mb-2">
        Ready to start tracking your cat&apos;s health?
      </p>
      <h2 className="font-bold text-xl text-litter-text mb-3 mt-8">
        No cats registered yet
      </h2>
      <p className="text-litter-muted text-sm leading-relaxed max-w-xs mb-8">
        Keep track of your furry friend&apos;s health, bathroom habits,
        and weight trends by adding them to your dashboard.
      </p>
      <button
        onClick={onAddCat}
        className="w-full max-w-xs py-4 bg-litter-primary text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add your first cat
      </button>
    </section>
  );
}

function PopulatedDashboardState({
  cats,
  activeCatId,
  selectedCat,
  stats,
  greeting,
  userFirstName,
  todayDate,
  hasAnomaly,
  abnormalCat,
  isDismissedAbnormalReady,
  airQualityReadings,
  rfidStatus,
  trendData,
  recentVisits,
  onSelectCat,
  onViewAbnormalDetails,
  onDismissAbnormal,
}: {
  readonly cats: Cat[];
  readonly activeCatId: string;
  readonly selectedCat: Cat | undefined;
  readonly stats: CatStats | undefined;
  readonly greeting: string;
  readonly userFirstName: string;
  readonly todayDate: string;
  readonly hasAnomaly: boolean;
  readonly abnormalCat: Cat | undefined;
  readonly isDismissedAbnormalReady: boolean;
  readonly airQualityReadings: AirQualityReadings;
  readonly rfidStatus: SensorDisplayStatus;
  readonly trendData: CatTrendPoint[] | null;
  readonly recentVisits: RecentVisit[];
  readonly onSelectCat: (catId: string) => void;
  readonly onViewAbnormalDetails: () => void;
  readonly onDismissAbnormal: () => void;
}) {
  return (
    <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 lg:items-start">
      <div className="lg:sticky lg:top-24 lg:pt-6">
        <section className="mb-6 pt-6">
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-litter-text mb-1">
            {greeting}, {userFirstName} <span className="inline-block">👋</span>
          </h1>
          <p className="text-litter-muted text-sm sm:text-base">
            {hasAnomaly
              ? "Everything looks mostly okay today."
              : "Here\u2019s how your cats are doing today."}
          </p>
          <p className="text-litter-primary text-xs sm:text-sm font-medium mt-1">
            {todayDate}
          </p>
        </section>

        <section className="mb-6">
          <div className="flex flex-wrap gap-2">
            {cats.map((cat) => (
              <CatChip
                key={cat.id}
                cat={cat}
                isActive={activeCatId === cat.id}
                onClick={() => onSelectCat(cat.id)}
              />
            ))}
          </div>
        </section>

        {isDismissedAbnormalReady && abnormalCat && (
          <div className="overflow-hidden mb-6">
            <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 rounded-r-2xl rounded-l-sm p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-amber-100 rounded-full shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-amber-700 font-bold text-sm">
                    {abnormalCat.name} - Abnormal Behavior
                  </p>
                  <p className="text-litter-muted text-xs mt-1">
                    Abnormal litter box behavior detected today. Consider
                    logging a vet visit if symptoms persist.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onViewAbnormalDetails}
                  className="flex-1 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-sm font-semibold rounded-xl transition-colors border border-amber-200"
                >
                  View Details
                </button>
                <button
                  onClick={onDismissAbnormal}
                  className="px-4 py-2.5 bg-white/80 hover:bg-white text-amber-700 text-sm font-semibold rounded-xl transition-colors border border-amber-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedCat && (
          <div className="hidden lg:flex items-center justify-between p-4 bg-litter-card rounded-2xl border border-litter-border shadow-sm mb-6">
            <div className="flex items-center gap-3">
              <CatAvatar
                cat={selectedCat}
                size={44}
                className="w-11 h-11 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-lg overflow-hidden"
              />
              <div>
                <p className="font-semibold text-litter-text">
                  {selectedCat.name}
                </p>
                <p className="text-xs text-litter-muted">
                  Currently selected
                </p>
              </div>
            </div>
            <CatStatusBadge
              status={selectedCat.status}
              includeIcon
              className="text-xs px-3 py-1.5 rounded-full font-semibold"
            />
          </div>
        )}
      </div>

      <div className="lg:pt-6">
        {selectedCat && (
          <CatBehaviorTrends
            catName={selectedCat.name}
            todayVisits={stats?.visits ?? 0}
            todayAvgDuration={stats?.avgDuration || "--"}
            trendData={trendData}
          />
        )}

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-litter-text">
              Cat Stats
            </h2>
            <CatStatusBadge
              status={selectedCat?.status}
              className="lg:hidden text-xs px-2 py-1 rounded-full font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatCard
              icon={Clock}
              value={stats?.visits ?? "--"}
              label="Today's Visits"
              status={getVisitsStatus(stats?.visits ?? 0)}
              statusLabel={getVisitsLabel(stats?.visits ?? 0)}
            />
            <StatCard
              icon={Timer}
              value={stats?.avgDuration || "--"}
              label="Avg Duration"
              status={getDurationStatus(stats?.avgDuration || "")}
              statusLabel={getDurationLabel(stats?.avgDuration || "")}
            />
            <StatCard
              icon={Radio}
              value={rfidStatus.value}
              label="RFID Reader"
              status={rfidStatus.status}
              statusLabel={rfidStatus.label}
            />
          </div>
        </section>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-litter-text">
              Litter Box Environment
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatCard
              icon={Droplets}
              value={`${airQualityReadings.ammonia.ppm.toFixed(1)} ppm`}
              label="Urine Odor"
              subtitle="Ammonia (NH3)"
              status={getReadingStatus(airQualityReadings.ammonia)}
              statusLabel={getReadingStatusLabel(airQualityReadings.ammonia)}
            />
            <StatCard
              icon={CloudFog}
              value={`${airQualityReadings.h2s.ppm.toFixed(1)} ppm`}
              label="Stool Odor"
              subtitle="Hydrogen Sulfide (H2S)"
              status={getReadingStatus(airQualityReadings.h2s)}
              statusLabel={getReadingStatusLabel(airQualityReadings.h2s)}
            />
            <StatCard
              icon={Gauge}
              value={`${stats?.litterLevel ?? 0}%`}
              label="Litter Level"
              subtitle="Ultrasonic Sensor"
              status={getLitterLevelStatus(stats?.litterLevel ?? 0)}
              statusLabel={getLitterLevelLabel(stats?.litterLevel ?? 0)}
            />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-litter-text">
              Recent Activity
            </h2>
            <span className="text-litter-primary text-xs font-semibold">
              Realtime
            </span>
          </div>

          {recentVisits.length > 0 ? (
            <div className="space-y-3">
              {recentVisits.map(({ cat, session }) => (
                <SessionTimelineCard
                  key={session.id}
                  cat={cat}
                  session={session}
                />
              ))}
            </div>
          ) : (
            <div className="p-6 bg-litter-card rounded-xl border border-litter-border text-center">
              <p className="text-sm font-semibold text-litter-text">
                Waiting for RFID visits
              </p>
              <p className="text-xs text-litter-muted mt-1">
                Tap the key fob near the antenna to record the first visit.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isLoading: notificationsLoading, upsertNotification } = useNotifications();
  const {
    cats,
    getCatById,
    getDetailsByCatId,
    getStatsByCatId,
    getTrendData,
    sessions,
  } = useCats();
  const [selectedCatId, setSelectedCatId] = useState(cats[0]?.id || "");
  const {
    data: sensorData,
    isLoading: sensorsLoading,
    error: sensorsError,
  } = useDeviceSensors();
  const airQualityReadings = useAirQualityReadings();

  // ── Notification permission hook — MUST be inside the component ──
  const {
    triggerOnAnomaly,
  } = useNotificationPermission();

  const activeCatId = useMemo(() => {
    if (cats.some((cat) => cat.id === selectedCatId)) return selectedCatId;
    return cats[0]?.id || "";
  }, [cats, selectedCatId]);

  const selectedCat = useMemo(() => getCatById(activeCatId), [activeCatId, getCatById]);
  const stats = useMemo(() => getStatsByCatId(activeCatId), [activeCatId, getStatsByCatId]);
  const trendData = useMemo(() => getTrendData(activeCatId), [activeCatId, getTrendData]);

  const abnormalCats = useMemo(
    () => cats.filter((cat) => cat.status === "abnormal"),
    [cats],
  );
  const hasAnomaly = abnormalCats.length > 0;
  const {
    dismissedAbnormalKeys,
    isDismissedAbnormalReady,
    setDismissedAbnormalKeys,
  } = useDismissedAbnormalKeys(abnormalCats);
  const abnormalCat = useMemo(
    () => abnormalCats.find((cat) => !dismissedAbnormalKeys.includes(getAbnormalSignature(cat))),
    [abnormalCats, dismissedAbnormalKeys],
  );
  const abnormalNotificationPayloads = useMemo(() => {
    const dateKey = getLocalDateKey();

    return abnormalCats.map((cat) => {
      const abnormalStats = getStatsByCatId(cat.id);
      const visitCount = abnormalStats?.visits ?? 0;
      const avgDuration = abnormalStats?.avgDuration ?? "--";
      return {
        type: "health" as const,
        title: `${cat.name} - Abnormal Behavior`,
        message: buildAbnormalNotificationMessage(visitCount, avgDuration),
        source: "dashboard_abnormal" as const,
        abnormalKey: getAbnormalNotificationKey(cat, dateKey),
        catId: cat.id,
        catName: cat.name,
        route: `/dashboard/cats/${cat.id}`,
        status: "abnormal" as const,
        visitCount,
        avgDuration,
      };
    });
  }, [abnormalCats, getStatsByCatId]);

  useEffect(() => {
    if (notificationsLoading || abnormalNotificationPayloads.length === 0) return;

    const syncAbnormalNotifications = async () => {
      for (const notification of abnormalNotificationPayloads) {
        await upsertNotification(notification);
      }
    };

    void syncAbnormalNotifications();
  }, [abnormalNotificationPayloads, notificationsLoading, upsertNotification]);

  const handleViewAbnormalDetails = () => {
    if (!abnormalCat) return;
    router.push(`/dashboard/cats/${abnormalCat.id}`);
  };

  const handleDismissAbnormal = () => {
    if (!abnormalCat) return;

    const abnormalKey = getAbnormalSignature(abnormalCat);
    setDismissedAbnormalKeys((prev) => (
      prev.includes(abnormalKey) ? prev : [...prev, abnormalKey]
    ));
  };

  // ── Trigger permission prompt when anomaly is detected ──
  useEffect(() => {
    if (hasAnomaly) {
      triggerOnAnomaly();
    }
  }, [hasAnomaly, triggerOnAnomaly]);

  const rfidStatus = getLiveRfidStatus({
    sensorData,
    sensorsLoading,
    sensorsError,
  });
  const isEmpty = cats.length === 0;
  const liveVisit = buildLiveSessionVisit(sensorData, cats, getDetailsByCatId);
  const recentVisits = getRecentVisits(sessions, getCatById, liveVisit);
  const greeting = getGreeting();
  const todayDate = formatDate();
  const userFirstName = getUserFirstName(user?.displayName);

  return (
    <div className="min-h-screen bg-litter-bg pb-24">
      <TopBar />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        {isEmpty ? (
          <EmptyDashboardState onAddCat={() => router.push("/dashboard/cats")} />
        ) : (
          <PopulatedDashboardState
            cats={cats}
            activeCatId={activeCatId}
            selectedCat={selectedCat}
            stats={stats}
            greeting={greeting}
            userFirstName={userFirstName}
            todayDate={todayDate}
            hasAnomaly={hasAnomaly}
            abnormalCat={abnormalCat}
            isDismissedAbnormalReady={isDismissedAbnormalReady}
            airQualityReadings={airQualityReadings}
            rfidStatus={rfidStatus}
            trendData={trendData}
            recentVisits={recentVisits}
            onSelectCat={setSelectedCatId}
            onViewAbnormalDetails={handleViewAbnormalDetails}
            onDismissAbnormal={handleDismissAbnormal}
          />
        )}
      </main>

      <BottomNav />
    </div>
  );
}


