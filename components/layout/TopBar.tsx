"use client";

import { Bell, User, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/lib/contexts/NotificationContext";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/cats": "My Cats",
  "/dashboard/reports": "Reports",
  "/dashboard/playback": "Playback",
  "/dashboard/settings": "Settings",
  "/dashboard/notifications": "Notifications",
};

export function TopBar() {
  const { unreadCount } = useNotifications();
  const pathname = usePathname();

  const pageTitle = Object.entries(pageTitles).find(([key]) =>
    key === pathname || (key !== "/dashboard" && pathname?.startsWith(key + "/"))
  )?.[1] ?? "Dashboard";

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
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <motion.div
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 600, damping: 30 }}
          className="flex items-center gap-2.5 cursor-pointer select-none"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
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

        {/* Center: Page breadcrumb */}
        <AnimatePresence mode="wait">
          <motion.div
            key={pageTitle}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
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
          {/* Notification bell */}
          <Link href="/dashboard/notifications">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 600, damping: 25 }}
              className="relative p-2 rounded-xl transition-colors"
              style={{
                color: "var(--color-text)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center"
                    style={{
                      boxShadow: "0 0 0 2px var(--color-card)",
                      fontSize: "10px",
                      color: "white",
                      fontWeight: 700,
                      paddingInline: "3px",
                    }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </Link>

          {/* Divider */}
          <div
            className="w-px h-6 opacity-20"
            style={{ background: "var(--color-text)" }}
          />

          {/* User avatar */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 600, damping: 25 }}
            className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-xl transition-colors"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
            aria-label="User profile"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: "var(--color-primary-light)",
                color: "var(--color-primary)",
              }}
            >
              <User className="w-4 h-4" />
            </div>
            <ChevronDown
              className="w-3 h-3 opacity-50"
              style={{ color: "var(--color-text)" }}
            />
          </motion.button>
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