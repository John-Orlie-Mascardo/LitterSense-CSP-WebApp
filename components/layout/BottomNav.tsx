"use client";

import { Home, Cat, BarChart3, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const navItems = [
  { icon: Home, label: "Home", href: "/dashboard" },
  { icon: Cat, label: "My Cats", href: "/cats" },
  { icon: BarChart3, label: "Reports", href: "/reports" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8E2D9] px-4 py-2 z-50 safe-area-pb">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center gap-1 py-2 px-4 min-w-[64px]"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#1E6B5E] rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <Icon
                className={`w-6 h-6 transition-colors duration-200 ${
                  isActive ? "text-[#1E6B5E]" : "text-[#6B7280]"
                }`}
              />
              <span
                className={`text-xs font-medium transition-colors duration-200 ${
                  isActive ? "text-[#1E6B5E]" : "text-[#6B7280]"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
