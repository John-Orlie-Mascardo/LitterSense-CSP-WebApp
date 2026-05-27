"use client";

import { useDeviceSensors } from "@/lib/hooks/useDeviceSensors";
import { useRfidVisitTracker } from "@/lib/hooks/useRfidVisitTracker";
import { useNotifications } from "@/lib/contexts/NotificationContext";
import { useSettings } from "@/lib/hooks/useSettings";

export function RfidVisitBridge() {
  const { data } = useDeviceSensors();
  const { addNotification } = useNotifications();
  const { settings } = useSettings();

  useRfidVisitTracker(data, {
    rfidVisitAlerts: settings.notifications.rfidVisitAlerts,
    addNotification,
  });

  return null;
}
