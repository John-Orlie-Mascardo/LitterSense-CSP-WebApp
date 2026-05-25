"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Trash2,
  Shield,
  ArrowLeft,
  ChevronRight,
  Menu,
  X,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useDeleteRequest } from "@/lib/contexts/DeleteRequestContext";
import { useState } from "react";

// ─── Nav items ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/admin",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: Users,
    exact: false,
  },
  {
    label: "Delete Requests",
    href: "/admin/requests",
    icon: Trash2,
    exact: false,
    badge: true,
  },
  {
    label: "Add Admin",
    href: "/admin/add-admin",
    icon: UserPlus,
    exact: false,
  },
];

interface AdminNavListProps {
  pathname: string;
  pendingCount: number;
  onNavigate?: () => void;
}

const isAdminRouteActive = (pathname: string, href: string, exact: boolean) =>
  exact ? pathname === href : pathname.startsWith(href);

function AdminNavList({
  pathname,
  pendingCount,
  onNavigate,
}: AdminNavListProps) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map(({ label, href, icon: Icon, exact, badge }) => {
        const active = isAdminRouteActive(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`
              group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
              transition-all duration-200 relative
              ${
                active
                  ? "bg-litter-primary text-white shadow-sm"
                  : "text-litter-muted hover:text-litter-text hover:bg-litter-primary-light/60"
              }
            `}
          >
            <Icon
              className={`w-4.5 h-4.5 shrink-0 transition-transform duration-200
              ${active ? "text-white" : "text-litter-muted group-hover:text-litter-primary"}
              group-hover:scale-110`}
            />
            <span className="flex-1 leading-none">{label}</span>

            {badge && pendingCount > 0 && (
              <span
                className={`
                  text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none
                  ${active ? "bg-white/25 text-white" : "bg-red-100 text-red-600"}
                `}
              >
                {pendingCount}
              </span>
            )}

            {active && (
              <ChevronRight className="w-3.5 h-3.5 text-white/60 shrink-0" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────

export function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { requests } = useDeleteRequest();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const adminName =
    user?.displayName || user?.email?.split("@")[0] || "Admin";
  const adminInitial = adminName[0].toUpperCase();
  const adminEmail = user?.email || "";

  return (
    <>
      {/* ── Mobile top bar ──────────────────────────────────────────────── */}
      <div className="lg:hidden flex items-center justify-between px-4 h-14 bg-litter-card border-b border-litter-border sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-litter-primary flex items-center justify-center shrink-0">
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="font-display font-bold text-litter-text text-sm leading-none">
              LitterSense
            </p>
            <p className="text-[9px] text-litter-primary font-semibold uppercase tracking-widest leading-none mt-0.5">
              Admin
            </p>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl text-litter-muted hover:text-litter-text hover:bg-litter-primary-light/60 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* ── Mobile overlay ──────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          onClick={() => setMobileOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Drawer */}
          <div
            className="relative w-64 bg-litter-card h-full flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-litter-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-litter-primary flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p className="font-display font-bold text-litter-text text-sm leading-none">
                    LitterSense
                  </p>
                  <p className="text-[9px] text-litter-primary font-semibold uppercase tracking-widest leading-none mt-0.5">
                    Admin Panel
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-litter-muted hover:text-litter-text hover:bg-litter-overlay transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <AdminNavList
                pathname={pathname}
                pendingCount={pendingCount}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>

            {/* Mobile footer */}
            <MobileSidebarFooter
              adminInitial={adminInitial}
              adminName={adminName}
              adminEmail={adminEmail}
            />
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-litter-card border-r border-litter-border min-h-screen sticky top-0 h-screen overflow-y-auto">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-litter-border shrink-0">
          <div className="w-8 h-8 rounded-xl bg-litter-primary flex items-center justify-center shrink-0 shadow-sm">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="font-display font-bold text-litter-text text-base leading-none">
              LitterSense
            </p>
            <p className="text-[10px] text-litter-primary font-semibold uppercase tracking-widest leading-none mt-0.5">
              Admin Panel
            </p>
          </div>
        </div>

        {/* Section label */}
        <div className="px-5 pt-5 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-litter-muted">
            Navigation
          </p>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto pb-4">
          <AdminNavList pathname={pathname} pendingCount={pendingCount} />
        </div>

        {/* Divider + Back to app */}
        <div className="px-3 pb-2 border-t border-litter-border pt-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-litter-muted hover:text-litter-text hover:bg-litter-primary-light/60 transition-all duration-200 group"
          >
            <ArrowLeft className="w-4 h-4 shrink-0 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to App</span>
          </Link>
        </div>

        {/* Admin profile */}
        <div className="p-3 border-t border-litter-border">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-litter-bg">
            <div className="w-8 h-8 rounded-full bg-litter-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
              {adminInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-litter-text leading-none truncate">
                {adminName}
              </p>
              <p className="text-[10px] text-litter-muted leading-none mt-0.5 truncate">
                {adminEmail}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Mobile drawer footer ──────────────────────────────────────────────────

function MobileSidebarFooter({
  adminInitial,
  adminName,
  adminEmail,
}: {
  adminInitial: string;
  adminName: string;
  adminEmail: string;
}) {
  return (
    <div className="border-t border-litter-border p-3 shrink-0">
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-litter-muted hover:text-litter-text hover:bg-litter-primary-light/60 transition-colors mb-2"
      >
        <ArrowLeft className="w-4 h-4 shrink-0" />
        Back to App
      </Link>
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-litter-bg">
        <div className="w-7 h-7 rounded-full bg-litter-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
          {adminInitial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-litter-text leading-none truncate">
            {adminName}
          </p>
          <p className="text-[10px] text-litter-muted leading-none mt-0.5 truncate">
            {adminEmail}
          </p>
        </div>
      </div>
    </div>
  );
}
