"use client";

import { useEffect, useRef } from "react";
import { useCats } from "@/lib/contexts/CatContext";
import type { DeviceSensors } from "@/lib/hooks/useDeviceSensors";

// The ESP32 keeps returning the last scanned RFID card while the web app polls.
// This key prevents one physical scan from being counted repeatedly.
const FALLBACK_SCAN_COOLDOWN_MS = 2000;
const DEFAULT_VISIT_DURATION_SECS = 1;

const hexToDec = (hex: string): string => {
  const n = Number.parseInt(hex, 16);
  return Number.isNaN(n) ? "" : n.toString();
};

const normalizeTag = (s: string) =>
  s.toLowerCase().replace(/[^a-f0-9]/g, "");

const hasRegisteredTag = (s: string) => normalizeTag(s).length > 0;

/**
 * Records one visit for each new RFID scan event from the ESP32.
 *
 * Matching order:
 * 1. Match scanned card/full UID against a cat's registered RFID tag.
 * 2. If there is exactly one cat and it has no RFID registered yet, assign the
 *    scan to that cat so hardware testing works before tag setup is complete.
 */
export function useRfidVisitTracker(sensor: DeviceSensors | null) {
  const { cats, catDetails, recordVisit } = useCats();
  const lastRecordedScanKey = useRef("");
  const lastFallbackScanAt = useRef(0);

  useEffect(() => {
    if (!sensor?.online) return;

    const { rfidCard, rfidHex, lastRfidMs } = sensor;
    if (!rfidCard && !rfidHex) return;

    const scanKey =
      lastRfidMs !== null
        ? `${rfidCard}|${rfidHex}|${lastRfidMs}`
        : `${rfidCard}|${rfidHex}`;

    if (scanKey === lastRecordedScanKey.current) return;

    const card = rfidCard ?? "";
    const hex = rfidHex ?? "";
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

    const fallbackCat =
      cats.length === 1 && !hasRegisteredTag(catDetails[cats[0].id]?.rfidTag ?? "")
        ? cats[0]
        : undefined;

    const catToRecord = matchedCat ?? fallbackCat;

    if (!catToRecord) {
      console.debug("[RFID] card present but no cat matched", {
        card,
        hex,
        cardDecimal: hexToDec(card),
        hexDecimal: hexToDec(hex),
      });
      lastRecordedScanKey.current = scanKey;
      return;
    }

    // If firmware ever omits lastRfidMs, fall back to a short cooldown.
    if (lastRfidMs === null) {
      const now = Date.now();
      if (now - lastFallbackScanAt.current < FALLBACK_SCAN_COOLDOWN_MS) return;
      lastFallbackScanAt.current = now;
    }

    lastRecordedScanKey.current = scanKey;
    console.debug("[RFID] visit recorded for", catToRecord.id);
    recordVisit(catToRecord.id, DEFAULT_VISIT_DURATION_SECS);
  }, [sensor, cats, catDetails, recordVisit]);
}
