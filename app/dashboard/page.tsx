"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Timer, Wind, BarChart2, AlertTriangle, X } from "lucide-react";
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
  const [selectedCatId, setSelectedCatId] = useState(mockCats[0].id);
  const [showAlertBanner, setShowAlertBanner] = useState(true);

  const selectedCat = useMemo(() => getCatById(selectedCatId), [selectedCatId]);
  const stats = useMemo(() => mockStats[selectedCatId], [selectedCatId]);

  // Check if any cat has an anomaly
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
    <div className="min-h-screen bg-[#FDFAF6] pb-24">
      {/* Top Navigation */}
      <TopBar />

      {/* Main Content */}
      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Greeting Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1C1C1C] mb-1">
            {greeting}, Maria <span className="inline-block">👋</span>
          </h1>
          <p className="text-[#6B7280] text-sm sm:text-base">
            Here's how your cats are doing today.
          </p>
          <p className="text-[#6B7280]/70 text-xs mt-1">{todayDate}</p>
        </motion.section>

        {/* Cat Selector */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-6"
        >
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
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
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 overflow-hidden"
            >
              <div className="p-2 bg-amber-100 rounded-xl shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-amber-900 font-medium text-sm sm:text-base">
                  {alertCat.name} has shown unusual litter box behavior today.
                </p>
                <p className="text-amber-700/80 text-xs sm:text-sm mt-1">
                  Consider logging a vet visit.
                </p>
                <button className="mt-3 px-4 py-2 bg-white border border-amber-200 text-amber-800 text-sm font-medium rounded-lg hover:bg-amber-50 transition-colors">
                  View Details
                </button>
              </div>
              <button
                onClick={() => setShowAlertBanner(false)}
                className="p-1 text-amber-600 hover:text-amber-800 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Cat Stats Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-[#1C1C1C]">
              {selectedCat?.name}'s Stats
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
              status={stats?.visits && stats.visits > 5 ? "watch" : "healthy"}
              delay={0}
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
              delay={0.1}
            />
            <StatCard
              icon={Wind}
              value={stats?.airQuality || "--"}
              label="Air Quality"
              status={getAirQualityStatus(stats?.airQuality || "Normal")}
              delay={0.2}
            />
            <StatCard
              icon={BarChart2}
              value={`${stats?.litterLevel}% full`}
              label="Litter Level"
              status={getLitterLevelStatus(stats?.litterLevel || 0)}
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
            <h2 className="font-display text-lg sm:text-xl font-semibold text-[#1C1C1C]">
              Recent Activity
            </h2>
            <button className="text-[#1E6B5E] text-sm font-medium hover:underline">
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
        </motion.section>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
