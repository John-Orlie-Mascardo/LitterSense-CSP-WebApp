/**
 * Dashboard / Home Page
 *
 * Per-cat activity overview backed by real Firebase data only.
 *
 * DONE: evidence-aware badges, no-data values, state legend, cat selection,
 * activity trends, live readings, recent-session preview, and History navigation
 * PLACEHOLDER: live-only sessions use zero sensor deltas until persisted values arrive
 *
 * NEXT: device integration owners should replace temporary live-session deltas
 * when the sensor payload supplies them.
 */

"use client";

import { getSessionActivityDateKey as getRecordedSessionDateKey, getLocalDateKey as getTodayDateKey } from "@/lib/utils/sessionDate";

import Image from "next/image";
import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  CloudFog,
  Droplets,
  Timer,
} from "lucide-react";
import { useNotifications } from "@/lib/contexts/NotificationContext";
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
import { useDeviceSensors } from "@/lib/hooks/useDeviceSensors";
import { useAirQualityReadings, type AirQualityReadings } from "@/lib/hooks/useAirQualityReadings";
import {
  getLiveAirQualityStatus,
  type SensorDisplayStatus,
} from "@/lib/utils/liveSensorStatus";
import { getSessionSortValue } from "@/lib/utils/sessionTime";
import { buildRfidActivityVisits, mergeRfidActivityVisits, type RfidActivityVisit } from "@/lib/utils/rfidActivity";
import {
  getDisplayTodayStats,
  getFallbackAverageDuration,
} from "@/lib/utils/dashboardBehaviorMetrics";
import type { Cat } from "@/lib/interfaces/Cat";
import type { Session } from "@/lib/interfaces/Session";
import type { CatTrendPoint } from "@/lib/contexts/CatContext";
import {
  BEHAVIOR_STATE_BY_ID,
  formatMetricValue,
  getSessionDisplayState,
  getMostSevereState,
  hasEstablishedBaseline,
  hasRecordedCatData,
  type BehaviorStateId,
} from "@/lib/presentation/behaviorStates";
import {
  buildCatTrendReferences,
  type TrendReferenceSet,
} from "@/lib/presentation/trendCharts";

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

type RecentVisit = RfidActivityVisit;

