"use client";

import { useEffect, useRef } from "react";
import type { NewNotificationData } from "@/lib/contexts/NotificationContext";
import { useCats } from "@/lib/contexts/CatContext";
import type { DeviceSensors } from "@/lib/hooks/useDeviceSensors";

const DEFAULT_VISIT_DURATION_SECS = 1;

const hexToDec = (hex: string): string => {
  const n = Number.parseInt(hex, 16);
  return Number.isNaN(n) ? "" : n.toString();
};

const normalizeTag = (s: string) =>
  s.toLowerCase().replace(/[^a-f0-9]/g, "");

interface RfidVisitTrackerOptions {
  rfidVisitAlerts?: boolean;
  addNotification?: (data: NewNotificationData) => Promise<void>;
}

/**
 * Observes completed RFID sessions from the ESP32 without writing Firestore visits.
 *
 * The `/api/sensors` ingestion route is the single writer for completed sessions.
 * This hook may still run in dashboard tabs for live telemetry, but it must not
 * call `recordVisit` or create session documents.
 */
export function useRfidVisitTracker(
  sensor: DeviceSensors | null,
  options: RfidVisitTrackerOptions = {},
) {
  const { cats, catDetails, sessions } = useCats();
  const lastObservedSessionKey = useRef("");
  const lastEntryNotificationKey = useRef("");
  const { addNotification, rfidVisitAlerts = true } = options;
  const alertsEnabled = rfidVisitAlerts !== false;

  useEffect(() => {
    if (!sensor?.online) return;

    const {
      completedSessionCount,
      lastSessionDurationMs,
      lastSessionEndMs,
      lastSessionStatus,
      activeRfidCard,
      activeRfidHex,
      rfidCard,
      rfidHex,
    } = sensor;
    const card = (sensor.sessionActive ? activeRfidCard : rfidCard) || "";
    const hex = (sensor.sessionActive ? activeRfidHex : rfidHex) || "";

    if (sensor.sessionActive) {
      const entryKey = `${sensor.activeSessionStartMs ?? ""}|${card}|${hex}`;
      if (entryKey && entryKey !== lastEntryNotificationKey.current) {
        const catInBox = findCatByRfid(cats, catDetails, card, hex);
        lastEntryNotificationKey.current = entryKey;

        if (catInBox && alertsEnabled && addNotification) {
          void addNotification({
            type: "cat_visit",
            title: `${catInBox.name} entered the litter box`,
            message: "RFID entry detected.",
            source: "rfid_visit",
            catId: catInBox.id,
            catName: catInBox.name,
            route: `/dashboard/cats/${catInBox.id}`,
          });
        }
      }
    }

    if (sensor.sessionActive) return;

    const sessionCompleted =
      completedSessionCount !== null &&
      completedSessionCount > 0 &&
      (lastSessionStatus === "NORMAL" ||
        lastSessionStatus === "ABNORMAL" ||
        lastSessionStatus === "SHORT_SESSION" ||
        lastSessionStatus === "NO_EXIT_TIMEOUT");

    if (sessionCompleted) {
      const sessionKey = `${completedSessionCount}|${lastSessionEndMs ?? ""}|${lastSessionDurationMs ?? ""}`;
      if (sessionKey === lastObservedSessionKey.current) return;

      const catToRecord = findCatByRfid(cats, catDetails, card, hex);

      if (!catToRecord) {
        console.debug("[RFID] completed session but no cat matched", {
          card,
          hex,
          completedSessionCount,
          lastSessionStatus,
        });
        lastObservedSessionKey.current = sessionKey;
        return;
      }

      const durationSecs = Math.max(
        DEFAULT_VISIT_DURATION_SECS,
        Math.round((lastSessionDurationMs ?? 0) / 1000),
      );
      const endedAtIso = lastSessionEndMs ? new Date(lastSessionEndMs).toISOString() : "";
      if (alertsEnabled && addNotification) {
        void addNotification({
          type: "cat_visit",
          title: `${catToRecord.name} left the litter box`,
          message: `RFID exit detected after ${formatDurationLabel(durationSecs)}.`,
          source: "rfid_visit",
          catId: catToRecord.id,
          catName: catToRecord.name,
          route: `/dashboard/cats/${catToRecord.id}`,
        });
      }

      if (
        endedAtIso &&
        hasMatchingRecordedSession(
          sessions,
          catToRecord.id,
          durationSecs,
          endedAtIso,
          lastSessionStatus,
        )
      ) {
        lastObservedSessionKey.current = sessionKey;
        console.debug("[RFID] completed visit already recorded for", catToRecord.id);
        return;
      }

      lastObservedSessionKey.current = sessionKey;
      console.debug("[RFID] completed visit observed for server ingestion", {
        catId: catToRecord.id,
        completedSessionCount,
        lastSessionStatus,
      });
      return;
    }

    // Do not count ENTER, raw scans, IN_PROGRESS, or FALSE_ENTRY_IGNORED.
  }, [sensor, cats, catDetails, sessions, alertsEnabled, addNotification]);
}

function formatDurationLabel(durationSecs: number) {
  const minutes = Math.floor(durationSecs / 60);
  const seconds = durationSecs % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function hasMatchingRecordedSession(
  sessions: ReturnType<typeof useCats>["sessions"],
  catId: string,
  durationSecs: number,
  endedAtIso: string,
  sessionStatus: string,
) {
  return sessions.some((session) => {
    if (session.catId !== catId) return false;
    if (session.durationSecs !== durationSecs) return false;
    if (session.endedAt !== endedAtIso) return false;
    if (sessionStatus && session.sessionStatus && session.sessionStatus !== sessionStatus) {
      return false;
    }

    return true;
  });
}

function findCatByRfid(
  cats: ReturnType<typeof useCats>["cats"],
  catDetails: ReturnType<typeof useCats>["catDetails"],
  card: string,
  hex: string,
) {
  const matchedCat = cats.find((cat) => {
    const tag = normalizeTag(catDetails[cat.id]?.rfidTag ?? "");
    if (!tag) return false;

    return (
      tag === normalizeTag(card) ||
      tag === normalizeTag(hex) ||
      tag === hexToDec(card) ||
      tag === hexToDec(hex)
    );
  });

  return matchedCat;
}
