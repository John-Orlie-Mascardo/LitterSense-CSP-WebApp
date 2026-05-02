export interface CatStats {
  visits: number;
  avgDuration: string;
  airQuality: "Normal" | "Elevated" | "Poor";
  litterLevel: number;
  lastVisit: string;
}