type RecentVisitGroup = {
  readonly dateKey: string;
  readonly dateLabel: string;
  readonly visits: RecentVisit[];
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

const getRecentVisits = (
  sessions: Session[],
  getCatById: (id: string) => Cat | undefined,
  liveVisits: RecentVisit[],
): RecentVisit[] => mergeRfidActivityVisits(sessions, getCatById, liveVisits).sort((a, b) =>
  getSessionTimelineSortValue(b.session) - getSessionTimelineSortValue(a.session),
);

const getReadingStatus = (
  reading: AirQualityReadings["ammonia"] | AirQualityReadings["h2s"],
  connection: SensorDisplayStatus,
) => (!reading.online || reading.displayValue === "Syncing" || ["Unavailable", "Status unavailable", "Stale"].includes(connection.value) ? connection.status : reading.status);

const getReadingStatusLabel = (
  reading: AirQualityReadings["ammonia"] | AirQualityReadings["h2s"],
  connection: SensorDisplayStatus,
) => {
  if (!reading.online || reading.displayValue === "Syncing" || ["Unavailable", "Status unavailable", "Stale"].includes(connection.value)) return connection.label;
  if (reading.status === "alert") return "Alert";
  if (reading.status === "watch") return "Watch";
  return "Normal";
};

const sensorSubtitle = (name: string, status: SensorDisplayStatus) => status.lastUpdatedAt
  ? `${name ? `${name} · ` : ""}Last update: ${new Date(status.lastUpdatedAt).toLocaleString()}`
  : name;

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
          style={{ width: "100%", height: "100%" }}
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
        {/* NOTE(manuscript): Dashboard copy no longer promises weight tracking. */}
        and visit trends by adding them to your dashboard.
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
  airQualityReadings,
  airQualityStatus,
  trendData,
  trendReferences,
  recentVisits,
  displayAvgDuration,
  historyLoading,
  onSelectCat,
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
  readonly airQualityReadings: AirQualityReadings;
  readonly airQualityStatus: SensorDisplayStatus;
  readonly trendData: CatTrendPoint[] | null;
  readonly trendReferences: TrendReferenceSet | null;
  readonly recentVisits: RecentVisit[];
  readonly displayAvgDuration: string;
  readonly historyLoading: boolean;
  readonly onSelectCat: (catId: string) => void;
}) {
  const visibleRecentVisits = useMemo(
    () => recentVisits.slice(0, 3),
    [recentVisits],
  );
  const recentActivityGroups = useMemo(
    () => groupRecentVisitsByDate(visibleRecentVisits),
    [visibleRecentVisits],
  );
  const selectedDisplayState = selectedCat
    ? catDisplayStates[selectedCat.id] ?? "insufficient"
    : "insufficient";
  const displayVisits = historyLoading ? "Loading" : formatMetricValue(stats?.visits ?? 0, selectedHasData);
  const displayDuration = historyLoading ? "Loading" : formatMetricValue(displayAvgDuration, selectedHasData);

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
            <span className="text-xs text-litter-muted">Today</span><BehaviorStateBadge state={selectedDisplayState} />
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
            trendData={historyLoading ? null : trendData}
            isLoading={historyLoading}
            references={trendReferences}
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
              status={selectedDisplayState}
              statusLabel={historyLoading ? "Loading history" : selectedDisplayState === "insufficient" && selectedHasData && !selectedBaselineEstablished ? "No baseline yet" : BEHAVIOR_STATE_BY_ID[selectedDisplayState].label}
            />
            <StatCard
              icon={Timer}
              value={displayDuration}
              label="Avg Duration"
              status={selectedDisplayState}
              statusLabel={historyLoading ? "Loading history" : selectedDisplayState === "insufficient" && selectedHasData && !selectedBaselineEstablished ? "No baseline yet" : BEHAVIOR_STATE_BY_ID[selectedDisplayState].label}
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
              value={["Unavailable", "Status unavailable", "Stale"].includes(airQualityStatus.value) ? airQualityStatus.value : airQualityReadings.ammonia.displayValue}
              label="Urine Odor"
              subtitle={sensorSubtitle("Urine", airQualityStatus)}
              status={getReadingStatus(airQualityReadings.ammonia, airQualityStatus)}
              statusLabel={getReadingStatusLabel(airQualityReadings.ammonia, airQualityStatus)}
            />
            <StatCard
              icon={CloudFog}
              value={["Unavailable", "Status unavailable", "Stale"].includes(airQualityStatus.value) ? airQualityStatus.value : airQualityReadings.h2s.displayValue}
              label="Stool Odor"
              subtitle={sensorSubtitle("Stool", airQualityStatus)}
              status={getReadingStatus(airQualityReadings.h2s, airQualityStatus)}
              statusLabel={getReadingStatusLabel(airQualityReadings.h2s, airQualityStatus)}
            />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-litter-text">
              Recent Activity
            </h2>
            <Link
              href="/dashboard/history"
              className="text-sm font-semibold text-litter-primary hover:underline"
            >
              VIEW ALL
            </Link>
          </div>

          {recentVisits.length > 0 ? (
            <div className="space-y-5">
              {recentActivityGroups.map((group) => (
                <div key={group.dateKey} className="space-y-3">
                  <h3 className="text-xs font-semibold text-litter-muted">
                    {group.dateLabel}
                  </h3>
                  {group.visits.map(({ cat, session, liveUpdatePending }) => (
                    <SessionTimelineCard
                      key={session.id}
                      cat={cat}
                      session={session}
                      liveUpdatePending={liveUpdatePending}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 bg-litter-card rounded-xl border border-litter-border text-center">
              <p className="text-sm font-semibold text-litter-text">
                {historyLoading ? "Loading recent activity" : "Waiting for RFID visits"}
              </p>
              <p className="text-xs text-litter-muted mt-1">
                {historyLoading ? "New RFID entries and exits will appear as they arrive." : "Tap the key fob near the antenna to record the first visit."}
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
  } = useNotifications();
  const {
    cats,
    getCatById,
    getDetailsByCatId,
    getSessionsByCatId,
    getStatsByCatId,
    getTrendData,
    isLoading: catsLoading,
    historyLoading,
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
  const trendReferences = useMemo(
    () => buildCatTrendReferences(getDetailsByCatId(activeCatId)?.baseline),
    [activeCatId, getDetailsByCatId],
  );
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
              state: getMostSevereState(catSessions
                .filter((session) => getRecordedSessionDateKey(session) === getTodayDateKey())
                .map((session) => getSessionDisplayState({ ...session, isAttributed: Boolean(session.catId), baselineEstablished }))),
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
  const hasRealAnomaly = abnormalCats.length > 0;
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

  // ── Trigger permission prompt when anomaly is detected ──
  useEffect(() => {
    if (hasRealAnomaly) {
      triggerOnAnomaly();
    }
  }, [hasRealAnomaly, triggerOnAnomaly]);

  const airQualityStatus = getLiveAirQualityStatus({ sensorData, sensorsLoading, sensorsError });
  const isEmpty = !catsLoading && cats.length === 0;
  const liveVisits = buildRfidActivityVisits(sensorData, cats, getDetailsByCatId);
  const recentVisits = getRecentVisits(displaySessions, getCatById, liveVisits);
  const displayStats = useMemo(
    () =>
      getDisplayTodayStats(
        stats,
        displaySessions,
        activeCatId,
        getLocalDateKey(),
      ),
    [activeCatId, displaySessions, stats],
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
            airQualityReadings={airQualityReadings}
            airQualityStatus={airQualityStatus}
            trendData={trendData}
            trendReferences={trendReferences}
            recentVisits={recentVisits}
            displayAvgDuration={displayAvgDuration}
            historyLoading={historyLoading}
            onSelectCat={setSelectedCatId}
          />
        )}
      </main>

      <BottomNav />
    </div>
  );
}
