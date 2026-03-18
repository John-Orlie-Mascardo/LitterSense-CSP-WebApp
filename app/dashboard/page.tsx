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

import { useState, useMemo } from "react";
import { Clock, Timer, Wind, BarChart2, AlertTriangle, X } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { StatCard } from "@/components/ui/StatCard";
import { CatChip } from "@/components/ui/CatChip";
import { ActivityItem } from "@/components/ui/ActivityItem";
import {
  mockCats,
  mockStats,
  mockActivity,
  getCatById,
  deviceStats,
} from "@/lib/mockData";

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
      return "normal";
  }
};

const getLitterLevelStatus = (level: number) => {
  if (level >= 80) return "alert";
  if (level >= 60) return "watch";
  return "healthy";
};

export default function DashboardPage() {
  const [selectedCatId, setSelectedCatId] = useState(mockCats[0]?.id || "");
  const [showAlertBanner, setShowAlertBanner] = useState(true);

  // Toggle this to test empty state during development — remove before production
  const isEmpty = mockCats.length === 0;

  const selectedCat = useMemo(() => getCatById(selectedCatId), [selectedCatId]);
  const stats = useMemo(() => mockStats[selectedCatId], [selectedCatId]);

  // Anomaly detection: checks if ANY cat has a non-healthy status.
  // In production this will come from Firebase anomaly collection (03.02.05).
  const hasAnomaly = useMemo(() => {
    return mockCats.some((cat) => cat.status !== "healthy");
  }, []);

  // Get first cat with anomaly for the alert banner
  const alertCat = useMemo(() => {
    return mockCats.find((cat) => cat.status !== "healthy");
  }, []);

  const greeting = getGreeting();
  const todayDate = formatDate();

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Top Navigation */}
      <TopBar />

      {/* Main Content */}
      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Greeting — changes based on time of day and whether cats are registered */}
        <section className="mb-6">
          {isEmpty ? (
            <>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1C1C1C] mb-1">
                Hello, welcome!
              </h1>
              <p className="text-[#6B7280] text-sm sm:text-base">
                Ready to start tracking your cat&apos;s health?
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1C1C1C] mb-1">
                {greeting}, Sigma <span className="inline-block">👋</span>
              </h1>
              <p className="text-[#6B7280] text-sm sm:text-base">
                Here&apos;s how your cats are doing today.
              </p>
              <p className="text-[#6B7280]/70 text-xs mt-1">{todayDate}</p>
            </>
          )}
        </section>

        {isEmpty ? (
          /* Empty State — shown when user has no registered cats (first-time user) */
          <section className="flex flex-col items-center justify-center text-center py-16">
            {/* Paw illustration placeholder */}
            <div className="w-48 h-48 bg-[#E8F5F1] rounded-3xl flex items-center justify-center mb-8">
              <svg
                viewBox="0 0 24 24"
                className="w-20 h-20 text-[#1B7A6E]/40"
                fill="currentColor"
              >
                <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8ZM8.5 12C9.3 12 10 12.7 10 13.5C10 14.3 9.3 15 8.5 15C7.7 15 7 14.3 7 13.5C7 12.7 7.7 12 8.5 12ZM15.5 12C16.3 12 17 12.7 17 13.5C17 14.3 16.3 15 15.5 15C14.7 15 14 14.3 14 13.5C14 12.7 14.7 12 15.5 12ZM12 17C13.1 17 14 17.9 14 19H10C10 17.9 10.9 17 12 17Z" />
              </svg>
            </div>

            <h2 className="font-bold text-2xl text-[#1C1C1C] mb-3">
              No cats registered yet
            </h2>
            <p className="text-[#6B7280] text-sm leading-relaxed max-w-xs mb-8">
              Keep track of your furry friend&apos;s health, bathroom habits,
              and weight trends by adding them to your dashboard.
            </p>
            <button
              onClick={() => (window.location.href = "/dashboard/cats")}
              className="w-full max-w-xs py-4 bg-[#1B7A6E] text-white font-semibold rounded-xl shadow-lg shadow-[#1B7A6E]/25 hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
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
          /* Normal + Anomaly States (everything that was already here) */
          <>
            {/* Cat Selector (03.01.05) — horizontal scrollable chips, one per registered cat */}
            <section className="mb-6">
              <div
                className={`flex gap-3 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide ${
                  mockCats.length <= 3 ? "justify-center" : ""
                }`}
              >
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

            {/* Alert Banner (03.01.08) — only renders when an anomaly is active */}
            {showAlertBanner && hasAnomaly && alertCat && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 overflow-hidden">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 rounded-xl shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-amber-900 font-semibold text-sm sm:text-base">
                      {alertCat.name} - Unusual Behavior
                    </p>
                    <p className="text-amber-700/80 text-xs sm:text-sm mt-1 leading-relaxed">
                      Unusual litter box behavior detected today. Consider
                      logging a vet visit if symptoms persist.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAlertBanner(false)}
                    className="p-1 text-amber-400 hover:text-amber-600 transition-colors shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <button className="mt-4 w-full py-2.5 bg-white border border-amber-200 text-amber-800 text-sm font-semibold rounded-xl hover:bg-amber-50 transition-colors">
                  View Details
                </button>
              </div>
            )}

            {/* Stat Cards (03.01.06) — visits and duration are per-cat, air quality and litter level are device-level */}
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg sm:text-xl font-semibold text-[#1C1C1C]">
                  {selectedCat?.name}&apos;s Stats
                </h2>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
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

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard
                  icon={Clock}
                  value={`${stats?.visits} visits`}
                  label="Today's Visits"
                  status={
                    stats?.visits && stats.visits > 5 ? "watch" : "healthy"
                  }
                />
                <StatCard
                  icon={Timer}
                  value={stats?.avgDuration || "--"}
                  label="Avg Duration"
                  status={
                    stats?.avgDuration && stats.avgDuration.startsWith("4")
                      ? "watch"
                      : "normal"
                  }
                />
                <StatCard
                  icon={Wind}
                  value={deviceStats.airQuality}
                  label="Air Quality"
                  status={getAirQualityStatus(deviceStats.airQuality)}
                />
                <StatCard
                  icon={BarChart2}
                  value={`${deviceStats.litterLevel}% full`}
                  label="Litter Level"
                  status={getLitterLevelStatus(deviceStats.litterLevel)}
                />
              </div>
            </section>

            {/* Recent Activity Feed (03.01.07) — shows all cats' recent litter box visits */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg sm:text-xl font-semibold text-[#1C1C1C]">
                  Recent Activity
                </h2>
                <button className="text-[#1B7A6E] text-sm font-medium hover:underline">
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
                    anomaly={activity.anomaly}
                    anomalyNote={activity.anomalyNote}
                    index={index}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
