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
}

export interface ActivityItem {
  catId: string;
  action: string;
  time: string;
  anomaly: boolean;
  anomalyNote?: string;
}

export const mockCats: Cat[] = [
  { id: "1", name: "Mochi", status: "healthy", avatar: null },
  { id: "2", name: "Luna", status: "watch", avatar: null },
  { id: "3", name: "Tigger", status: "alert", avatar: null },
];

export const mockStats: Record<string, CatStats> = {
  "1": { visits: 4, avgDuration: "2m 14s", airQuality: "Normal", litterLevel: 68 },
  "2": { visits: 7, avgDuration: "4m 01s", airQuality: "Elevated", litterLevel: 45 },
  "3": { visits: 2, avgDuration: "1m 30s", airQuality: "Normal", litterLevel: 80 },
};

export const mockActivity: ActivityItem[] = [
  { catId: "1", action: "visited the litter box", time: "12 minutes ago", anomaly: false },
  { catId: "2", action: "visited the litter box", time: "34 minutes ago", anomaly: true, anomalyNote: "Unusual duration" },
  { catId: "1", action: "visited the litter box", time: "1 hour ago", anomaly: false },
  { catId: "3", action: "visited the litter box", time: "2 hours ago", anomaly: false },
];

export function getCatById(id: string): Cat | undefined {
  return mockCats.find((cat) => cat.id === id);
}

export function getStatsByCatId(id: string): CatStats | undefined {
  return mockStats[id];
}
