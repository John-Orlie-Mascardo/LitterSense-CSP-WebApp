"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Settings } from "lucide-react";

interface NotificationPermissionBannerProps {
  readonly show: boolean;
  readonly status: "idle" | "granted" | "denied" | "dismissed";
  readonly onEnable: () => void;
  readonly onDismiss: () => void;
}

export function NotificationPermissionBanner({
  show,
  status,
  onEnable,
  onDismiss,
}: NotificationPermissionBannerProps) {
  return (
    <AnimatePresence>

      {/* ── Ask permission banner (default state) ── */}
      {show && status !== "denied" && (
        <motion.div
          key="ask-banner"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mx-4 mt-3 mb-1 bg-[#1E6B5E] rounded-2xl px-4 py-3 shadow-md"
        >
          <div className="flex items-start gap-3">
            {/* Bell icon */}
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
              <Bell className="w-5 h-5 text-white" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-snug mb-0.5">
                Enable push notifications
              </p>
              <p className="text-white/80 text-xs leading-snug">
                Get alerted when your cat shows unusual behavior, even when the app is closed.
              </p>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={onEnable}
                  className="px-4 py-1.5 bg-white text-[#1E6B5E] text-xs font-semibold rounded-lg hover:bg-white/90 transition-colors"
                >
                  Enable
                </button>
                <button
                  onClick={onDismiss}
                  className="px-4 py-1.5 bg-white/20 text-white text-xs font-medium rounded-lg hover:bg-white/30 transition-colors"
                >
                  Maybe Later
                </button>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onDismiss}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Denied state — show settings hint ── */}
      {status === "denied" && (
        <motion.div
          key="denied-banner"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
          className="mx-4 mt-3 mb-1 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <Settings className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-amber-800 font-semibold text-sm mb-0.5">
                Notifications are blocked
              </p>
              <p className="text-amber-700 text-xs leading-snug">
                You can enable this later in your browser Settings → Site Permissions → Notifications.
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded-lg hover:bg-amber-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-amber-500" />
            </button>
          </div>
        </motion.div>
      )}

    </AnimatePresence>
  );
}