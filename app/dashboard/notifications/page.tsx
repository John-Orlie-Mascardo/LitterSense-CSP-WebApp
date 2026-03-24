"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CheckCheck,
  MoreVertical,
  Shield,
  Settings,
  Info,
  Trash2,
} from "lucide-react";
import { BottomNav } from "@/components/layout/BottomNav";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType = "health" | "system" | "cat_visit";
type NotificationTab = "all" | "alerts" | "system";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timeLabel: string;
  dateGroup: "today" | "yesterday" | "earlier";
  isRead: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    type: "health",
    title: "Health Alert",
    message: "Mochi has not visited the litter box in over 24 hours. Please check on her.",
    timeLabel: "2m ago",
    dateGroup: "today",
    isRead: false,
  },
  {
    id: "2",
    type: "cat_visit",
    title: "Cat Visit Detected",
    message: "Luna visited the litter box. Session duration: 3m 42s.",
    timeLabel: "1h ago",
    dateGroup: "today",
    isRead: true,
  },
  {
    id: "3",
    type: "system",
    title: "System Update",
    message: "Version 2.4.0 is now available. Please update for the latest features.",
    timeLabel: "1d ago",
    dateGroup: "yesterday",
    isRead: true,
  },
  {
    id: "4",
    type: "cat_visit",
    title: "Cat Visit Detected",
    message: "Thank you for verifying your email address. Your account is now fully active.",
    timeLabel: "1d ago",
    dateGroup: "yesterday",
    isRead: true,
  },
  {
    id: "5",
    type: "health",
    title: "Health Alert",
    message: "Unusual litter usage pattern detected for Nala. Consider consulting a vet.",
    timeLabel: "3d ago",
    dateGroup: "earlier",
    isRead: true,
  },
  {
    id: "6",
    type: "system",
    title: "System Update",
    message: "LitterSense firmware v1.2.4 was successfully installed on your device.",
    timeLabel: "3d ago",
    dateGroup: "earlier",
    isRead: true,
  },
];

// ─── Notification Icon ────────────────────────────────────────────────────────

function NotifIcon({ type }: { readonly type: NotificationType }) {
  if (type === "health") {
    return (
      <div className="w-11 h-11 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
        <Shield className="w-5 h-5 text-orange-500" />
      </div>
    );
  }
  if (type === "system") {
    return (
      <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
        <Settings className="w-5 h-5 text-blue-400" />
      </div>
    );
  }
  return (
    <div className="w-11 h-11 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
      <Info className="w-5 h-5 text-litter-primary" />
    </div>
  );
}

// ─── Tab filter ───────────────────────────────────────────────────────────────

