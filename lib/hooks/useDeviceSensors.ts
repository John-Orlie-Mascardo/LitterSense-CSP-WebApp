"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";

export type DeviceSensors = {
  rfidCloudError?: boolean;
  gasUltrasonicCloudError?: boolean;
  rfidUpdatedAt?: string;
  gasUltrasonicUpdatedAt?: string;
  rfidDataSource?: "firebase" | "supabase";
  gasUltrasonicDataSource?: "firebase" | "supabase";
  rfidState?: "online" | "stale" | "unknown";
  gasUltrasonicState?: "online" | "stale" | "unknown";
  online: boolean;
  gasUltrasonicOnline?: boolean;
  distanceCm?: number | null;
  connectedSsid: string;
  mq135: string;
  mq136: string;
  mq135Raw: number | null;
  mq136Raw: number | null;
  rfidHex: string;
  rfidCard: string;
  lastRfidMs: number | null;
  rfidEvent:
    | "none"
    | "ENTER"
    | "OUT"
    | "FALSE_ENTRY_IGNORED"
    | "DIFFERENT_TAG_IGNORED"
    | "NO_EXIT_TIMEOUT"
    | "SESSION_INTERRUPTED";
  sessionActive: boolean;
  activeRfidHex: string;
  activeRfidCard: string;
  activeSessionStartMs: number | null;
  activeSessionDurationMs: number | null;
  currentSessionStatus:
    | "IDLE"
    | "IN_PROGRESS"
    | "NORMAL_WINDOW"
    | "ABNORMAL_IN_PROGRESS"
    | "NO_EXIT_TIMEOUT"
    | "SESSION_INTERRUPTED";
  lastSessionStatus:
    | "NONE"
    | "IN_PROGRESS"
    | "NORMAL"
    | "ABNORMAL"
    | "SHORT_SESSION"
    | "FALSE_ENTRY_IGNORED"
    | "NO_EXIT_TIMEOUT"
    | "SESSION_INTERRUPTED";
  lastSessionDurationMs: number | null;
  lastSessionEndMs: number | null;
  completedSessionCount: number | null;
  falseEntryCount: number | null;
  noExitTimeoutCount: number | null;
  noExitTimeoutMs: number | null;
  updatedAt: string;
};

type SensorState = {
  data: DeviceSensors | null;
  isLoading: boolean;
  error: string | null;
};

const SensorContext = createContext<SensorState | null>(null);

async function fetchDeviceSensors(token: string, signal?: AbortSignal): Promise<DeviceSensors> {
  const response = await fetch("/api/sensors", {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await response.json() as {
    error?: string;
    detail?: string;
  };

  if (!response.ok) {
    const message = [payload.error, payload.detail].filter(Boolean).join(": ");
    throw new Error(message || "Unable to read device sensors");
  }

  return payload as DeviceSensors;
}

function useSensorPolling() {
  const { user } = useAuth();
  const [state, setState] = useState<SensorState & { ownerId: string | null }>({
    data: null,
    isLoading: true,
    error: null,
    ownerId: null,
  });

  useEffect(() => {
    if (!user) {
      setState({ data: null, isLoading: false, error: null, ownerId: null });
      return;
    }
    let isMounted = true;
    let timeoutId: number;
    let inFlight = false;
    let failures = 0;
    const controller = new AbortController();

    const pollSensors = async () => {
      if (!isMounted || inFlight) return;
      window.clearTimeout(timeoutId);
      inFlight = true;
      try {
        const data = await fetchDeviceSensors(await user.getIdToken(), controller.signal);
        if (!isMounted) return;
        failures = 0;
        setState({ data, isLoading: false, error: null, ownerId: user.uid });
      } catch (error) {
        if (!isMounted || controller.signal.aborted) return;
        ++failures;
        setState((previous) => ({
          data: previous.ownerId === user.uid && previous.data ? {
            ...previous.data,
            online: false,
            gasUltrasonicOnline: false,
            sessionActive: false,
          } : null,
          ownerId: user.uid,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to read device sensors",
        }));
      } finally {
        inFlight = false;
        if (isMounted) {
          const retryMs = Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4));
          const interval = failures ? retryMs : 2000;
          timeoutId = window.setTimeout(pollSensors, document.hidden ? Math.max(30000, interval) : interval);
        }
      }
    };

    const onVisibilityChange = () => {
      if (inFlight) return;
      window.clearTimeout(timeoutId);
      if (!document.hidden) void pollSensors();
      else timeoutId = window.setTimeout(pollSensors, 30000);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    pollSensors();

    return () => {
      isMounted = false;
      controller.abort();
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user]);

  return state.ownerId === user?.uid ? state : { data: null, isLoading: Boolean(user), error: null };
}

export function DeviceSensorsProvider({ children }: { children: ReactNode }) {
  const state = useSensorPolling();
  return createElement(SensorContext.Provider, { value: state }, children);
}

export function useDeviceSensors(): SensorState {
  const state = useContext(SensorContext);
  if (!state) throw new Error("DeviceSensorsProvider is required for sensor readings");
  return state;
}
