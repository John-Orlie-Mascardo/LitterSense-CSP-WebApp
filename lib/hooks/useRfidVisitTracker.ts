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
 * Records one visit only when the ESP32 reports a completed successful session.
 *
 * Matching order:
 * 1. Match completed session card/full UID against a cat's registered RFID tag.
 * 2. Ignore completed sessions whose RFID tag is not registered to a cat.
 */
export function useRfidVisitTracker(sensor: DeviceSensors | null) {
  const { cats, catDetails, recordVisit } = useCats();
  const lastRecordedSessionKey = useRef("");

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
      if (sessionKey === lastRecordedSessionKey.current) return;

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
        lastRecordedSessionKey.current = sessionKey;
        return;
      }

      lastRecordedSessionKey.current = sessionKey;
      const durationSecs = Math.max(
        DEFAULT_VISIT_DURATION_SECS,
        Math.round((lastSessionDurationMs ?? 0) / 1000),
      );
      console.debug("[RFID] completed visit recorded for", catToRecord.id);
      recordVisit(catToRecord.id, durationSecs, {
        sessionStatus: lastSessionStatus,
      });
      return;
    }

    // Do not count ENTER, raw scans, IN_PROGRESS, or FALSE_ENTRY_IGNORED.
  }, [sensor, cats, catDetails, recordVisit]);
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
