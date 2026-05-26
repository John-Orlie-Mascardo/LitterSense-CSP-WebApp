"use client";

import { useEffect, useRef } from "react";
import { useCats } from "@/lib/contexts/CatContext";
import type { DeviceSensors } from "@/lib/hooks/useDeviceSensors";

const DEFAULT_VISIT_DURATION_SECS = 1;

const hexToDec = (hex: string): string => {
  const n = Number.parseInt(hex, 16);
  return Number.isNaN(n) ? "" : n.toString();
};

const normalizeTag = (s: string) =>
  s.toLowerCase().replace(/[^a-f0-9]/g, "");

/**
 * Observes completed RFID sessions from the ESP32 without writing Firestore visits.
 *
 * The `/api/sensors` ingestion route is the single writer for completed sessions.
 * This hook may still run in dashboard tabs for live telemetry, but it must not
 * call `recordVisit` or create session documents.
 */
export function useRfidVisitTracker(sensor: DeviceSensors | null) {
  const { cats, catDetails, sessions } = useCats();
  const lastObservedSessionKey = useRef("");

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

      const card = activeRfidCard || rfidCard || "";
      const hex = activeRfidHex || rfidHex || "";
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
  }, [sensor, cats, catDetails, sessions]);
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
