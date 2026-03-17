"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Timer, Wind, BarChart2, AlertTriangle } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { StatCard } from "@/components/ui/StatCard";
import { CatChip } from "@/components/ui/CatChip";
import { ActivityItem } from "@/components/ui/ActivityItem";
import { mockCats, mockStats, mockActivity, getCatById } from "@/lib/mockData";

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
    case "Normal": return "healthy";
    case "Elevated": return "watch";
    case "Poor": return "alert";
    default: return "normal" as const;
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
  const mins = parseInt(duration);
  if (mins >= 5) return "High";
  if (mins >= 3) return "Unusual";
  return "Healthy";
};

const getDurationStatus = (duration: string) => {
  const mins = parseInt(duration);
  if (mins >= 5) return "alert";
  if (mins >= 3) return "watch";
  return "healthy";
};

export default function DashboardPage() {
  const [selectedCatId, setSelectedCatId] = useState(mockCats[0].id);
  const [showAlertBanner, setShowAlertBanner] = useState(true);

  const selectedCat = useMemo(() => getCatById(selectedCatId), [selectedCatId]);
  const stats = useMemo(() => mockStats[selectedCatId], [selectedCatId]);

  const hasAnomaly = useMemo(() => mockCats.some((cat) => cat.status !== "healthy"), []);
  const alertCat = useMemo(() => mockCats.find((cat) => cat.status !== "healthy"), []);

  const greeting = getGreeting();
  const todayDate = formatDate();

  return (
    <div className="min-h-screen bg-litter-bg pb-24">
      <TopBar />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        {/* Desktop two-column layout */}
        <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 lg:items-start">

          {/* ── LEFT COLUMN: Greeting + Cat Selector + Alert ── */}
          <div className="lg:sticky lg:top-24 lg:pt-6">

            {/* Greeting Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 pt-6"
            >
              <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-litter-text mb-1">
                {greeting}, Sigma <span className="inline-block">👋</span>
              </h1>
              <p className="text-litter-muted text-sm sm:text-base">
                {hasAnomaly ? "Everything looks mostly okay today." : "Here\u2019s how your cats are doing today."}
              </p>
              <p className="text-litter-primary text-xs sm:text-sm font-medium mt-1">{todayDate}</p>
            </motion.section>

            {/* Cat Selector */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-6"
            >
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
            </motion.section>

            {/* Health Alert Banner */}
            <AnimatePresence>
              {showAlertBanner && hasAnomaly && alertCat && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 rounded-r-2xl rounded-l-sm p-4 mb-6">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-2 bg-amber-100 rounded-full shrink-0">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-amber-700 font-bold text-sm">
                          {alertCat.name} - Unusual Behavior
                        </p>
                        <p className="text-litter-muted text-xs mt-1">
                          Unusual litter box behavior detected today. Consider logging a vet visit if symptoms persist.
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
                </motion.div>
              )}
            </AnimatePresence>

            {/* Selected cat status summary — desktop only */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="hidden lg:flex items-center justify-between p-4 bg-white rounded-2xl border border-litter-border shadow-sm mb-6"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-lg">
                  {selectedCat?.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-litter-text">{selectedCat?.name}</p>
                  <p className="text-xs text-litter-muted">Currently selected</p>
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
                {selectedCat?.status === "healthy" ? "● Healthy" : selectedCat?.status === "watch" ? "● Watch" : "● Alert"}
              </span>
            </motion.div>
          </div>

          {/* ── RIGHT COLUMN: Stats + Activity ── */}
          <div className="lg:pt-6">

            {/* Stats Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-8"
            >
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
                  {selectedCat?.status === "healthy" ? "Healthy" : selectedCat?.status === "watch" ? "Watch" : "Alert"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <StatCard
                  icon={Clock}
                  value={stats?.visits ?? "--"}
                  label="Today's Visits"
                  status={getVisitsStatus(stats?.visits ?? 0)}
                  statusLabel={getVisitsLabel(stats?.visits ?? 0)}
                  delay={0}
                />
                <StatCard
                  icon={Timer}
                  value={stats?.avgDuration || "--"}
                  label="Avg Duration"
                  status={getDurationStatus(stats?.avgDuration || "")}
                  statusLabel={getDurationLabel(stats?.avgDuration || "")}
                  delay={0.1}
                />
                <StatCard
                  icon={Wind}
                  value={stats?.airQuality || "--"}
                  label="Air Quality"
                  status={getAirQualityStatus(stats?.airQuality || "Normal")}
                  statusLabel={stats?.airQuality === "Normal" ? "Healthy" : stats?.airQuality === "Elevated" ? "Unusual" : "Alert"}
                  delay={0.2}
                />
                <StatCard
                  icon={BarChart2}
                  value={`${stats?.litterLevel ?? "--"}%`}
                  label="Litter Level"
                  status={getLitterLevelStatus(stats?.litterLevel ?? 0)}
                  delay={0.3}
                />
              </div>
            </motion.section>

            {/* Recent Activity Feed */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
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
                    index={index}
                  />
                ))}
              </div>
            </motion.section>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
