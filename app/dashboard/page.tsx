/**
 * Dashboard / Home Page (03.01.04)
 *
 * Three states:
 * 1. Empty — no cats registered, shows onboarding prompt
 * 2. Normal — cats registered, all healthy, no alert banner
 * 3. Anomaly — at least one cat flagged, alert banner visible
 *
 * The cat selector switches per-cat data (visits, duration).
 * Air quality and litter level come from deviceStats (device-level, not per-cat).
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { Clock, Timer, Wind, BarChart2, AlertTriangle } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { StatCard } from "@/components/dashboard/StatCard";
import { CatChip } from "@/components/cats/CatChip";
import { ActivityItem } from "@/components/dashboard/ActivityItem";
import {
  mockCats,
  mockStats,
  mockActivity,
  deviceStats,
  getCatById,
} from "@/lib/data/mockData";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { NotificationPermissionBanner } from "@/components/ui/NotificationPermissionBanner";


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

const getLitterLevelStatus = (level: number) => {
  if (level >= 80) return "alert";
  if (level >= 60) return "watch";
  return "healthy";
};

const getVisitsStatus = (visits: number) => {
  if (visits > 6) return "watch";
  if (visits > 8) return "alert";
  return "healthy";
};

const getVisitsLabel = (visits: number) => {
  if (visits > 6) return "Unusual";
  return "Healthy";
};

const getDurationLabel = (duration: string) => {
  const mins = Number.parseInt(duration);
  if (mins >= 5) return "High";
  if (mins >= 3) return "Unusual";
  return "Healthy";
};

const getDurationStatus = (duration: string) => {
  const mins = Number.parseInt(duration);
  if (mins >= 5) return "alert";
  if (mins >= 3) return "watch";
  return "healthy";
};

const getStatusClass = (status: string) => {
  switch (status) {
    case "healthy":
      return "bg-green-100 text-green-700";
    case "watch":
      return "bg-amber-100 text-amber-700";
    case "alert":
      return "bg-red-100 text-red-700";
    default:
      return "bg-green-100 text-green-700";
  }
};

const getStatusLabel = (status: string | undefined, includeIcon: boolean = false) => {
  let baseLabel: string;
  switch (status) {
    case "healthy":
      baseLabel = "Healthy";
      break;
    case "watch":
      baseLabel = "Watch";
      break;
    case "alert":
      baseLabel = "Alert";
      break;
    default:
      baseLabel = "Healthy";
  }
  return includeIcon ? `● ${baseLabel}` : baseLabel;
};

const getAirQualityStatusLabel = (airQuality: string) => {
  switch (airQuality) {
    case "Normal":
      return "Healthy";
    case "Elevated":
      return "Unusual";
    case "Poor":
      return "Alert";
    default:
      return "Healthy";
  }
};

export default function DashboardPage() {
  const [selectedCatId, setSelectedCatId] = useState(mockCats[0]?.id || "");
  const [showAlertBanner, setShowAlertBanner] = useState(true);

  // ── Notification permission hook — MUST be inside the component ──
  const {
    status: notifStatus,
    showBanner,
    requestPermission,
    dismissBanner,
    triggerOnAnomaly,
  } = useNotificationPermission();

  const selectedCat = useMemo(() => getCatById(selectedCatId), [selectedCatId]);
  const stats = useMemo(() => mockStats[selectedCatId], [selectedCatId]);

  const hasAnomaly = useMemo(
    () => mockCats.some((cat) => cat.status !== "healthy"),
    [],
  );
  const alertCat = useMemo(
    () => mockCats.find((cat) => cat.status !== "healthy"),
    [],
  );

  // ── Trigger permission prompt when anomaly is detected ──
  useEffect(() => {
    if (hasAnomaly) {
      triggerOnAnomaly();
    }
  }, [hasAnomaly, triggerOnAnomaly]);

  const selectedCatStatusClass = getStatusClass(selectedCat?.status || "healthy");
  const selectedCatStatusLabel = getStatusLabel(selectedCat?.status || "healthy", true);
  const selectedCatMobileStatusClass = getStatusClass(selectedCat?.status || "healthy");
  const selectedCatMobileStatusLabel = getStatusLabel(selectedCat?.status || "healthy");
  const airQualityStatusLabel = getAirQualityStatusLabel(stats?.airQuality || "Normal");

  const isEmpty = mockCats.length === 0;

  const greeting = getGreeting();
  const todayDate = formatDate();

  return (
    <div className="min-h-screen bg-litter-bg pb-24">
      <TopBar />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        {isEmpty ? (
          /* ── EMPTY STATE ── */
          <section className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-48 h-48 bg-[#E8F5F1] rounded-3xl flex items-center justify-center mb-8">
              <svg
                viewBox="0 0 24 24"
                className="w-20 h-20 text-[#1B7A6E]/40"
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
                  {greeting}, Maria <span className="inline-block">👋</span>
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
                  {mockCats.map((cat) => (
                    <CatChip
                      key={cat.id}
                      cat={cat}
                      isActive={selectedCatId === cat.id}
                      onClick={() => setSelectedCatId(cat.id)}
                    />
                  ))}
                </div>
              </section>

              {/* Health Alert Banner */}
              {showAlertBanner && hasAnomaly && alertCat && (
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
                    <button
                      onClick={() => setShowAlertBanner(false)}
                      className="w-full py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-sm font-semibold rounded-xl transition-colors border border-amber-200"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              )}

              {/* Selected cat status summary — desktop only */}
              <div className="hidden lg:flex items-center justify-between p-4 bg-white rounded-2xl border border-litter-border shadow-sm mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-lg">
                    {selectedCat?.name.charAt(0).toUpperCase()}
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
                  {selectedCat?.status === "healthy"
                    ? "● Healthy"
                    : selectedCat?.status === "watch"
                      ? "● Watch"
                      : "● Alert"}
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
                      ? "Healthy"
                      : selectedCat?.status === "watch"
                        ? "Watch"
                        : "Alert"}
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
                    value={deviceStats.airQuality}
                    label="Air Quality"
                    status={getAirQualityStatus(deviceStats.airQuality)}
                    statusLabel={
                      deviceStats.airQuality === "Normal"
                        ? "Healthy"
                        : deviceStats.airQuality === "Elevated"
                          ? "Unusual"
                          : "Alert"
                    }
                  />
                  <StatCard
                    icon={BarChart2}
                    value={`${deviceStats.litterLevel}%`}
                    label="Litter Level"
                    status={getLitterLevelStatus(deviceStats.litterLevel)}
                  />
                </div>
              </section>

              {/* Recent Activity Feed */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-lg sm:text-xl font-semibold text-litter-text">
                    Recent Activity
                  </h2>
                  <button className="text-litter-primary text-sm font-medium hover:underline">
                    See all
                  </button>
                </div>

                <div className="space-y-3">
                  {mockActivity.map((activity, index) => (
                    <ActivityItem
                      key={index}
                      catId={activity.catId}
                      action={activity.action}
                      time={activity.time}
                      duration={activity.duration}
                      anomaly={activity.anomaly}
                      anomalyNote={activity.anomalyNote}
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}