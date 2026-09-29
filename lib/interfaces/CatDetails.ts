export interface CatDetails {
  breed: string;
  gender?: "male" | "female";
  dob: string;
  // NOTE(manuscript): Remove weight from the CAT ERD (3.4.2); legacy stored values remain untouched.
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
