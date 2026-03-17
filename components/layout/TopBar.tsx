"use client";

import { Bell, User } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

export function TopBar() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-[#E8E2D9] z-40"
    >
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#1E6B5E] flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-white"
              fill="currentColor"
            >
              <path d="M12 2C10.9 2 10 2.9 10 4C10 5.1 10.9 6 12 6C13.1 6 14 5.1 14 4C14 2.9 13.1 2 12 2ZM6 5C4.9 5 4 5.9 4 7C4 8.1 4.9 9 6 9C7.1 9 8 8.1 8 7C8 5.9 7.1 5 6 5ZM18 5C16.9 5 16 5.9 16 7C16 8.1 16.9 9 18 9C19.1 9 20 8.1 20 7C20 5.9 19.1 5 18 5ZM12 8C9.5 8 7.2 9.2 6 11.2V18C6 20.2 7.8 22 10 22H14C16.2 22 18 20.2 18 18V11.2C16.8 9.2 14.5 8 12 8ZM8.5 12C9.3 12 10 12.7 10 13.5C10 14.3 9.3 15 8.5 15C7.7 15 7 14.3 7 13.5C7 12.7 7.7 12 8.5 12ZM15.5 12C16.3 12 17 12.7 17 13.5C17 14.3 16.3 15 15.5 15C14.7 15 14 14.3 14 13.5C14 12.7 14.7 12 15.5 12ZM12 17C13.1 17 14 17.9 14 19H10C10 17.9 10.9 17 12 17Z" />
            </svg>
          </div>
          <span className="font-display font-bold text-xl text-[#1E6B5E]">
            LitterSense
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Notification bell — links to /dashboard/notifications */}
          <Link href="/dashboard/notifications">
            <button className="relative p-2 rounded-xl hover:bg-[#FDFAF6] transition-colors">
              <Bell className="w-6 h-6 text-[#1C1C1C]" />
              {/* Unread indicator — remove this span once all notifications are read */}
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
            </button>
          </Link>

          {/* User avatar */}
          <button className="w-10 h-10 rounded-full bg-[#D4EDE8] flex items-center justify-center text-[#1E6B5E] font-medium hover:bg-[#1E6B5E] hover:text-white transition-colors">
            <User className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.header>
  );
}