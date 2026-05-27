"use client";

import type { DeviceSensors } from "@/lib/hooks/useDeviceSensors";

type AirQualityStatus = "normal" | "watch" | "alert";

export interface AirQualityReadings {
  ammonia: {
    ppm: number;
    displayValue: string;
    status: AirQualityStatus;
    online: boolean;
  };
  h2s: {
    ppm: number;
    displayValue: string;
    status: AirQualityStatus;
    online: boolean;
  };
}

const isGasDetected = (label: string, raw: number | null | undefined) => {
  const normalized = label.toLowerCase();
  return raw === 0 || normalized.includes("gas") || normalized.includes("detected");
};

const getGasReading = (
  label: string,
  raw: number | null | undefined,
  fallbackPpm: number,
) => {
  const detected = isGasDetected(label, raw);

  return {
    ppm: typeof raw === "number" && Number.isFinite(raw) ? raw : fallbackPpm,
    displayValue: detected ? "Detected" : "Clear",
    status: detected ? "alert" : "normal",
    online: true,
  } satisfies AirQualityReadings["ammonia"];
};

const getOfflineReading = (): AirQualityReadings["ammonia"] => ({
  ppm: 0,
  displayValue: "Offline",
  status: "alert",
  online: false,
});

export function useAirQualityReadings(
  sensorData?: DeviceSensors | null,
  sensorsLoading = false,
  sensorsError: string | null = null,
): AirQualityReadings {
  if (sensorsLoading) {
    return {
      ammonia: {
        ppm: 0,
        displayValue: "Syncing",
        status: "normal",
        online: true,
      },
      h2s: {
        ppm: 0,
        displayValue: "Syncing",
        status: "normal",
        online: true,
      },
    };
  }

  if (sensorsError || !sensorData?.online) {
    return {
      ammonia: getOfflineReading(),
      h2s: getOfflineReading(),
    };
  }

  return {
    ammonia: getGasReading(sensorData.mq135, sensorData.mq135Raw, 3.2),
    h2s: getGasReading(sensorData.mq136, sensorData.mq136Raw, 0.6),
  };
}
