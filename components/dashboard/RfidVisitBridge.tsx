"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useAirQualityReadings } from "@/lib/hooks/useAirQualityReadings";
import { useDeviceSensors } from "@/lib/hooks/useDeviceSensors";
import { useNotifications } from "@/lib/contexts/NotificationContext";
import { useSettings } from "@/lib/hooks/useSettings";

export function RfidVisitBridge() {
  const { data, isLoading, error } = useDeviceSensors();
  const { user } = useAuth();
  const readings = useAirQualityReadings(data, isLoading, error);
  const gasAlerts = useRef(new Set<string>());
  const { addNotification } = useNotifications();
  const { settings } = useSettings();

  // RFID notices originate in authenticated sensor ingestion, even with no dashboard open.

  useEffect(() => {
    gasAlerts.current.clear();
  }, [user?.uid]);

  useEffect(() => {
    for (const [source, reading, enabled, title] of [
      ["ammonia_alert", readings.ammonia, settings.notifications.ammoniaAlerts, "Urine detected"],
      ["h2s_alert", readings.h2s, settings.notifications.h2sAlerts, "Stool detected"],
    ] as const) {
      if (!reading.online || isLoading || error) continue;
      if (reading.status !== "alert" || !enabled) {
        gasAlerts.current.delete(source);
        continue;
      }
      if (!user || gasAlerts.current.has(source)) continue;
      gasAlerts.current.add(source);
      void addNotification({
        type: "health",
        source,
        title,
        message: "Gas detected near the litter box. Check the litter box and ventilation.",
        route: "/dashboard",
      }).catch((cause) => {
        gasAlerts.current.delete(source);
        console.error("Failed to save gas alert:", cause);
      });
    }
  }, [readings, settings.notifications.ammoniaAlerts, settings.notifications.h2sAlerts, isLoading, error, user, addNotification]);

  return null;
}
