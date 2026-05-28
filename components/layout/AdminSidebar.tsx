"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Trash2,
  Shield,
  Menu,
  X,
  UserPlus,
  LogOut,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useDeleteRequest } from "@/lib/contexts/DeleteRequestContext";
import { useState } from "react";

// ─── Nav items ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Overview",        href: "/admin",           icon: LayoutDashboard, exact: true  },
  { label: "Users",           href: "/admin/users",      icon: Users,           exact: false },
  { label: "Delete Requests", href: "/admin/requests",   icon: Trash2,          exact: false, badge: true },
  { label: "Add Admin",       href: "/admin/add-admin",  icon: UserPlus,        exact: false },
];

const isActive = (pathname: string, href: string, exact: boolean) =>
  exact ? pathname === href : pathname.startsWith(href);

// ─── Brand header (reused in desktop + mobile drawer) ──────────────────────

function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-5 shrink-0 border-b border-litter-border
        bg-gradient-to-br from-litter-primary-light/50 via-litter-primary-light/10 to-transparent
        ${compact ? "h-14" : "h-16"}`}
    >
      <div className={`rounded-xl bg-litter-primary flex items-center justify-center shrink-0
        shadow-md shadow-litter-primary/25 ${compact ? "w-7 h-7" : "w-9 h-9"}`}>
        <Shield
          className="text-white"
          size={compact ? 13 : 17}
          strokeWidth={2.5}
        />
      </div>
      <div className="leading-tight">
        <p className={`font-display font-bold text-litter-text leading-none tracking-[-0.01em]
          ${compact ? "text-sm" : "text-[15px]"}`}>
          LitterSense
        </p>
        <p className="text-[9px] text-litter-primary font-semibold uppercase tracking-[0.15em] leading-none mt-[3px]">
          Admin Panel
        </p>
      </div>
    </div>
  );
}

// ─── Shared sidebar body ────────────────────────────────────────────────────

interface SidebarContentProps {
  pathname: string;
  pendingCount: number;
  adminInitial: string;
  adminName: string;
  adminEmail: string;
  onNavigate?: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}

function SidebarContent({
  pathname,
  pendingCount,
  adminInitial,
  adminName,
  adminEmail,
  onNavigate,
  onLogout,
  loggingOut,
}: SidebarContentProps) {
  return (
    <>
      {/* ── Section label ── */}
      <div className="px-5 pt-5 pb-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-litter-muted/60 select-none">
          Menu
        </span>
      </div>

      {/* ── Nav links ── */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ label, href, icon: Icon, exact, badge }) => {
          const active = isActive(pathname, href, exact);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200
                ${
                  active
                    ? "bg-litter-primary text-white shadow-sm shadow-litter-primary/30"
                    : "text-litter-muted hover:text-litter-text hover:bg-litter-primary-light/55"
                }
              `}
            >
              <Icon
                size={16}
                className={`shrink-0 transition-all duration-200
                  ${active
                    ? "text-white"
                    : "text-litter-muted/80 group-hover:text-litter-primary group-hover:scale-110"
                  }`}
              />
              <span className="flex-1 leading-none truncate">{label}</span>

              {badge && pendingCount > 0 && (
                <span
                  className={`
                    text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 rounded-full
                    flex items-center justify-center leading-none shrink-0
                    ${active ? "bg-white/25 text-white" : "bg-litter-danger-bg text-litter-danger-text"}
                  `}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="p-3 border-t border-litter-border">
        {/* Profile card */}
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-litter-bg border border-litter-border/60 mb-1.5">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-litter-primary flex items-center justify-center
              text-white text-sm font-bold ring-2 ring-white/50 ring-offset-1 ring-offset-litter-bg">
              {adminInitial}
            </div>
            {/* Online dot */}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400
              border-2 border-litter-bg rounded-full" />
          </div>

          {/* Name + email */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-semibold text-litter-text leading-none truncate">
                {adminName}
              </p>
            </div>
            <p className="text-[10px] text-litter-muted leading-none mt-1 truncate">
              {adminEmail}
            </p>
          </div>

          {/* Role badge */}
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider
            text-litter-primary bg-litter-primary-light px-2 py-1 rounded-full leading-none">
            Admin
          </span>
        </div>

        {/* Sign out */}
        <button
          onClick={onLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium
            text-litter-muted hover:text-red-500 hover:bg-red-500/8
            transition-all duration-200 group
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut
            size={15}
            className={`shrink-0 transition-transform duration-200
              group-hover:-translate-x-0.5
              ${loggingOut ? "animate-pulse text-red-400" : ""}`}
          />
          <span className="leading-none">
            {loggingOut ? "Signing out…" : "Sign out"}
          </span>
        </button>
      </div>
    </>
  );
}

// ─── Main export ────────────────────────────────────────────────────────────

export function AdminSidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user }  = useAuth();
  const { requests } = useDeleteRequest();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const adminName    = user?.displayName || user?.email?.split("@")[0] || "Admin";
  const adminInitial = adminName[0].toUpperCase();
  const adminEmail   = user?.email ?? "";

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
      router.push("/login");
    } catch (err) {
      console.error("Logout error:", err);
      setLoggingOut(false);
    }
  };

  const sharedProps: Omit<SidebarContentProps, "onNavigate"> = {
    pathname,
    pendingCount,
    adminInitial,
    adminName,
    adminEmail,
    onLogout: handleLogout,
    loggingOut,
  };

  return (
    <>
      {/* ──────────────────── Mobile top bar ──────────────────── */}
      <div className="lg:hidden flex items-center justify-between px-4 h-14
        bg-litter-card border-b border-litter-border sticky top-0 z-40">

        {/* Brand mark */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-litter-primary flex items-center justify-center
            shadow-sm shadow-litter-primary/20">
            <Shield size={13} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="font-display font-bold text-litter-text text-sm leading-none">
              LitterSense
            </p>
            <p className="text-[8px] text-litter-primary font-semibold uppercase tracking-[0.15em] leading-none mt-0.5">
              Admin
            </p>
          </div>
        </div>

        {/* Right side: user pill + menu button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
            bg-litter-bg border border-litter-border">
            <div className="w-5 h-5 rounded-full bg-litter-primary flex items-center justify-center
              text-white text-[10px] font-bold shrink-0">
              {adminInitial}
            </div>
            <span className="text-[11px] font-medium text-litter-text leading-none max-w-[96px] truncate">
              {adminName}
            </span>
          </div>

          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-xl text-litter-muted hover:text-litter-text
              hover:bg-litter-primary-light/60 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </div>

      {/* ──────────────────── Mobile overlay ─────────────────── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          onClick={() => setMobileOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Drawer */}
          <div
            className="relative w-72 bg-litter-card h-full flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer brand header */}
            <div className="flex items-center justify-between px-4 shrink-0
              border-b border-litter-border
              bg-gradient-to-br from-litter-primary-light/50 via-litter-primary-light/10 to-transparent">
              <div className="flex items-center gap-2.5 h-14">
                <div className="w-7 h-7 rounded-lg bg-litter-primary flex items-center justify-center
                  shadow-sm shadow-litter-primary/20">
                  <Shield size={13} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="font-display font-bold text-litter-text text-sm leading-none">
                    LitterSense
                  </p>
                  <p className="text-[8px] text-litter-primary font-semibold uppercase tracking-[0.15em] leading-none mt-0.5">
                    Admin Panel
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-litter-muted hover:text-litter-text
                  hover:bg-litter-overlay transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <SidebarContent
              {...sharedProps}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ──────────────────── Desktop sidebar ────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0
        bg-litter-card border-r border-litter-border
        min-h-screen sticky top-0 h-screen">

        <BrandHeader />
        <SidebarContent {...sharedProps} />
      </aside>
    </>
  );
}
