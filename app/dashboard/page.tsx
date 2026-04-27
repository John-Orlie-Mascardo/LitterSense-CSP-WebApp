/**
 * Dashboard / Home Page (03.01.04)
 *
 * Three states:
 * 1. Empty — no cats registered, shows onboarding prompt
 * 2. Normal — cats registered, all healthy, no alert banner
 * 3. Anomaly — at least one cat flagged, alert banner visible
 *
 * The cat selector switches per-cat data (visits, duration).
 * Visits come from Firebase catStats, updated by live RFID scans.
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, Timer, Wind, BarChart2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useNotifications } from "@/lib/contexts/NotificationContext";
import { useCats } from "@/lib/contexts/CatContext";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { StatCard } from "@/components/dashboard/StatCard";
import { CatChip } from "@/components/cats/CatChip";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { useDeviceSensors } from "@/lib/hooks/useDeviceSensors";
import { formatDuration } from "@/lib/utils/formatters";

const DISMISSED_ALERTS_STORAGE_KEY = "dashboard-dismissed-alerts";

const getAlertSignature = (cat: { id: string; status: string }) => `${cat.id}:${cat.status}`;

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getAlertNotificationKey = (cat: { id: string; status: string }, dateKey: string) =>
  `dashboard-alert:${dateKey}:${cat.id}:${cat.status}`;

const buildAlertNotificationMessage = (visitCount: number, avgDuration: string) => {
  const visitLabel = `${visitCount} visit${visitCount === 1 ? "" : "s"} logged`;
  const durationLabel = avgDuration && avgDuration !== "--"
    ? `avg duration ${avgDuration}`
    : "avg duration unavailable";

  return `Unusual litter box behavior detected today. ${visitLabel}, ${durationLabel}.`;
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

const getAirQualityStatus = (quality: string) => {
  switch (quality) {
    case "Normal":
      return "healthy";
    case "Elevated":
      return "watch";
    case "Poor":
      return "alert";
    default:
      return "normal" as const;
  }
};

const isGasDetected = (label: string, raw: number | null | undefined) => {
  const normalized = label.toLowerCase();
  return raw === 0 || normalized.includes("gas") || normalized.includes("detected");
};

const getLiveAirQuality = (
  mq135: string | undefined,
  mq136: string | undefined,
  mq135Raw: number | null | undefined,
  mq136Raw: number | null | undefined,
): "Normal" | "Elevated" | "Poor" => {
  if (!mq135 || !mq136) return "Normal";
  if (isGasDetected(mq135, mq135Raw) || isGasDetected(mq136, mq136Raw)) {
    return "Poor";
  }
  return "Normal";
};

const getVisitsStatus = (visits: number) => {
  if (visits > 8) return "alert";
  if (visits > 6) return "watch";
  return "healthy";
};

const getVisitsLabel = (visits: number) => {
  if (visits > 8) return "Abnormal";
  if (visits > 6) return "Unusual";
  return "Normal";
};

const getDurationLabel = (duration: string) => {
  const mins = Number.parseInt(duration);
  if (mins >= 5) return "Abnormal";
  if (mins >= 3) return "Unusual";
  return "Normal";
};

const getDurationStatus = (duration: string) => {
  const mins = Number.parseInt(duration);
  if (mins >= 5) return "alert";
  if (mins >= 3) return "watch";
  return "healthy";
};

const getStatusLabel = (status: string | undefined, includeIcon: boolean = false) => {
  let baseLabel: string;
  switch (status) {
    case "healthy":
      baseLabel = "Normal";
      break;
    case "watch":
      baseLabel = "Unusual";
      break;
    case "alert":
      baseLabel = "Abnormal";
      break;
    default:
      baseLabel = "Normal";
  }
  return includeIcon ? `● ${baseLabel}` : baseLabel;
};

const getAirQualityStatusLabel = (airQuality: string) => {
  switch (airQuality) {
    case "Normal":
      return "Normal";
    case "Elevated":
      return "Unusual";
    case "Poor":
      return "Abnormal";
    default:
      return "Normal";
  }
};

const getSensorErrorLabel = (error: string | null) => {
  if (!error) return "Check IP";

  const normalized = error.toLowerCase();
  if (normalized.includes("timed out")) return "Timeout";
  if (normalized.includes("returned 404")) return "Missing route";
  if (
    normalized.includes("unavailable") ||
    normalized.includes("fetch failed") ||
    normalized.includes("econnrefused") ||
    normalized.includes("bad port")
  ) {
    return "Server down";
  }

  return "Check IP";
};

const getRfidStatus = (
  sensorData: ReturnType<typeof useDeviceSensors>["data"],
  sensorsLoading: boolean,
  sensorsError: string | null,
) => {
  if (sensorsError) {
    return {
      value: "Offline",
      status: "watch" as const,
      label: getSensorErrorLabel(sensorsError),
    };
  }
  if (sensorsLoading) return { value: "Syncing", status: "normal" as const, label: "Polling" };
  if (!sensorData?.online) return { value: "Offline", status: "watch" as const, label: "No data" };
  return { value: "Online", status: "healthy" as const, label: "Live" };
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isLoading: notificationsLoading, upsertNotification } = useNotifications();
  const { cats, getCatById, getStatsByCatId, sessions } = useCats();
  const [selectedCatId, setSelectedCatId] = useState(cats[0]?.id || "");
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<string[]>([]);
  const [isDismissedAlertsReady, setIsDismissedAlertsReady] = useState(false);
  const {
    data: sensorData,
    isLoading: sensorsLoading,
    error: sensorsError,
  } = useDeviceSensors();

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

  const alertCats = useMemo(
    () => cats.filter((cat) => cat.status !== "healthy"),
    [cats],
  );
  const hasAnomaly = alertCats.length > 0;
  const alertCat = useMemo(
    () => alertCats.find((cat) => !dismissedAlertKeys.includes(getAlertSignature(cat))),
    [alertCats, dismissedAlertKeys],
  );
  const alertNotificationPayloads = useMemo(() => {
    const dateKey = getLocalDateKey();

    return alertCats.map((cat) => {
      const alertStats = getStatsByCatId(cat.id);
      const visitCount = alertStats?.visits ?? 0;
      const avgDuration = alertStats?.avgDuration ?? "--";
      const notificationStatus = cat.status === "healthy" ? "watch" : cat.status;

      return {
        type: "health" as const,
        title: `${cat.name} - Unusual Behavior`,
        message: buildAlertNotificationMessage(visitCount, avgDuration),
        source: "dashboard_alert" as const,
        alertKey: getAlertNotificationKey(cat, dateKey),
        catId: cat.id,
        catName: cat.name,
        route: `/dashboard/cats/${cat.id}`,
        status: notificationStatus,
        visitCount,
        avgDuration,
      };
    });
  }, [alertCats, getStatsByCatId]);

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(DISMISSED_ALERTS_STORAGE_KEY);
      if (!rawValue) {
        setDismissedAlertKeys([]);
        return;
      }

      const parsed = JSON.parse(rawValue);
      setDismissedAlertKeys(
        Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [],
      );
    } catch {
      setDismissedAlertKeys([]);
    } finally {
      setIsDismissedAlertsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isDismissedAlertsReady) return;

    const activeAlertKeys = new Set(alertCats.map((cat) => getAlertSignature(cat)));
    setDismissedAlertKeys((prev) => {
      const next = prev.filter((key) => activeAlertKeys.has(key));
      return next.length === prev.length ? prev : next;
    });
  }, [alertCats, isDismissedAlertsReady]);

  useEffect(() => {
    if (!isDismissedAlertsReady) return;

    try {
      window.localStorage.setItem(
        DISMISSED_ALERTS_STORAGE_KEY,
        JSON.stringify(dismissedAlertKeys),
      );
    } catch {
      // Ignore storage failures; alert dismissal still works for the current render.
    }
  }, [dismissedAlertKeys, isDismissedAlertsReady]);

  useEffect(() => {
    if (notificationsLoading || alertNotificationPayloads.length === 0) return;

    const syncAlertNotifications = async () => {
      for (const notification of alertNotificationPayloads) {
        await upsertNotification(notification);
      }
    };

    void syncAlertNotifications();
  }, [alertNotificationPayloads, notificationsLoading, upsertNotification]);

  const handleViewAlertDetails = () => {
    if (!alertCat) return;
    router.push(`/dashboard/cats/${alertCat.id}`);
  };

  const handleDismissAlert = () => {
    if (!alertCat) return;

    const alertKey = getAlertSignature(alertCat);
    setDismissedAlertKeys((prev) => (
      prev.includes(alertKey) ? prev : [...prev, alertKey]
    ));
  };

  // ── Trigger permission prompt when anomaly is detected ──
  useEffect(() => {
    if (hasAnomaly) {
      triggerOnAnomaly();
    }
  }, [hasAnomaly, triggerOnAnomaly]);

  const airQuality = getLiveAirQuality(
    sensorData?.mq135,
    sensorData?.mq136,
    sensorData?.mq135Raw,
    sensorData?.mq136Raw,
  );
  const airQualityStatusLabel = sensorsError
    ? "Offline"
    : sensorsLoading
      ? "Syncing"
      : getAirQualityStatusLabel(airQuality);
  const rfidStatus = getRfidStatus(sensorData, sensorsLoading, sensorsError);
  const recentVisits = sessions
    .map((session) => ({ session, cat: getCatById(session.catId) }))
    .filter(({ cat }) => Boolean(cat))
    .slice(0, 5);

  const isEmpty = cats.length === 0;

  const greeting = getGreeting();
  const todayDate = formatDate();

  return (
    <div className="min-h-screen bg-litter-bg pb-24">
      <TopBar />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        {isEmpty ? (
          /* ── EMPTY STATE ── */
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
              onClick={() => (window.location.href = "/dashboard/cats")}
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
        ) : (
          /* ── NORMAL / ANOMALY STATE ── */
          <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 lg:items-start">
            {/* ── LEFT COLUMN: Greeting + Cat Selector + Alert ── */}
            <div className="lg:sticky lg:top-24 lg:pt-6">
              {/* Greeting Section */}
              <section className="mb-6 pt-6">
                <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-litter-text mb-1">
                  {greeting}, {user?.displayName ? user.displayName.split(" ")[0] : "User"} <span className="inline-block">👋</span>
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

              {/* Cat Selector */}
              <section className="mb-6">
                <div className="flex flex-wrap gap-2">
                  {cats.map((cat) => (
                    <CatChip
                      key={cat.id}
                      cat={cat}
                      isActive={activeCatId === cat.id}
                      onClick={() => setSelectedCatId(cat.id)}
                    />
                  ))}
                </div>
              </section>

              {/* Health Alert Banner */}
              {isDismissedAlertsReady && alertCat && (
                <div className="overflow-hidden mb-6">
                  <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 rounded-r-2xl rounded-l-sm p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-2 bg-amber-100 rounded-full shrink-0">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-amber-700 font-bold text-sm">
                          {alertCat.name} - Unusual Behavior
                        </p>
                        <p className="text-litter-muted text-xs mt-1">
                          Unusual litter box behavior detected today. Consider
                          logging a vet visit if symptoms persist.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleViewAlertDetails}
                        className="flex-1 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-sm font-semibold rounded-xl transition-colors border border-amber-200"
                      >
                        View Details
                      </button>
                      <button
                        onClick={handleDismissAlert}
                        className="px-4 py-2.5 bg-white/80 hover:bg-white text-amber-700 text-sm font-semibold rounded-xl transition-colors border border-amber-200"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Selected cat status summary — desktop only */}
              <div className="hidden lg:flex items-center justify-between p-4 bg-litter-card rounded-2xl border border-litter-border shadow-sm mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-lg overflow-hidden">
                    {selectedCat?.avatar ? (
                      <img
                        src={selectedCat.avatar}
                        alt={selectedCat.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      selectedCat?.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-litter-text">
                      {selectedCat?.name}
                    </p>
                    <p className="text-xs text-litter-muted">
                      Currently selected
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold ${
                    selectedCat?.status === "healthy"
                      ? "bg-green-100 text-green-700"
                      : selectedCat?.status === "watch"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {getStatusLabel(selectedCat?.status, true)}
                </span>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Stats + Activity ── */}
            <div className="lg:pt-6">
              {/* Stats Section */}
              <section className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg sm:text-xl font-semibold text-litter-text">
                    {selectedCat?.name}&apos;s Stats
                  </h2>
                  {/* Mobile-only status badge */}
                  <span
                    className={`lg:hidden text-xs px-2 py-1 rounded-full font-medium ${
                      selectedCat?.status === "healthy"
                        ? "bg-green-100 text-green-700"
                        : selectedCat?.status === "watch"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {selectedCat?.status === "healthy"
                      ? "Normal"
                      : selectedCat?.status === "watch"
                        ? "Unusual"
                        : "Abnormal"}
                  </span>
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
                    icon={Wind}
                    value={airQuality}
                    label="Air Quality"
                    status={sensorsError ? "watch" : getAirQualityStatus(airQuality)}
                    statusLabel={airQualityStatusLabel}
                  />
                  <StatCard
                    icon={BarChart2}
                    value={rfidStatus.value}
                    label="RFID Reader"
                    status={rfidStatus.status}
                    statusLabel={rfidStatus.label}
                  />
                </div>

              </section>

              {/* Recent Activity Feed */}
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
                      <div
                        key={session.id}
                        className="flex items-center gap-3 p-4 bg-litter-card rounded-xl border border-litter-border shadow-sm"
                      >
                        <div className="w-10 h-10 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-semibold text-sm shrink-0 overflow-hidden">
                          {cat?.avatar ? (
                            <img
                              src={cat.avatar}
                              alt={cat.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            cat?.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-litter-text font-semibold text-sm leading-snug">
                            {cat?.name} RFID visit recorded
                          </p>
                          <p className="font-body text-litter-muted text-xs mt-0.5">
                            {session.anomaly
                              ? session.anomalyType ?? "Anomaly flagged"
                              : `${formatDuration(session.durationSecs)} visit`}
                          </p>
                        </div>
                        <span className="font-body text-litter-muted text-xs">
                          {session.time}
                        </span>
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
        )}
      </main>

      <BottomNav />
    </div>
  );
}
