"use client";

import { useDeviceSensors } from "@/lib/hooks/useDeviceSensors";
import { useRfidVisitTracker } from "@/lib/hooks/useRfidVisitTracker";

export function RfidVisitBridge() {
  const { data } = useDeviceSensors();
  useRfidVisitTracker(data);

  return null;
}
