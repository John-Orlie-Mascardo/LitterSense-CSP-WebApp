/**
 * LitterSense Mock Data
 *
 * This file contains all dummy data used for frontend development and testing.
 * Replace with Firebase queries once backend integration begins (03.03.03).
 *
 * Data is split into two categories:
 * - Per-cat data: visits, duration, sessions, health logs (changes per cat)
 * - Device-level data: air quality, litter level (shared across all cats — one litter box)
 */

export interface Cat {
  id: string;
  name: string;
  status: "healthy" | "watch" | "alert";
  avatar: string | null;
  isOnline: boolean;
}

export interface CatStats {
  visits: number;
  avgDuration: string;
  airQuality: "Normal" | "Elevated" | "Poor";
  litterLevel: number;
  lastVisit: string;
}

export interface ActivityItemData {
  catId: string;
  action: string;
  time: string;
  duration?: string;
  anomaly: boolean;
  anomalyNote?: string;
}

export interface CatDetails {
  breed: string;
  dob: string;
  weightKg: number;
  rfidTag: string;
  healthInsight: string;
  baseline: {
    avgVisitsPerDay: number;
    avgDurationSecs: number;
    mq135DeltaPercent: number;
    mq136DeltaPercent: number;
    lastUpdated: string;
  };
}

export interface Session {
  id: string;
  catId: string;
  date: string;
  time: string;
  durationSecs: number;
  mq135Delta: number;
  mq136Delta: number;
  anomaly: boolean;
  anomalyType: string | null;
}

export interface HealthLog {
  id: string;
  catId: string;
  date: string;
  type: "Vet Visit" | "Medication" | "Observation" | "Other";
  note: string;
}

export interface PastReport {
  id: string;
  catId: string;
  catName: string;
  range: string;
  generatedOn: string;
  filename: string;
}
// Mock data for testing and development
// ⚠️ EMPTY ARRAYS — Users add their own cats manually
export const mockCats: Cat[] = [];

/**
 * Per-cat stats — visits and duration are unique to each cat.
 * Every cat in mockCats must have a matching entry here or the dashboard
 * will show "undefined" values when that cat is selected.
 */
export const mockStats: Record<string, CatStats> = {};

/** Device-level stats — shared across all cats (one physical litter box). Not per-cat. */
export const deviceStats = {
  airQuality: "Normal" as "Normal" | "Elevated" | "Poor",
  litterLevel: 68,
};

/** Recent activity feed items — displayed on the dashboard. catId must match a mockCats entry. */
export const mockActivity: ActivityItemData[] = [];

/** Extended cat profile data — used on the Cat Profile Detail Page (03.01.11). */
export const mockCatDetails: Record<string, CatDetails> = {};

/** Raw session logs — used on the Cat Profile Detail Page session history table. */
export const mockSessions: Session[] = [];

export const mockHealthLogs: HealthLog[] = [];

export const mockPastReports: PastReport[] = [];

export function getCatById(id: string): Cat | undefined {
  return mockCats.find((cat) => cat.id === id);
}

export function getStatsByCatId(id: string): CatStats | undefined {
  return mockStats[id];
}

export function getCatDetailsById(id: string): CatDetails | undefined {
  return mockCatDetails[id];
}

export function getSessionsByCatId(id: string): Session[] {
  return mockSessions.filter((session) => session.catId === id);
}

export function getHealthLogsByCatId(id: string): HealthLog[] {
  return mockHealthLogs.filter((log) => log.catId === id);
}

// Generate 7 days of trend data for a cat
export function getTrendData(catId: string) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const baseline = mockCatDetails[catId]?.baseline;

  if (!baseline) return null;

  return days.map((day, index) => {
    // Add some random variation around the baseline
    const visitVariation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    const durationVariation = Math.floor(Math.random() * 60) - 30; // +/- 30 seconds
    const mq135Variation = Math.floor(Math.random() * 10) - 3; // +/- 3%

    return {
      day,
      visits: Math.max(0, baseline.avgVisitsPerDay + visitVariation),
      avgDuration: Math.max(60, baseline.avgDurationSecs + durationVariation),
      mq135Delta: Math.max(0, baseline.mq135DeltaPercent + mq135Variation),
    };
  });
}
