"use client";

import { useEffect, useState } from "react";

export type DeviceSensors = {
  online: boolean;
  mq135: string;
  mq136: string;
  mq135Raw: number | null;
  mq136Raw: number | null;
  rfidHex: string;
  rfidCard: string;
  lastRfidMs: number | null;
  updatedAt: string;
};

type SensorState = {
  data: DeviceSensors | null;
  isLoading: boolean;
  error: string | null;
};

const POLL_INTERVAL_MS = 1000;

async function fetchDeviceSensors(signal?: AbortSignal): Promise<DeviceSensors> {
  const response = await fetch("/api/sensors", {
    cache: "no-store",
    signal,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to read device sensors");
  }

  return payload as DeviceSensors;
}

export function useDeviceSensors() {
  const [state, setState] = useState<SensorState>({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const pollSensors = async () => {
      try {
        const data = await fetchDeviceSensors(controller.signal);
        if (!isMounted) return;
        setState({ data, isLoading: false, error: null });
      } catch (error) {
        if (!isMounted || controller.signal.aborted) return;
        setState((previous) => ({
          data: previous.data,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to read device sensors",
        }));
      }
    };

    pollSensors();
    const intervalId = window.setInterval(pollSensors, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  return state;
}
