"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCheck,
  MoreVertical,
  Settings,
  Trash2,
} from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";
import {
  getDateGroup,
  getNotificationCategory,
  getTimeLabel,
  useNotifications,
  type AppNotification,
  type NotificationCategory,
} from "@/lib/contexts/NotificationContext";

type NotificationTab = "all" | NotificationCategory;

function NotificationIcon({
  notification,
}: {
  readonly notification: AppNotification;
}) {
  const category = getNotificationCategory(notification);
  if (category === "system") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-theme-overlay">
        <Settings className="h-5 w-5 text-theme-muted" />
      </div>
    );
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-litter-primary-light">
      <AlertTriangle className="h-5 w-5 text-litter-primary" />
    </div>
  );
}

function matchesTab(notification: AppNotification, tab: NotificationTab) {
  if (tab === "all") return true;
  return getNotificationCategory(notification) === tab;
}

function EmptyState({ activeTab }: { readonly activeTab: NotificationTab }) {
  const label =
    activeTab === "alerts"
      ? "No alert notifications"
      : activeTab === "system"
        ? "No system notifications"
        : "No notifications";

  return (
    <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-litter-primary-light">
        <Bell className="h-7 w-7 text-litter-primary" />
      </div>
      <p className="font-semibold text-litter-text">{label}</p>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-theme-muted">
        You&apos;re all caught up. New cat, litter box, and system updates will appear here.
      </p>
    </div>
  );
}

function NotificationRow({
  notification,
  onOpen,
  onDelete,
}: {
  readonly notification: AppNotification;
  readonly onOpen: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.16 }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`flex cursor-pointer items-start gap-3 border-b border-litter-border px-4 py-4 transition-colors hover:bg-theme-hover ${
        notification.isRead ? "bg-litter-card" : "bg-litter-primary-light/50"
      }`}
    >
      <NotificationIcon notification={notification} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold leading-snug text-litter-text">
            {notification.title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-xs text-theme-muted">
              {notification.createdAt ? getTimeLabel(notification.createdAt) : ""}
            </span>
            {!notification.isRead && (
              <span className="h-2 w-2 rounded-full bg-litter-primary" />
            )}
          </div>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-theme-muted">
          {notification.message}
        </p>
        {notification.catName && (
          <span className="mt-2 inline-flex rounded-full bg-theme-overlay px-2 py-0.5 text-xs font-medium text-theme-muted">
            {notification.catName}
          </span>
        )}
      </div>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-theme-muted transition-colors hover:bg-litter-danger-bg hover:text-litter-danger"
        aria-label="Delete notification"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const {
    notifications,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();
  const [activeTab, setActiveTab] = useState<NotificationTab>("all");
  const [showMenu, setShowMenu] = useState(false);

  const tabs: { key: NotificationTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "alerts", label: "Alerts" },
    { key: "system", label: "System" },
  ];

  const filtered = useMemo(
    () => notifications.filter((notification) => matchesTab(notification, activeTab)),
    [activeTab, notifications],
  );

  const groups = useMemo(
    () =>
      [
        { label: "Today", key: "today" as const },
        { label: "Yesterday", key: "yesterday" as const },
        { label: "Earlier", key: "earlier" as const },
      ].map((group) => ({
        ...group,
        notifications: filtered.filter(
          (notification) =>
            notification.createdAt &&
            getDateGroup(notification.createdAt) === group.key,
        ),
      })),
    [filtered],
  );

  const handleNotificationClick = async (notification: AppNotification) => {
    await markAsRead(notification.id);
    if (notification.route) {
      router.push(notification.route);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    setShowMenu(false);
  };

  const handleClearAll = async () => {
    await clearAll();
    setShowMenu(false);
  };

  return (
    <div className="min-h-screen bg-litter-bg pb-24 lg:pb-10">
      <header className="sticky top-0 z-40 border-b border-litter-border bg-litter-card/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-litter-text transition-colors hover:bg-theme-hover"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="font-display text-xl font-bold text-litter-text">
                  Notifications
                </h1>
                <p className="text-xs text-theme-muted">
                  Alerts and system updates
                </p>
              </div>
            </div>

            <div className="relative flex items-center gap-1">
              <button
                onClick={handleMarkAllRead}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-litter-primary transition-colors hover:bg-theme-hover"
                aria-label="Mark all as read"
              >
                <CheckCheck className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowMenu((value) => !value)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-litter-text transition-colors hover:bg-theme-hover"
                aria-label="Open notification menu"
              >
                <MoreVertical className="h-5 w-5" />
              </button>

              <AnimatePresence>
                {showMenu && (
                  <>
                    <button
                      className="fixed inset-0 z-40 cursor-default bg-transparent"
                      onClick={() => setShowMenu(false)}
                      aria-label="Close menu"
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-xl border border-litter-border bg-litter-card shadow-xl"
                    >
                      <button
                        onClick={handleMarkAllRead}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-litter-text transition-colors hover:bg-theme-hover"
                      >
                        <CheckCheck className="h-4 w-4 text-litter-primary" />
                        Mark all as read
                      </button>
                      <button
                        onClick={handleClearAll}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-litter-danger transition-colors hover:bg-litter-danger-bg"
                      >
                        <Trash2 className="h-4 w-4" />
                        Clear all
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-3 pb-3 pt-1 text-sm font-medium transition-colors ${
                  activeTab === tab.key ? "text-litter-primary" : "text-theme-muted"
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <motion.span
                    layoutId="notification-tab"
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-litter-primary"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-5">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-xl border border-litter-border bg-litter-card"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-litter-border bg-litter-card shadow-sm">
            <EmptyState activeTab={activeTab} />
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => {
              if (group.notifications.length === 0) return null;

              return (
                <section key={group.key}>
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-theme-muted">
                    {group.label}
                  </p>
                  <div className="overflow-hidden rounded-2xl border border-litter-border bg-litter-card shadow-sm">
                    <AnimatePresence initial={false}>
                      {group.notifications.map((notification) => (
                        <NotificationRow
                          key={notification.id}
                          notification={notification}
                          onOpen={() => void handleNotificationClick(notification)}
                          onDelete={() => void deleteNotification(notification.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
