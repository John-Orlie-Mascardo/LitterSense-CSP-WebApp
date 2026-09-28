"use client";

/**
 * TopBar.tsx
 *
 * Global dashboard header, primary navigation, install action, and notifications.
 *
 * DONE: responsive navigation, accessible dashboard logo, and notification controls
 * PLACEHOLDER: none
 *
 * NEXT: keep page titles aligned when new dashboard routes are introduced.
 */

import { AlertTriangle, BarChart3, Bell, BrainCircuit, Cat, Check, Download, Home, Settings, Trash2, Video, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import {
  getNotificationCategory,
  getTimeLabel,
  useNotifications,
  type AppNotification,
} from "@/lib/contexts/NotificationContext";
import { usePWAInstall } from "@/lib/hooks/usePWAInstall";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/predictive-health": "Predictive Health Analysis",
  "/dashboard/cats": "My Cats",
  "/dashboard/reports": "Reports",
  "/dashboard/live": "Live",
  "/dashboard/settings": "Settings",
  "/dashboard/notifications": "Notifications",
};

const navItems = [
  { icon: Home, label: "Home", href: "/dashboard" },
  { icon: Cat, label: "My Cats", href: "/dashboard/cats" },
  { icon: BarChart3, label: "Reports", href: "/dashboard/reports" },
  { icon: Video, label: "Live", href: "/dashboard/live" },
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
];

