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
