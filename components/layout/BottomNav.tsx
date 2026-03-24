"use client";

import { Home, Cat, BarChart3, Settings, Video } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const navItems = [
  { icon: Home, label: "Home", href: "/dashboard" },
  { icon: Cat, label: "My Cats", href: "/dashboard/cats" },
  { icon: BarChart3, label: "Reports", href: "/dashboard/reports" },
  { icon: Video, label: "Playback", href: "/dashboard/playback" },
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-pb">
      {/* Frosted glass container */}
      <div
        className="mx-4 mb-4 rounded-2xl border border-litter-border shadow-2xl overflow-hidden"
        style={{
          background: "var(--color-card)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname?.startsWith(`${item.href}/`));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className="relative flex flex-col items-center gap-0.5 py-1.5 px-4 rounded-xl min-w-[56px] group"
                aria-current={isActive ? "page" : undefined}
              >
                {/* Sliding background pill */}
                {isActive && (
                  <motion.div
                    layoutId="navPill"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark, var(--color-primary)))",
                      opacity: 0.12,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 600,
                      damping: 35,
                      mass: 0.8,
                    }}
                  />
                )}

                {/* Icon wrapper with scale animation */}
                <motion.div
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 600, damping: 25 }}
                  className="relative flex items-center justify-center w-7 h-7"
                >
                  {isActive && (
                    <motion.div
                      layoutId="iconGlow"
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: "var(--color-primary)",
                        filter: "blur(8px)",
                        opacity: 0.3,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 600,
                        damping: 35,
                      }}
                    />
                  )}
                  <Icon
                    className="w-5.5 h-5.5 transition-colors duration-150"
                    style={{
                      color: isActive
                        ? "var(--color-primary)"
                        : "var(--color-text-secondary, #6B7280)",
                      width: "22px",
                      height: "22px",
                    }}
                  />
                </motion.div>

                {/* Label */}
                <motion.span
                  animate={{
                    color: isActive
                      ? "var(--color-primary)"
                      : "var(--color-text-secondary, #6B7280)",
                    fontWeight: isActive ? 600 : 500,
                  }}
                  transition={{ duration: 0.15 }}
                  className="text-[10px] leading-tight"
                >
                  {item.label}
                </motion.span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}