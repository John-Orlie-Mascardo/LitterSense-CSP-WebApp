"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { subscribeSensorChanges } from "@/lib/utils/notificationLive";
import { applySensorPresence } from "@/lib/utils/sensorPresence";
import { subscribeDevicePresence, type SensorPresenceEvent, type SensorPresenceRole } from "@/lib/utils/devicePresenceClient";

export type DeviceSensors = {
  serverTime?: string;
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
    let refreshPending = false;
    let rawSnapshot: DeviceSensors | null = null;
    let fetchedAt = 0, serverAt = 0;
    const livePresence: Partial<Record<SensorPresenceRole, SensorPresenceEvent>> = {};
    const controller = new AbortController();

    const withLivePresence = (data: DeviceSensors, observedAt: number) => {
      const result = applySensorPresence(data, observedAt);
      const rfid = livePresence.rfid;
      const gas = livePresence['gas-ultrasonic'];
      if (rfid) {
        result.online = rfid.online;
        result.rfidState = rfid.online ? 'online' : 'stale';
        if (rfid.updatedAt) result.rfidUpdatedAt = rfid.updatedAt;
      }
      if (gas) {
        result.gasUltrasonicOnline = gas.online;
        result.gasUltrasonicState = gas.online ? 'online' : 'stale';
        if (gas.updatedAt) result.gasUltrasonicUpdatedAt = gas.updatedAt;
      }
      return result;
    };
    const refreshFromSnapshot = () => {
      if (!isMounted) return;
      const data = rawSnapshot
        ? withLivePresence(rawSnapshot, serverAt + Math.max(0, Date.now() - fetchedAt))
        : null;
      setState(previous => {
        if (previous.ownerId !== user.uid || !previous.data) return previous;
        const next = data ? { ...previous, data } : { ...previous, data: { ...previous.data } };
        if (!data) {
          const rfid = livePresence.rfid;
          const gas = livePresence['gas-ultrasonic'];
          if (rfid) {
            next.data.online = rfid.online;
            next.data.rfidState = rfid.online ? 'online' : 'stale';
            if (rfid.updatedAt) next.data.rfidUpdatedAt = rfid.updatedAt;
          }
          if (gas) {
            next.data.gasUltrasonicOnline = gas.online;
            next.data.gasUltrasonicState = gas.online ? 'online' : 'stale';
            if (gas.updatedAt) next.data.gasUltrasonicUpdatedAt = gas.updatedAt;
          }
        }
        return (previous.data.online === next.data.online && previous.data.gasUltrasonicOnline === next.data.gasUltrasonicOnline &&
          previous.data.rfidState === next.data.rfidState && previous.data.gasUltrasonicState === next.data.gasUltrasonicState)
          ? previous : next;
      });
    };

    const pollSensors = async () => {
      if (!isMounted || inFlight) return;
      window.clearTimeout(timeoutId);
      inFlight = true;
      try {
        const data = await fetchDeviceSensors(await user.getIdToken(), controller.signal);
        if (!isMounted) return;
        failures = 0;
        rawSnapshot = data;
        fetchedAt = Date.now();
        const serverTime = Date.parse(data.serverTime ?? '');
        serverAt = Number.isFinite(serverTime) ? serverTime : fetchedAt;
        setState({ data: withLivePresence(data, serverAt), isLoading: false, error: null, ownerId: user.uid });
      } catch (error) {
        if (!isMounted || controller.signal.aborted) return;
        ++failures;
        rawSnapshot = null;
        setState((previous) => ({
          data: previous.ownerId === user.uid && previous.data ? {
            ...previous.data,
            online: livePresence.rfid?.online ?? false,
            rfidState: livePresence.rfid ? (livePresence.rfid.online ? 'online' : 'stale') : 'stale',
            gasUltrasonicOnline: livePresence['gas-ultrasonic']?.online ?? false,
            gasUltrasonicState: livePresence['gas-ultrasonic'] ? (livePresence['gas-ultrasonic'].online ? 'online' : 'stale') : 'stale',
            // A cloud read failure cannot undo the last confirmed RFID entry.
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
          if (refreshPending) {
            refreshPending = false;
            void pollSensors();
            return;
          }
          const retryMs = Math.min(10000, 5000 * 2 ** Math.min(failures - 1, 1));
          // Realtime invalidations and the relay presence stream provide fast updates.
          // This timer is only a safety net when either live channel misses an event.
          const interval = failures ? retryMs : 30_000;
          timeoutId = window.setTimeout(pollSensors, interval);
        }
      }
    };

    const onVisibilityChange = () => {
      if (inFlight) return;
      window.clearTimeout(timeoutId);
      void pollSensors();
    };
    const requestRefresh = () => {
      if (inFlight) refreshPending = true;
      else void pollSensors();
    };
    const stopRealtime = subscribeSensorChanges(requestRefresh);
    const stopPresence = subscribeDevicePresence(
      () => user.getIdToken(),
      event => {
        livePresence[event.role] = event;
        refreshFromSnapshot();
      },
      role => {
        delete livePresence[role];
        refreshFromSnapshot();
      },
    );
    window.addEventListener('online', requestRefresh);
    const presenceTimer = window.setInterval(() => {
      if (!rawSnapshot || !isMounted) return;
      const data = withLivePresence(rawSnapshot, serverAt + Math.max(0, Date.now() - fetchedAt));
      setState(previous => previous.ownerId !== user.uid || !previous.data ||
        (previous.data.online === data.online && previous.data.gasUltrasonicOnline === data.gasUltrasonicOnline)
        ? previous : { ...previous, data });
    }, 1000);
    document.addEventListener("visibilitychange", onVisibilityChange);

    pollSensors();

    return () => {
      isMounted = false;
      controller.abort();
      stopRealtime();
      stopPresence();
      window.clearInterval(presenceTimer);
      window.removeEventListener('online', requestRefresh);
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