export function TopBar() {
  const { isInstallable, triggerInstall } = usePWAInstall();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const pageTitle = Object.entries(pageTitles).find(([key]) =>
    key === pathname || (key !== "/dashboard" && pathname?.startsWith(key + "/"))
  )?.[1] ?? "Dashboard";

  const handleNotificationClick = (notification: AppNotification) => {
    void markAsRead(notification.id);
    if (!notification.route) return;
    setDropdownOpen(false);
    router.push(notification.route);
  };

  const handleNotificationKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    notification: AppNotification,
  ) => {
    if (event.currentTarget !== event.target) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleNotificationClick(notification);
  };

  const getNotificationIcon = (notification: AppNotification) => {
    const category = getNotificationCategory(notification);
    if (category === "system") {
      return (
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-theme-overlay">
          <Settings className="h-4 w-4 text-theme-muted" />
        </div>
      );
    }

    return (
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-litter-primary-light">
        <AlertTriangle className="h-4 w-4 text-litter-primary" />
      </div>
    );
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40"
      style={{
        background: "var(--color-card)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderBottom: "1px solid var(--color-border)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.08)",
      }}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          href="/dashboard"
          aria-label="Go to dashboard"
          className="cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-litter-primary focus-visible:ring-offset-2 focus-visible:ring-offset-litter-card"
        >
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 600, damping: 30 }}
            className="flex items-center gap-2.5 select-none"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary) 100%)",
                boxShadow: "0 2px 8px rgba(var(--color-primary-rgb, 99,102,241), 0.35)",
              }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8ZM8.5 12C9.3 12 10 12.7 10 13.5C10 14.3 9.3 15 8.5 15C7.7 15 7 14.3 7 13.5C7 12.7 7.7 12 8.5 12ZM15.5 12C16.3 12 17 12.7 17 13.5C17 14.3 16.3 15 15.5 15C14.7 15 14 14.3 14 13.5C14 12.7 14.7 12 15.5 12ZM12 17C13.1 17 14 17.9 14 19H10C10 17.9 10.9 17 12 17Z" />
              </svg>
            </div>
            <div className="flex flex-col leading-none">
              <span
                className="font-display font-bold text-lg tracking-tight"
                style={{ color: "var(--color-primary)" }}
              >
                LitterSense
              </span>
              <span
                className="font-body text-[10px] font-medium tracking-widest uppercase opacity-60"
                style={{ color: "var(--color-text)" }}
              >
                Feline Health
              </span>
            </div>
          </motion.div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 rounded-2xl border border-litter-border bg-litter-bg/70 p-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href ||
                  (item.href !== "/dashboard" && pathname?.startsWith(`${item.href}/`));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-litter-card text-litter-primary shadow-sm"
                    : "text-theme-muted hover:bg-litter-card hover:text-litter-text"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Center: Page breadcrumb */}
        <AnimatePresence mode="wait">
          <motion.div
            key={pageTitle}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="hidden sm:flex lg:hidden items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: "var(--color-primary)",
              color: "white",
              opacity: 0.9,
            }}
          >
            <span>{pageTitle}</span>
          </motion.div>
        </AnimatePresence>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* PWA install button */}
          {isInstallable && (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 600, damping: 25 }}
              className="relative p-2 rounded-xl transition-colors"
              style={{ color: "var(--color-text)", background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              onClick={() => void triggerInstall()}
              aria-label="Install app"
            >
              <Download className="w-5 h-5" />
            </motion.button>
          )}

          <Link
            href="/dashboard/predictive-health"
            prefetch={true}
            aria-label="Predictive Health Analysis"
            aria-current={pathname === "/dashboard/predictive-health" ? "page" : undefined}
            title="Predictive Health Analysis"
            className={`relative rounded-xl p-2 transition-colors hover:bg-litter-bg ${
              pathname === "/dashboard/predictive-health"
                ? "bg-litter-primary-light text-litter-primary"
                : "text-litter-text"
            }`}
          >
            <BrainCircuit className="h-5 w-5" />
          </Link>

          {/* Notification bell + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 600, damping: 25 }}
              className="relative p-2 rounded-xl transition-colors"
              style={{ color: "var(--color-text)", background: dropdownOpen ? "var(--color-bg)" : "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg)"; }}
              onMouseLeave={(e) => { if (!dropdownOpen) e.currentTarget.style.background = "transparent"; }}
              onClick={() => setDropdownOpen((v) => !v)}
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-0.5 -right-0.5 min-w-4.5 h-[18px] bg-red-500 rounded-full flex items-center justify-center"
                    style={{ boxShadow: "0 0 0 2px var(--color-card)", fontSize: "10px", color: "white", fontWeight: 700, paddingInline: "3px" }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="absolute right-0 mt-2 overflow-hidden rounded-2xl"
                  style={{
                    width: "min(480px, calc(100vw - 1rem))",
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
                    zIndex: 50,
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <span className="font-semibold text-base" style={{ color: "var(--color-text)" }}>
                      Notifications {unreadCount > 0 && <span className="ml-1 text-xs font-normal opacity-60">({unreadCount} unread)</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllAsRead()}
                          className="text-xs px-2 py-1 rounded-lg transition-colors"
                          style={{ color: "var(--color-primary)", background: "transparent" }}
                          title="Mark all as read"
                        >
                          Mark all read
                        </button>
                      )}
                      <button onClick={() => setDropdownOpen(false)} className="p-1 rounded-lg opacity-50 hover:opacity-100" style={{ color: "var(--color-text)" }}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* List */}
                  <div className="overflow-y-auto" style={{ minHeight: "260px", maxHeight: "520px" }}>
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: "260px" }}>
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center"
                          style={{
                            background: "rgba(var(--color-primary-rgb, 99,102,241), 0.10)",
                          }}
                        >
                          <Bell className="w-7 h-7" style={{ color: "var(--color-primary)" }} />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>No notifications</span>
                          <span className="text-xs opacity-50 text-center px-6" style={{ color: "var(--color-text)" }}>You&apos;re all caught up! We&apos;ll let you know when something needs attention.</span>
                        </div>
                      </div>
                    ) : (
                      notifications.slice(0, 20).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          onKeyDown={(event) => handleNotificationKeyDown(event, n)}
                          role="button"
                          tabIndex={0}
                          aria-label={
                            n.route
                              ? `Open notification: ${n.title}`
                              : `Mark notification as read: ${n.title}`
                          }
                          className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-theme-hover"
                          style={{
                            background: n.isRead ? "transparent" : "rgba(var(--color-primary-rgb, 99,102,241), 0.08)",
                            borderBottom: "1px solid var(--color-border)",
                            cursor: "pointer",
                          }}
                        >
                          {getNotificationIcon(n)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold leading-snug" style={{ color: "var(--color-text)" }}>{n.title}</p>
                              {!n.isRead && (
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-litter-primary" />
                              )}
                            </div>
                            <p className="mt-1 text-sm leading-snug text-theme-muted">{n.message}</p>
                            <p className="text-xs opacity-40 mt-1.5" style={{ color: "var(--color-text)" }}>
                              {n.createdAt ? getTimeLabel(n.createdAt) : ""}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            {!n.isRead && (
                              <button onClick={(e) => { e.stopPropagation(); void markAsRead(n.id); }} className="p-1 rounded-lg opacity-50 hover:opacity-100 transition-opacity" title="Mark as read" style={{ color: "var(--color-primary)" }}>
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); void deleteNotification(n.id); }} className="p-1 rounded-lg opacity-30 hover:opacity-80 transition-opacity" title="Delete" style={{ color: "var(--color-text)" }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3.5" style={{ borderTop: "1px solid var(--color-border)" }}>
                    <Link href="/dashboard/notifications" onClick={() => setDropdownOpen(false)}>
                      <span className="block rounded-lg py-2 text-center text-xs font-semibold text-litter-primary transition-colors hover:bg-theme-hover">
                        Open notifications
                      </span>
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>

      {/* Animated bottom highlight line */}
      <motion.div
        className="absolute bottom-0 left-0 h-[1.5px] w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--color-primary) 50%, transparent 100%)",
          opacity: 0.3,
        }}
        animate={{ opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </header>
  );
}

