"use client";

/**
 * HomeAlertBanner
 *
 * Shows unread alerts (urine/stool detected, abnormal behaviour, litter level) at the
 * top of Home, so owners see them without opening the notifications page.
 * Reads the existing NotificationContext list: no extra subscription. Closing an
 * alert marks it read, so the bell count stays in sync.
 * Also warns when a board has been offline for more than 5 minutes (QA C1, in-app only).
 */
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, WifiOff, X } from "lucide-react";
import { useNotifications, type AppNotification } from "@/lib/contexts/NotificationContext";
import type { OfflineBoard } from "@/lib/utils/deviceOffline";

const MAX_VISIBLE = 3;
const ALERT_SOURCES = new Set(["dashboard_abnormal", "ammonia_alert", "h2s_alert", "litter_level"]);

/** Alerts worth interrupting for; routine entry/exit visit notices are left to the bell. */
export function isHomeAlert(notification: Pick<AppNotification, "type" | "source" | "isRead">): boolean {
  if (notification.isRead) return false;
  if (notification.source) return ALERT_SOURCES.has(notification.source);
  return notification.type === "health";
}

export function formatOfflineBoardMessage(board: OfflineBoard): string {
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })
    .format(new Date(board.lastSeenAt));
  return `${board.label} is offline. Last signal at ${time}. Check its power and Wi-Fi.`;
}

export function HomeAlertBanner({ offlineBoards = [] }: { readonly offlineBoards?: readonly OfflineBoard[] }) {
  const { notifications, markAsRead } = useNotifications();
  // Dismissed per outage: a new outage (different last signal) shows again.
  const [dismissedOutages, setDismissedOutages] = useState<ReadonlySet<string>>(() => new Set());
  // Hide a closed alert at once; saving "read" to the server can take a few seconds.
  const [dismissedAlertIds, setDismissedAlertIds] = useState<ReadonlySet<string>>(() => new Set());
  const alerts = notifications.filter((notification) => isHomeAlert(notification) && !dismissedAlertIds.has(notification.id));
  const outages = offlineBoards.filter((board) => !dismissedOutages.has(`${board.board}:${board.lastSeenAt}`));
  if (alerts.length === 0 && outages.length === 0) return null;

  return (
    <section aria-label="Alerts" className="mb-6 space-y-2">
      {outages.map((board) => (
        <div
          key={board.board}
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-litter-border bg-litter-card p-4"
        >
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-litter-muted" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-litter-text">{formatOfflineBoardMessage(board)}</p>
          <button
            type="button"
            onClick={() => setDismissedOutages((prev) => new Set(prev).add(`${board.board}:${board.lastSeenAt}`))}
            aria-label={`Dismiss: ${board.label} offline`}
            className="shrink-0 rounded-lg p-1 text-litter-muted hover:text-litter-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {alerts.slice(0, MAX_VISIBLE).map((alert) => (
        <div
          key={alert.id}
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-litter-text">{alert.title}</p>
            {alert.message && <p className="mt-0.5 text-sm text-litter-muted">{alert.message}</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              setDismissedAlertIds((prev) => new Set(prev).add(alert.id));
              void markAsRead(alert.id);
            }}
            aria-label={`Dismiss alert: ${alert.title}`}
            className="shrink-0 rounded-lg p-1 text-litter-muted hover:text-litter-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {alerts.length > MAX_VISIBLE && (
        <Link href="/dashboard/notifications" className="block text-right text-sm font-semibold text-litter-primary">
          View all {alerts.length} alerts
        </Link>
      )}
    </section>
  );
}
