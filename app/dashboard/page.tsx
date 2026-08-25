/**
 * Dashboard / Home Page
 *
 * Per-cat activity overview backed by Firebase, with display-only demo fallbacks.
 *
 * DONE: evidence-aware badges, no-data values, state legend, cat selection,
 * activity trends, live environment readings, and recent-session timeline
 * PLACEHOLDER: live-only sessions use zero sensor deltas until persisted values arrive
 *
 * NEXT: device integration owners should replace temporary live-session deltas
 * when the sensor payload supplies them.
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
  Radio,
  Timer,
} from "lucide-react";
import {
  useNotifications,
  type AppNotification,
} from "@/lib/contexts/NotificationContext";
import { useCats } from "@/lib/contexts/CatContext";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { StatCard } from "@/components/dashboard/StatCard";
import { SessionTimelineCard } from "@/components/dashboard/SessionTimelineCard";
import { CatBehaviorTrends } from "@/components/dashboard/CatBehaviorTrends";
import { CatChip } from "@/components/cats/CatChip";
import { BehaviorStateBadge } from "@/components/behavior/BehaviorStateBadge";
import { BehaviorStateLegend } from "@/components/behavior/BehaviorStateLegend";
import { DashboardContentSkeleton } from "@/components/ui/AppLoadingSkeletons";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { useDeviceSensors, type DeviceSensors } from "@/lib/hooks/useDeviceSensors";
import { useAirQualityReadings, type AirQualityReadings } from "@/lib/hooks/useAirQualityReadings";
import {
  getLiveRfidStatus,
  type SensorDisplayStatus,
} from "@/lib/utils/liveSensorStatus";
import { getSessionSortValue } from "@/lib/utils/sessionTime";
import {
  getDisplayTodayStats,
  getFallbackAverageDuration,
} from "@/lib/utils/dashboardBehaviorMetrics";
import type { Cat } from "@/lib/interfaces/Cat";
import type { CatDetails } from "@/lib/interfaces/CatDetails";
import type { Session } from "@/lib/interfaces/Session";
import type { CatTrendPoint } from "@/lib/contexts/CatContext";
import {
  BEHAVIOR_STATE_BY_ID,
  formatMetricValue,
  getCatDisplayState,
  hasEstablishedBaseline,
  hasRecordedCatData,
  type BehaviorStateId,
} from "@/lib/presentation/behaviorStates";
import {
  DASHBOARD_DURATION_UPPER_MINS,
  DASHBOARD_DURATION_WARNING_MINS,
  DASHBOARD_VISIT_UPPER_COUNT,
  DASHBOARD_VISIT_WARNING_COUNT,
  INCOMPLETE_SESSION_FLOOR_SECS,
} from "@/lib/configs/behaviorThresholds";

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
  // NOTE(manuscript): The state name in this owner notification must match the paper.
  const visitLabel = `${visitCount} visit${visitCount === 1 ? "" : "s"} logged`;
  const durationLabel = avgDuration && avgDuration !== "--"
    ? `avg duration ${avgDuration}`
    : "avg duration unavailable";

  return `${BEHAVIOR_STATE_BY_ID.abnormal.label} litter box behavior detected today. ${visitLabel}, ${durationLabel}.`;
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

const getVisitsStatus = (
  visits: number,
  canClassify: boolean,
): BehaviorStateId => {
  if (!canClassify) return "insufficient";
  if (visits > DASHBOARD_VISIT_WARNING_COUNT) return "abnormal";
  return "normal";
};

const getVisitsLabel = (visits: number, canClassify: boolean) => {
  if (!canClassify) return BEHAVIOR_STATE_BY_ID.insufficient.label;
  if (visits > DASHBOARD_VISIT_UPPER_COUNT) return BEHAVIOR_STATE_BY_ID.abnormal.label;
  if (visits > DASHBOARD_VISIT_WARNING_COUNT) return BEHAVIOR_STATE_BY_ID.abnormal.label;
  return BEHAVIOR_STATE_BY_ID.normal.label;
};

const getDurationLabel = (duration: string, canClassify: boolean) => {
  if (!canClassify || duration === "No data yet") {
    return BEHAVIOR_STATE_BY_ID.insufficient.label;
  }
  const mins = Number.parseInt(duration);
  if (mins >= DASHBOARD_DURATION_UPPER_MINS) return BEHAVIOR_STATE_BY_ID.abnormal.label;
  if (mins >= DASHBOARD_DURATION_WARNING_MINS) return BEHAVIOR_STATE_BY_ID.abnormal.label;
  return BEHAVIOR_STATE_BY_ID.normal.label;
};

const getDurationStatus = (
  duration: string,
  canClassify: boolean,
): BehaviorStateId => {
  if (!canClassify || duration === "No data yet") return "insufficient";
  const mins = Number.parseInt(duration);
  if (mins >= DASHBOARD_DURATION_WARNING_MINS) return "abnormal";
  return "normal";
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

type RecentVisitGroup = {
  readonly dateKey: string;
  readonly dateLabel: string;
  readonly visits: RecentVisit[];
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

const getSessionActivityDateKey = (session: Session) => {
  const exactDateCandidates = [session.endedAt, session.startedAt];

  for (const candidate of exactDateCandidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return getLocalDateKey(parsed);
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(session.date)) {
    return session.date;
  }

  const parsedDate = new Date(session.date);
  return Number.isNaN(parsedDate.getTime())
    ? getLocalDateKey(new Date(getSessionTimelineSortValue(session)))
    : getLocalDateKey(parsedDate);
};

const getRecentActivityDateLabel = (dateKey: string, today = new Date()) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (dateKey === getLocalDateKey(today)) return "Today";
  if (dateKey === getLocalDateKey(yesterday)) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const groupRecentVisitsByDate = (visits: RecentVisit[]): RecentVisitGroup[] =>
  visits.reduce<RecentVisitGroup[]>((groups, visit) => {
    const dateKey = getSessionActivityDateKey(visit.session);
    const currentGroup = groups.at(-1);

    if (currentGroup?.dateKey === dateKey) {
      currentGroup.visits.push(visit);
      return groups;
    }

    groups.push({
      dateKey,
      dateLabel: getRecentActivityDateLabel(dateKey),
      visits: [visit],
    });
    return groups;
  }, []);

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
      // FIXME(defense): Live-only cards show zero gas deltas because the
      // current device payload has no final per-session delta values.
      mq135Delta: 0,
      mq136Delta: 0,
      anomaly: false,
      anomalyType: null,
      sessionStatus: "IN_PROGRESS",
    },
  };
};

const buildCompletedLiveSessionVisit = (
  sensorData: DeviceSensors | null,
  cats: Cat[],
  getDetailsByCatId: (id: string) => CatDetails | undefined,
): RecentVisit | null => {
  if (!sensorData?.online || sensorData.sessionActive) return null;

  const status = sensorData.lastSessionStatus;
  if (
    sensorData.completedSessionCount === null ||
    sensorData.completedSessionCount <= 0 ||
    (status !== "NORMAL" &&
      status !== "ABNORMAL" &&
      status !== "SHORT_SESSION" &&
      status !== "NO_EXIT_TIMEOUT")
  ) {
    return null;
  }

  const activeCard = sensorData.activeRfidCard || sensorData.rfidCard;
  const activeHex = sensorData.activeRfidHex || sensorData.rfidHex;
  if (!activeCard && !activeHex) return null;

  const cat = cats.find((candidate) =>
    rfidMatches(getDetailsByCatId(candidate.id), activeCard, activeHex),
  );
  if (!cat) return null;

  const endedMs = sensorData.lastSessionEndMs ?? Date.now();
  const durationMs =
    sensorData.lastSessionDurationMs ??
    sensorData.activeSessionDurationMs ??
    1000;
  const durationSecs = Math.max(1, Math.round(durationMs / 1000));
  const endedAt = new Date(endedMs);

  return {
    cat,
    session: {
      id: `completed-rfid-${cat.id}-${sensorData.completedSessionCount}-${endedMs}`,
      catId: cat.id,
      date: getLocalDateKey(endedAt),
      time: endedAt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      startedAt: new Date(endedAt.getTime() - durationSecs * 1000).toISOString(),
      endedAt: endedAt.toISOString(),
      durationSecs,
      mq135Delta: 0,
      mq136Delta: 0,
      anomaly: status !== "NORMAL",
      anomalyType:
        status === "NO_EXIT_TIMEOUT"
          ? "No exit timeout"
          : status === "SHORT_SESSION"
            ? "Short session"
            : status === "ABNORMAL"
              ? "Extended duration"
              : null,
      sessionStatus: status,
    },
  };
};

const parseDurationFromNotification = (message: string) => {
  const minuteMatch = message.match(/(\d+)m\s*(\d+)s/);
  if (minuteMatch) {
    const minutes = Number.parseInt(minuteMatch[1], 10);
    const seconds = Number.parseInt(minuteMatch[2], 10);
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return Math.max(1, minutes * 60 + seconds);
    }
  }

  const secondMatch = message.match(/(\d+)\s*s/);
  if (secondMatch) {
    const seconds = Number.parseInt(secondMatch[1], 10);
    if (Number.isFinite(seconds)) {
      return Math.max(1, seconds);
    }
  }

  return 1;
};

const buildNotificationRecentVisits = (
  notifications: AppNotification[],
  cats: Cat[],
): RecentVisit[] => {
  if (notifications.length === 0 || cats.length === 0) return [];

  const visits: RecentVisit[] = [];

  for (const notification of notifications) {
    if (
      notification.type !== "cat_visit" ||
      notification.source !== "rfid_visit" ||
      typeof notification.catId !== "string" ||
      typeof notification.title !== "string" ||
      !notification.title.toLowerCase().includes("left the litter box") ||
      typeof notification.message !== "string" ||
      typeof notification.createdAt?.toDate !== "function"
    ) {
      continue;
    }

    const cat = cats.find((candidate) => candidate.id === notification.catId);
    if (!cat) continue;

    const endedAt = notification.createdAt.toDate();
    if (Number.isNaN(endedAt.getTime())) continue;
    const durationSecs = parseDurationFromNotification(notification.message);

    visits.push({
      cat,
      session: {
        id: `live-notification-${cat.id}-${endedAt.getTime()}`,
        catId: cat.id,
        date: getLocalDateKey(endedAt),
        time: endedAt.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
        startedAt: new Date(endedAt.getTime() - durationSecs * 1000).toISOString(),
        endedAt: endedAt.toISOString(),
        durationSecs,
        mq135Delta: 0,
        mq136Delta: 0,
        anomaly: false,
        anomalyType: null,
        sessionStatus:
          durationSecs < INCOMPLETE_SESSION_FLOOR_SECS
            ? "SHORT_SESSION"
            : "NORMAL",
      },
    });
  }

  return visits;
};

const hasOverlappingLiveSession = (sessions: Session[], liveSession: Session) => {
  const liveStartedAt = getSessionStartedAt(liveSession);

  return sessions.some((session) => {
    if (session.id.startsWith("demo-")) return false;
    if (session.catId !== liveSession.catId) return false;
    if (session.sessionStatus === "IN_PROGRESS" || !session.endedAt) return true;

    const startedAt = getSessionStartedAt(session);
    return Math.abs(startedAt - liveStartedAt) < 30_000;
  });
};

const hasOverlappingRecentVisit = (sessions: Session[], candidate: Session) => {
  const candidateTime = getSessionTimelineSortValue(candidate);

  return sessions.some((session) => {
    if (session.id.startsWith("demo-")) return false;
    if (session.catId !== candidate.catId) return false;

    const sessionTime = getSessionTimelineSortValue(session);
    return Math.abs(sessionTime - candidateTime) < 30_000;
  });
};

const getRecentVisits = (
  sessions: Session[],
  getCatById: (id: string) => Cat | undefined,
  liveVisit: RecentVisit | null,
  completedLiveVisit: RecentVisit | null,
  notificationVisits: RecentVisit[],
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

  if (
    completedLiveVisit &&
    !storedVisits.some(
      (visit) =>
        visit.session.catId === completedLiveVisit.session.catId &&
        visit.session.sessionStatus === completedLiveVisit.session.sessionStatus &&
        visit.session.durationSecs === completedLiveVisit.session.durationSecs &&
        visit.session.endedAt === completedLiveVisit.session.endedAt,
    )
  ) {
    mergedVisits.unshift(completedLiveVisit);
  }

  if (notificationVisits.length > 0) {
    const dedupedNotifications = notificationVisits.filter(
      (visit, index, list) =>
        !list
          .slice(0, index)
          .some((prior) => hasOverlappingRecentVisit([prior.session], visit.session)),
    );

    for (const notificationVisit of dedupedNotifications) {
      if (hasOverlappingRecentVisit(mergedVisits.map((visit) => visit.session), notificationVisit.session)) {
        continue;
      }
      mergedVisits.unshift(notificationVisit);
    }
  }

  return mergedVisits
    .sort(
      (a, b) =>
        getSessionTimelineSortValue(b.session) -
        getSessionTimelineSortValue(a.session),
    );
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

function DashboardLoadingState() {
  return <DashboardContentSkeleton />;
}

function PopulatedDashboardState({
  cats,
  activeCatId,
  selectedCat,
  catDisplayStates,
  stats,
  todayDate,
  selectedHasData,
  selectedBaselineEstablished,
  abnormalCat,
  isDismissedAbnormalReady,
  airQualityReadings,
  rfidStatus,
  trendData,
  recentVisits,
  displayAvgDuration,
  onSelectCat,
  onViewAbnormalDetails,
  onDismissAbnormal,
}: {
  readonly cats: Cat[];
  readonly activeCatId: string;
  readonly selectedCat: Cat | undefined;
  readonly catDisplayStates: Readonly<Record<string, BehaviorStateId>>;
  readonly stats:
    | {
        readonly visits: number;
        readonly avgDuration: string;
      }
    | undefined;
  readonly todayDate: string;
  readonly selectedHasData: boolean;
  readonly selectedBaselineEstablished: boolean;
  readonly abnormalCat: Cat | undefined;
  readonly isDismissedAbnormalReady: boolean;
  readonly airQualityReadings: AirQualityReadings;
  readonly rfidStatus: SensorDisplayStatus;
  readonly trendData: CatTrendPoint[] | null;
  readonly recentVisits: RecentVisit[];
  readonly displayAvgDuration: string;
  readonly onSelectCat: (catId: string) => void;
  readonly onViewAbnormalDetails: () => void;
  readonly onDismissAbnormal: () => void;
}) {
  const [showAllRecentActivity, setShowAllRecentActivity] = useState(false);
  const visibleRecentVisits = useMemo(
    () => (
      showAllRecentActivity
        ? recentVisits
        : recentVisits.slice(0, 3)
    ),
    [recentVisits, showAllRecentActivity],
  );
  const recentActivityGroups = useMemo(
    () => groupRecentVisitsByDate(visibleRecentVisits),
    [visibleRecentVisits],
  );
  const canToggleRecentActivity = recentVisits.length > 3;
  const selectedDisplayState = selectedCat
    ? catDisplayStates[selectedCat.id] ?? "insufficient"
    : "insufficient";
  const canClassifyMetrics = selectedHasData && selectedBaselineEstablished;
  const displayVisits = formatMetricValue(stats?.visits ?? 0, selectedHasData);
  const displayDuration = formatMetricValue(displayAvgDuration, selectedHasData);

  return (
    <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 lg:items-start">
      <div className="lg:sticky lg:top-24 lg:pt-6">
        <section className="mb-6 pt-6">
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
                displayState={catDisplayStates[cat.id] ?? "insufficient"}
                onClick={() => onSelectCat(cat.id)}
              />
            ))}
          </div>
        </section>

        {isDismissedAbnormalReady && abnormalCat && (
          /* NOTE(manuscript): Alert state names and owner guidance must match the capstone paper. */
          <div className="overflow-hidden mb-6">
            <div className="bg-status-warning border border-status-warning border-l-4 border-l-litter-warning rounded-r-2xl rounded-l-sm p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-litter-warning-bg rounded-full shrink-0 border border-litter-warning-border">
                  <AlertTriangle className="w-5 h-5 text-litter-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-status-warning font-bold text-sm">
                    {abnormalCat.name} - {BEHAVIOR_STATE_BY_ID.abnormal.label} Behavior
                  </p>
                  <p className="text-litter-muted text-xs mt-1">
                    {BEHAVIOR_STATE_BY_ID.abnormal.label} litter box behavior detected today. Consider
                    logging a vet visit if symptoms persist.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onViewAbnormalDetails}
                  className="flex-1 py-2.5 bg-litter-warning-bg hover:bg-litter-warning/20 text-status-warning text-sm font-semibold rounded-xl transition-colors border border-status-warning"
                >
                  View Details
                </button>
                <button
                  onClick={onDismissAbnormal}
                  className="px-4 py-2.5 bg-litter-card hover:bg-litter-card-hover text-status-warning text-sm font-semibold rounded-xl transition-colors border border-status-warning"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedCat && (
          <div className="flex items-center justify-between p-4 bg-litter-card rounded-2xl border border-litter-border shadow-sm mb-6">
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
            <BehaviorStateBadge state={selectedDisplayState} />
          </div>
        )}

        <BehaviorStateLegend compact collapsible className="mb-6 lg:hidden" />
        <BehaviorStateLegend compact className="mb-6 hidden lg:block" />
      </div>

      <div className="lg:pt-6">
        {selectedCat && (
          <CatBehaviorTrends
            key={selectedCat.id}
            catName={selectedCat.name}
            todayVisits={displayVisits}
            todayAvgDuration={String(displayDuration)}
            trendData={trendData}
          />
        )}

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-litter-text">
              Cat Stats
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <StatCard
              icon={Clock}
              value={displayVisits}
              label="Today's Visits"
              status={getVisitsStatus(stats?.visits ?? 0, canClassifyMetrics)}
              statusLabel={getVisitsLabel(stats?.visits ?? 0, canClassifyMetrics)}
            />
            <StatCard
              icon={Timer}
              value={displayDuration}
              label="Avg Duration"
              status={getDurationStatus(String(displayDuration), canClassifyMetrics)}
              statusLabel={getDurationLabel(String(displayDuration), canClassifyMetrics)}
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
              value={airQualityReadings.ammonia.displayValue}
              label="Urine Odor"
              subtitle="Ammonia (NH3)"
              status={getReadingStatus(airQualityReadings.ammonia)}
              statusLabel={getReadingStatusLabel(airQualityReadings.ammonia)}
            />
            <StatCard
              icon={CloudFog}
              value={airQualityReadings.h2s.displayValue}
              label="Stool Odor"
              subtitle="Hydrogen Sulfide (H2S)"
              status={getReadingStatus(airQualityReadings.h2s)}
              statusLabel={getReadingStatusLabel(airQualityReadings.h2s)}
            />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-litter-text">
              Recent Activity
            </h2>
            {canToggleRecentActivity ? (
              <button
                onClick={() => setShowAllRecentActivity((prev) => !prev)}
                className="text-sm font-semibold text-litter-primary hover:underline"
              >
                {showAllRecentActivity ? "SHOW LESS" : "VIEW ALL"}
              </button>
            ) : (
              <span className="text-litter-primary text-xs font-semibold">
                Realtime
              </span>
            )}
          </div>

          {recentVisits.length > 0 ? (
            <div className="space-y-5">
              {recentActivityGroups.map((group) => (
                <div key={group.dateKey} className="space-y-3">
                  <h3 className="text-xs font-semibold text-litter-muted">
                    {group.dateLabel}
                  </h3>
                  {group.visits.map(({ cat, session }) => (
                    <SessionTimelineCard
                      key={session.id}
                      cat={cat}
                      session={session}
                    />
                  ))}
                </div>
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
  const {
    isLoading: notificationsLoading,
    upsertNotification,
    notifications,
  } = useNotifications();
  const {
    cats,
    getCatById,
    getDetailsByCatId,
    getSessionsByCatId,
    getStatsByCatId,
    getTrendData,
    isUsingDemoData,
    isLoading: catsLoading,
  } = useCats();
  const [selectedCatId, setSelectedCatId] = useState(cats[0]?.id || "");
  const {
    data: sensorData,
    isLoading: sensorsLoading,
    error: sensorsError,
  } = useDeviceSensors();
  const airQualityReadings = useAirQualityReadings(
    sensorData,
    sensorsLoading,
    sensorsError,
  );

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
  const displaySessions = useMemo(
    () => cats.flatMap((cat) => getSessionsByCatId(cat.id)),
    [cats, getSessionsByCatId],
  );
  const catPresentation = useMemo(
    () =>
      Object.fromEntries(
        cats.map((cat) => {
          const catSessions = getSessionsByCatId(cat.id);
          const catStats = getStatsByCatId(cat.id);
          const catTrendData = getTrendData(cat.id);
          const baselineEstablished = hasEstablishedBaseline(getDetailsByCatId(cat.id));
          const hasData = hasRecordedCatData({
            sessions: catSessions,
            stats: catStats,
            trendData: catTrendData,
          });

          return [
            cat.id,
            {
              hasData,
              baselineEstablished,
              state: getCatDisplayState({
                persistedStatus: cat.status,
                hasData,
                baselineEstablished,
              }),
            },
          ];
        }),
      ) as Record<
        string,
        {
          readonly hasData: boolean;
          readonly baselineEstablished: boolean;
          readonly state: BehaviorStateId;
        }
      >,
    [cats, getDetailsByCatId, getSessionsByCatId, getStatsByCatId, getTrendData],
  );
  const catDisplayStates = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(catPresentation).map(([catId, presentation]) => [
          catId,
          presentation.state,
        ]),
      ),
    [catPresentation],
  );
  const selectedPresentation = catPresentation[activeCatId] ?? {
    hasData: false,
    baselineEstablished: false,
    state: "insufficient" as const,
  };

  const abnormalCats = useMemo(
    () => cats.filter((cat) => cat.status === "abnormal"),
    [cats],
  );
  const hasRealAnomaly = abnormalCats.some((cat) => !isUsingDemoData(cat.id));
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

    return abnormalCats.filter((cat) => !isUsingDemoData(cat.id)).map((cat) => {
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
  }, [abnormalCats, getStatsByCatId, isUsingDemoData]);

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
    if (hasRealAnomaly) {
      triggerOnAnomaly();
    }
  }, [hasRealAnomaly, triggerOnAnomaly]);

  const rfidStatus = getLiveRfidStatus({
    sensorData,
    sensorsLoading,
    sensorsError,
  });
  const isEmpty = !catsLoading && cats.length === 0;
  const liveVisit = buildLiveSessionVisit(sensorData, cats, getDetailsByCatId);
  const completedLiveVisit = buildCompletedLiveSessionVisit(
    sensorData,
    cats,
    getDetailsByCatId,
  );
  const notificationRecentVisits = buildNotificationRecentVisits(notifications, cats);
  const recentVisits = getRecentVisits(
    displaySessions,
    getCatById,
    liveVisit,
    completedLiveVisit,
    notificationRecentVisits,
  );
  const displayStats = useMemo(
    () =>
      getDisplayTodayStats(
        stats,
        recentVisits.map((visit) => visit.session),
        activeCatId,
        getLocalDateKey(),
      ),
    [activeCatId, recentVisits, stats],
  );
  const displayAvgDuration = useMemo(
    () =>
      getFallbackAverageDuration(
        displayStats?.avgDuration,
        trendData,
        displaySessions,
        activeCatId,
      ),
    [activeCatId, displaySessions, displayStats?.avgDuration, trendData],
  );
  const todayDate = formatDate();

  return (
    <div className="min-h-screen bg-litter-bg pb-24 lg:pb-10">
      <TopBar />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
        {catsLoading ? (
          <DashboardLoadingState />
        ) : isEmpty ? (
          <EmptyDashboardState onAddCat={() => router.push("/dashboard/cats")} />
        ) : (
          <PopulatedDashboardState
            cats={cats}
            activeCatId={activeCatId}
            selectedCat={selectedCat}
            catDisplayStates={catDisplayStates}
            stats={displayStats}
            todayDate={todayDate}
            selectedHasData={selectedPresentation.hasData}
            selectedBaselineEstablished={selectedPresentation.baselineEstablished}
            abnormalCat={abnormalCat}
            isDismissedAbnormalReady={isDismissedAbnormalReady}
            airQualityReadings={airQualityReadings}
            rfidStatus={rfidStatus}
            trendData={trendData}
            recentVisits={recentVisits}
            displayAvgDuration={displayAvgDuration}
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


