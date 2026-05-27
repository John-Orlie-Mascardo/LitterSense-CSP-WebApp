"use client";

type AirQualityStatus = "normal" | "watch" | "alert";

export interface AirQualityReadings {
  ammonia: {
    ppm: number;
    status: AirQualityStatus;
    online: boolean;
  };
  h2s: {
    ppm: number;
    status: AirQualityStatus;
    online: boolean;
  };
}

export function useAirQualityReadings(): AirQualityReadings {
  return {
    ammonia: {
      ppm: 3.2,
      status: "normal",
      online: true,
    },
    h2s: {
      ppm: 0.6,
      status: "normal",
      online: true,
    },
  };
}
