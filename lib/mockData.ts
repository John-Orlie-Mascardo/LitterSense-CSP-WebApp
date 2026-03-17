export interface Cat {
  id: string;
  name: string;
  status: "healthy" | "watch" | "alert";
  avatar: string | null;
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

export const mockCats: Cat[] = [
  { id: "1", name: "Mochi", status: "watch", avatar: null },
  { id: "2", name: "Luna", status: "healthy", avatar: null },
  { id: "3", name: "Tigger", status: "healthy", avatar: null },
];

export const mockStats: Record<string, CatStats> = {
  "1": { visits: 8,  avgDuration: "30m",  airQuality: "Elevated", litterLevel: 55, lastVisit: "Sep 28" },
  "2": { visits: 12, avgDuration: "45m",  airQuality: "Normal",   litterLevel: 42, lastVisit: "Oct 12" },
  "3": { visits: 4,  avgDuration: "20m",  airQuality: "Normal",   litterLevel: 80, lastVisit: "Oct 05" },
};

export const mockActivity: ActivityItemData[] = [
  { catId: "1", action: "visited", time: "12m ago", duration: "1m 45s", anomaly: false },
  { catId: "2", action: "visited", time: "34m ago", duration: "2m 10s", anomaly: false },
  { catId: "3", action: "visited", time: "1h ago",  duration: "1m 12s", anomaly: false },
  { catId: "1", action: "visited", time: "2h ago",  duration: "8m",     anomaly: true, anomalyNote: "Unusual duration" },
];

export const mockCatDetails: Record<string, CatDetails> = {
  "1": {
    breed: "Tabby",
    dob: "2021-03",
    weightKg: 4.2,
    rfidTag: "A1B2C3D4",
    baseline: {
      avgVisitsPerDay: 4,
      avgDurationSecs: 134,
      mq135DeltaPercent: 8,
      mq136DeltaPercent: 5,
      lastUpdated: "2025-06-02"
    }
  },
  "2": {
    breed: "Siamese",
    dob: "2023-03",
    weightKg: 3.8,
    rfidTag: "E5F6G7H8",
    baseline: {
      avgVisitsPerDay: 5,
      avgDurationSecs: 180,
      mq135DeltaPercent: 10,
      mq136DeltaPercent: 7,
      lastUpdated: "2025-06-01"
    }
  },
  "3": {
    breed: "Bombay",
    dob: "2024-03",
    weightKg: 3.5,
    rfidTag: "I9J0K1L2",
    baseline: {
      avgVisitsPerDay: 3,
      avgDurationSecs: 90,
      mq135DeltaPercent: 6,
      mq136DeltaPercent: 4,
      lastUpdated: "2025-06-03"
    }
  }
};

export const mockSessions: Session[] = [
  {
    id: "s1", catId: "1", date: "2025-06-05", time: "07:14",
    durationSecs: 142, mq135Delta: 9, mq136Delta: 4,
    anomaly: false, anomalyType: null
  },
  {
    id: "s2", catId: "2", date: "2025-06-05", time: "08:32",
    durationSecs: 421, mq135Delta: 28, mq136Delta: 19,
    anomaly: true, anomalyType: "Extended duration + elevated gas"
  },
  {
    id: "s3", catId: "1", date: "2025-06-05", time: "11:05",
    durationSecs: 98, mq135Delta: 6, mq136Delta: 3,
    anomaly: false, anomalyType: null
  },
  {
    id: "s4", catId: "1", date: "2025-06-05", time: "14:22",
    durationSecs: 156, mq135Delta: 11, mq136Delta: 6,
    anomaly: false, anomalyType: null
  },
  {
    id: "s5", catId: "2", date: "2025-06-05", time: "16:45",
    durationSecs: 380, mq135Delta: 25, mq136Delta: 16,
    anomaly: true, anomalyType: "Extended duration"
  },
  {
    id: "s6", catId: "3", date: "2025-06-05", time: "09:30",
    durationSecs: 85, mq135Delta: 5, mq136Delta: 3,
    anomaly: false, anomalyType: null
  },
  {
    id: "s7", catId: "1", date: "2025-06-04", time: "06:50",
    durationSecs: 128, mq135Delta: 8, mq136Delta: 4,
    anomaly: false, anomalyType: null
  },
  {
    id: "s8", catId: "2", date: "2025-06-04", time: "10:15",
    durationSecs: 295, mq135Delta: 18, mq136Delta: 12,
    anomaly: true, anomalyType: "Elevated gas levels"
  },
  {
    id: "s9", catId: "1", date: "2025-06-04", time: "19:20",
    durationSecs: 145, mq135Delta: 10, mq136Delta: 5,
    anomaly: false, anomalyType: null
  },
  {
    id: "s10", catId: "3", date: "2025-06-04", time: "08:00",
    durationSecs: 92, mq135Delta: 6, mq136Delta: 4,
    anomaly: false, anomalyType: null
  },
];

export const mockHealthLogs: HealthLog[] = [
  {
    id: "l1", catId: "2", date: "2025-05-28",
    type: "Vet Visit",
    note: "Dr. Santos at Paws & Claws Clinic. Prescribed Hills c/d urinary diet. Follow-up in 2 weeks."
  },
  {
    id: "l2", catId: "2", date: "2025-06-01",
    type: "Observation",
    note: "Luna visited the box 8 times today. Seems restless."
  },
  {
    id: "l3", catId: "1", date: "2025-05-15",
    type: "Vet Visit",
    note: "Annual checkup. All vitals normal. Weight stable at 4.2kg."
  }
];

export const mockPastReports: PastReport[] = [
  {
    id: "r1", catId: "2", catName: "Luna",
    range: "May 1–31, 2025", generatedOn: "2025-06-01",
    filename: "LitterSense_Luna_2025-05.pdf"
  },
  {
    id: "r2", catId: "1", catName: "Mochi",
    range: "May 1–31, 2025", generatedOn: "2025-06-01",
    filename: "LitterSense_Mochi_2025-05.pdf"
  }
];

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