function matchesTab(type: NotificationType, tab: NotificationTab): boolean {
  if (tab === "all") return true;
  if (tab === "alerts") return type === "health" || type === "cat_visit";
  if (tab === "system") return type === "system";
  return true;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [activeTab, setActiveTab] = useState<NotificationTab>("all");
  const [showMenu, setShowMenu] = useState(false);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setShowMenu(false);
  };

  const handleClearAll = () => {
    setNotifications([]);
    setShowMenu(false);
  };

  const handleMarkRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const handleDelete = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const filtered = notifications.filter((n) => matchesTab(n.type, activeTab));

  const dateGroups: { label: string; key: "today" | "yesterday" | "earlier" }[] = [
    { label: "TODAY", key: "today" },
    { label: "YESTERDAY", key: "yesterday" },
    { label: "EARLIER", key: "earlier" },
  ];

  const tabs: { key: NotificationTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "alerts", label: "Alerts" },
    { key: "system", label: "System" },
  ];

  return (
    <div className="min-h-screen bg-[#F2F2F2] pb-24">

      {/* ── Fixed Header ─────────────────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 bg-litter-card z-50 shadow-sm">
        <div className="max-w-lg mx-auto">

          {/* Row 1: back + title + icons */}
          <div className="flex items-center justify-between px-4 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.back()}
                className="p-1 -ml-1 rounded-lg hover:bg-theme-overlay transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-litter-text" />
              </button>
              <h1 className="text-xl font-bold text-litter-text">Notifications</h1>
            </div>

            <div className="flex items-center gap-0.5 relative">
              {/* Mark all read */}
              <button
                onClick={handleMarkAllRead}
                className="p-2 rounded-lg hover:bg-theme-overlay transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-5 h-5 text-litter-primary" />
              </button>

              {/* Kebab menu */}
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="p-2 rounded-lg hover:bg-theme-overlay transition-colors"
              >
                <MoreVertical className="w-5 h-5 text-litter-text" />
              </button>

              {/* Dropdown */}
              <AnimatePresence>
                {showMenu && (
                  <>
                    <button
                      className="fixed inset-0 z-40 bg-transparent cursor-default"
                      onClick={() => setShowMenu(false)}
                      aria-label="Close menu"
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -6 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-11 right-0 bg-litter-card rounded-xl shadow-xl border border-gray-100 py-1 w-44 z-50"
                    >
                      <button
                        onClick={handleMarkAllRead}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-litter-text hover:bg-theme-hover transition-colors"
                      >
                        <CheckCheck className="w-4 h-4 text-litter-primary" />
                        Mark all as read
                      </button>
                      <button
                        onClick={handleClearAll}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Clear all
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Row 2: Tabs */}
          <div className="flex px-4 border-b border-gray-100">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative mr-7 pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key ? "text-litter-primary" : "text-[#6B7280]"
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <motion.div
                    layoutId="notifTabLine"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-litter-primary rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      {/* pt-[112px] = header height (top row ~60px + tabs ~52px) */}
      <main className="pt-[112px] max-w-lg mx-auto">

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center px-8">
            <div className="w-14 h-14 rounded-full bg-litter-primary-light flex items-center justify-center mb-4">
              <CheckCheck className="w-7 h-7 text-litter-primary" />
            </div>
            <p className="font-semibold text-litter-text mb-1">All caught up!</p>
            <p className="text-sm text-theme-muted">No notifications here.</p>
          </div>
        ) : (
          <>
            {dateGroups.map(({ label, key }) => {
              const group = filtered.filter((n) => n.dateGroup === key);
              if (group.length === 0) return null;

              return (
                <div key={key}>

                  {/* Date header — same grey label style as wireframe */}
                  <div className="px-4 pt-5 pb-2">
                    <p className="text-xs font-semibold text-theme-muted tracking-widest uppercase">
                      {label}
                    </p>
                  </div>

                  {/* White card block for this group */}
                  <div className="bg-litter-card">
                    <AnimatePresence>
                      {group.map((notif, idx) => (
                        <motion.div
                          key={notif.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          onClick={() => handleMarkRead(notif.id)}
                          className={`flex items-start gap-3 px-4 py-4 cursor-pointer transition-colors hover:bg-theme-hover ${
                            idx === 0 ? "" : "border-t border-gray-100"
                          }`}
                        >
                          {/* Colored icon */}
                          <NotifIcon type={notif.type} />

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            {/* Title + timestamp + blue dot */}
                            <div className="flex items-start justify-between gap-2 mb-0.5">
                              <p className={`text-sm leading-snug ${
                                  notif.isRead
                                    ? "font-semibold text-litter-text"
                                    : "font-bold text-litter-text"
                                }`}>
                                {notif.title}
                              </p>
                              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                <span className="text-xs text-theme-muted whitespace-nowrap">
                                  {notif.timeLabel}
                                </span>
                                {!notif.isRead && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                                )}
                              </div>
                            </div>

                            {/* Message body */}
                            <p className="text-sm text-theme-muted leading-snug">
                              {notif.message}
                            </p>
                          </div>

                          {/* Delete */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(notif.id);
                            }}
                            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors mt-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                </div>
              );
            })}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}