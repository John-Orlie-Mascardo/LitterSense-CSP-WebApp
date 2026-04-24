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
  sessionStatus?: string;
  summaryVisits?: number;
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

// ─── Admin-only mock data ────────────────────────────────────────────────────
// These are separate from the per-user cat arrays above, which are intentionally
// empty (real users populate via Firebase). Admin stats are derived from these
// arrays — change a user's cats here and the aggregates update automatically.

export interface AdminCat {
  name: string;
  gender: "male" | "female";
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  registeredDate: string; // ISO date string
  status: "active" | "inactive";
  cats: AdminCat[];
}

export interface DeleteRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedDate: string; // ISO date string
  status: "pending" | "approved" | "rejected";
  resolvedDate?: string;
  reason?: string;
}

export const mockAdminUsers: AdminUser[] = [
  {
    id: "u1",
    name: "Frederick Barbarossa",
    email: "frederick@example.com",
    registeredDate: "2024-01-12",
    status: "active",
    cats: [
      { name: "Kaiser", gender: "male" },
      { name: "Empress", gender: "female" },
      { name: "Rhine", gender: "male" },
    ],
  },
  {
    id: "u2",
    name: "Lautaro",
    email: "lautaro@outlook.com",
    registeredDate: "2024-02-05",
    status: "inactive",
    cats: [{ name: "Mapuche", gender: "male" }],
  },
  {
    id: "u3",
    name: "Eleanor of Aquitaine",
    email: "eleanor@france.net",
    registeredDate: "2024-02-18",
    status: "active",
    cats: [
      { name: "Duchess", gender: "female" },
      { name: "Troubadour", gender: "male" },
      { name: "Plantagenet", gender: "female" },
      { name: "Crusade", gender: "male" },
      { name: "Aquitaine", gender: "female" },
    ],
  },
  {
    id: "u4",
    name: "Sundiata Keita",
    email: "sundiata@mali.co",
    registeredDate: "2024-03-01",
    status: "active",
    cats: [
      { name: "Mansa", gender: "male" },
      { name: "Kouroukan", gender: "female" },
    ],
  },
  {
    id: "u5",
    name: "Tomoe Gozen",
    email: "tomoe@samurai.jp",
    registeredDate: "2024-03-22",
    status: "active",
    cats: [
      { name: "Bushido", gender: "male" },
      { name: "Katana", gender: "female" },
    ],
  },
  {
    id: "u6",
    name: "Genghis Khan",
    email: "genghis@steppe.mn",
    registeredDate: "2024-04-08",
    status: "active",
    cats: [
      { name: "Borjigin", gender: "male" },
      { name: "Temujin", gender: "male" },
      { name: "Yurt", gender: "female" },
    ],
  },
  {
    id: "u7",
    name: "Hatshepsut",
    email: "hatshepsut@egypt.gov",
    registeredDate: "2024-04-19",
    status: "active",
    cats: [
      { name: "Nefertari", gender: "female" },
      { name: "Pharaoh", gender: "male" },
    ],
  },
  {
    id: "u8",
    name: "Nikola Tesla",
    email: "tesla@wardenclyffe.io",
    registeredDate: "2024-05-03",
    status: "inactive",
    cats: [{ name: "Voltage", gender: "male" }],
  },
  {
    id: "u9",
    name: "Cleopatra VII",
    email: "cleo@ptolemy.eg",
    registeredDate: "2024-05-14",
    status: "active",
    cats: [
      { name: "Nile", gender: "female" },
      { name: "Caesar", gender: "male" },
      { name: "Sphinx", gender: "female" },
    ],
  },
  {
    id: "u10",
    name: "Ada Lovelace",
    email: "ada@babbage.co.uk",
    registeredDate: "2024-06-01",
    status: "active",
    cats: [
      { name: "Algorithm", gender: "female" },
      { name: "Enchantress", gender: "female" },
    ],
  },
  {
    id: "u11",
    name: "Shaka Zulu",
    email: "shaka@zululand.za",
    registeredDate: "2024-06-20",
    status: "active",
    cats: [{ name: "Assegai", gender: "male" }],
  },
  {
    id: "u12",
    name: "Isabella of Castile",
    email: "isabella@castile.es",
    registeredDate: "2024-07-07",
    status: "inactive",
    cats: [
      { name: "Reconquista", gender: "female" },
      { name: "Ferdinand", gender: "male" },
    ],
  },
  {
    id: "u13",
    name: "Pachacuti",
    email: "pachacuti@inca.pe",
    registeredDate: "2024-07-25",
    status: "active",
    cats: [
      { name: "Machu", gender: "male" },
      { name: "Picchu", gender: "female" },
    ],
  },
  {
    id: "u14",
    name: "Ching Shih",
    email: "chingshih@southchina.sea",
    registeredDate: "2024-08-12",
    status: "active",
    cats: [
      { name: "Corsair", gender: "female" },
      { name: "Admiral", gender: "female" },
      { name: "Junk", gender: "male" },
    ],
  },
  {
    id: "u15",
    name: "Mansa Musa",
    email: "musa@timbuktu.ml",
    registeredDate: "2024-09-03",
    status: "active",
    cats: [
      { name: "Sahara", gender: "male" },
      { name: "Gold", gender: "female" },
    ],
  },
];

export const mockDeleteRequests: DeleteRequest[] = [
  {
    id: "dr1",
    userId: "u8",
    userName: "Nikola Tesla",
    userEmail: "tesla@wardenclyffe.io",
    requestedDate: "2025-03-10",
    status: "pending",
    reason: "No longer using the service",
  },
  {
    id: "dr2",
    userId: "u12",
    userName: "Isabella of Castile",
    userEmail: "isabella@castile.es",
    requestedDate: "2025-03-18",
    status: "pending",
    reason: "Privacy concerns",
  },
  {
    id: "dr3",
    userId: "u2",
    userName: "Lautaro",
    userEmail: "lautaro@outlook.com",
    requestedDate: "2025-04-01",
    status: "pending",
    reason: "Switching to a different app",
  },
  {
    id: "dr4",
    userId: "u6",
    userName: "Genghis Khan",
    userEmail: "genghis@steppe.mn",
    requestedDate: "2025-04-09",
    status: "pending",
    reason: "Too many notifications",
  },
  {
    id: "dr5",
    userId: "u11",
    userName: "Shaka Zulu",
    userEmail: "shaka@zululand.za",
    requestedDate: "2025-02-14",
    status: "approved",
    resolvedDate: "2025-02-16",
    reason: "No longer using the service",
  },
  {
    id: "dr6",
    userId: "u4",
    userName: "Sundiata Keita",
    userEmail: "sundiata@mali.co",
    requestedDate: "2025-02-28",
    status: "rejected",
    resolvedDate: "2025-03-02",
    reason: "Privacy concerns",
  },
];

// Aggregates — all derived from mockAdminUsers, single source of truth.
const allAdminCats = mockAdminUsers.flatMap((u) => u.cats);

export const adminAggregates = {
  totalUsers: mockAdminUsers.length,
  activeUsers: mockAdminUsers.filter((u) => u.status === "active").length,
  inactiveUsers: mockAdminUsers.filter((u) => u.status === "inactive").length,
  totalCats: allAdminCats.length,
  maleCats: allAdminCats.filter((c) => c.gender === "male").length,
  femaleCats: allAdminCats.filter((c) => c.gender === "female").length,
  pendingDeleteRequests: mockDeleteRequests.filter((r) => r.status === "pending").length,
};

// ─── End admin mock data ──────────────────────────────────────────────────────

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
