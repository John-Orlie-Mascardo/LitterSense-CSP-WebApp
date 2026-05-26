"use client";

import { useState, useMemo } from "react";
import {
  Users,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Ban,
} from "lucide-react";
import { useAdmin } from "@/lib/contexts/AdminContext";
import { ToastContainer } from "@/components/ui/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = "name" | "registeredDate" | "cats";
type SortDir = "asc" | "desc";
const desktopSkeletonRows = [
  "desktop-user-skeleton-1",
  "desktop-user-skeleton-2",
  "desktop-user-skeleton-3",
  "desktop-user-skeleton-4",
  "desktop-user-skeleton-5",
  "desktop-user-skeleton-6",
];
const mobileSkeletonRows = [
  "mobile-user-skeleton-1",
  "mobile-user-skeleton-2",
  "mobile-user-skeleton-3",
  "mobile-user-skeleton-4",
];

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-litter-border">
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-litter-border animate-pulse shrink-0" />
          <div className="h-3.5 w-28 bg-litter-border rounded animate-pulse" />
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="h-3.5 w-36 bg-litter-border rounded animate-pulse" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-3.5 w-20 bg-litter-border rounded animate-pulse" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-3.5 w-6 bg-litter-border rounded animate-pulse" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-5 w-14 bg-litter-border rounded-full animate-pulse" />
      </td>
      <td className="px-6 py-3.5">
        <div className="flex justify-end gap-1.5">
          <div className="w-7 h-7 bg-litter-border rounded-lg animate-pulse" />
          <div className="w-7 h-7 bg-litter-border rounded-lg animate-pulse" />
        </div>
      </td>
    </tr>
  );
}

// ─── Users Page ───────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { users, isLoading, toasts, dismissToast, handleSuspend, addToast } =
    useAdmin();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── Filtered + sorted ──────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
    return [...filtered].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === "name") {
        av = a.name;
        bv = b.name;
      } else if (sortKey === "registeredDate") {
        av = a.registeredDate;
        bv = b.registeredDate;
      } else {
        av = a.cats.length;
        bv = b.cats.length;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [users, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function onSuspend(userId: string, userName: string, isActive: boolean) {
    handleSuspend(userId);
    addToast(
      isActive
        ? `${userName} has been suspended.`
        : `${userName} has been restored.`,
      isActive ? "info" : "success"
    );
  }

  const renderSortIcon = (field: SortKey) => {
    if (sortKey !== field)
      return (
        <ChevronsUpDown className="w-3.5 h-3.5 ml-1 opacity-30 shrink-0" />
      );
    return sortDir === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 ml-1 text-litter-primary shrink-0" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 ml-1 text-litter-primary shrink-0" />
    );
  };

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 overflow-auto">
      <ToastContainer toasts={toasts} onClose={dismissToast} />

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div>
        <h1 className="font-display font-bold text-2xl text-litter-text">
          Users
        </h1>
        <p className="text-sm text-litter-muted mt-0.5">
          View and manage all registered accounts
        </p>
      </div>

      {/* ── Users table card ────────────────────────────────────────── */}
      <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm overflow-hidden">
        {/* Table toolbar */}
        <div className="px-6 py-4 border-b border-litter-border flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-semibold text-litter-text text-base">
              All Users{" "}
              <span className="text-sm font-normal text-litter-muted">
                ({filteredUsers.length})
              </span>
            </h2>
          </div>

          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-litter-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-base w-full pl-9 pr-4 py-2 text-sm border border-litter-border rounded-xl focus:border-litter-primary focus:ring-2 focus:ring-litter-primary/10 transition-all"
            />
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="bg-litter-bg border-b border-litter-border">
                <th className="text-left px-6 py-3">
                  <button
                    onClick={() => toggleSort("name")}
                    className="flex items-center text-xs font-semibold text-litter-muted uppercase tracking-wider hover:text-litter-primary transition-colors"
                  >
                    Name
                    {renderSortIcon("name")}
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-litter-muted uppercase tracking-wider">
                  Email
                </th>
                <th className="text-left px-4 py-3">
                  <button
                    onClick={() => toggleSort("registeredDate")}
                    className="flex items-center text-xs font-semibold text-litter-muted uppercase tracking-wider hover:text-litter-primary transition-colors"
                  >
                    Registered
                    {renderSortIcon("registeredDate")}
                  </button>
                </th>
                <th className="text-left px-4 py-3">
                  <button
                    onClick={() => toggleSort("cats")}
                    className="flex items-center text-xs font-semibold text-litter-muted uppercase tracking-wider hover:text-litter-primary transition-colors"
                  >
                    Cats
                    {renderSortIcon("cats")}
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-litter-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-litter-muted uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-litter-border">
              {isLoading ? (
                desktopSkeletonRows.map((rowId) => (
                  <SkeletonRow key={rowId} />
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    {search ? (
                      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <div className="w-10 h-10 rounded-xl bg-litter-bg flex items-center justify-center mb-3 border border-litter-border">
                          <Search className="w-5 h-5 text-litter-muted" />
                        </div>
                        <p className="text-sm font-semibold text-litter-text">
                          No results for &ldquo;{search}&rdquo;
                        </p>
                        <p className="text-xs text-litter-muted mt-1">
                          Try a different name or email
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <div className="w-10 h-10 rounded-xl bg-litter-primary-light flex items-center justify-center mb-3">
                          <Users className="w-5 h-5 text-litter-primary" />
                        </div>
                        <p className="text-sm font-semibold text-litter-text">
                          No users registered yet
                        </p>
                        <p className="text-xs text-litter-muted mt-1">
                          Users will appear here once they sign up
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="theme-row-hover">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-semibold text-sm shrink-0">
                          {u.name[0]}
                        </div>
                        <span className="font-medium text-litter-text">
                          {u.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-litter-muted">{u.email}</td>
                    <td className="px-4 py-3.5 text-litter-text-secondary">
                      {formatDate(u.registeredDate)}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-litter-text">
                      {u.cats.length}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                          u.status === "active"
                            ? "bg-status-normal text-status-normal"
                            : "bg-litter-bg text-litter-muted border border-litter-border"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title="View user"
                          className="theme-icon-btn p-2 text-litter-muted hover:text-litter-primary transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          title={
                            u.status === "active"
                              ? "Suspend user"
                              : "Restore user"
                          }
                          onClick={() =>
                            onSuspend(u.id, u.name, u.status === "active")
                          }
                          className={`p-2 rounded-lg transition-colors ${
                            u.status === "active"
                              ? "theme-danger-btn text-litter-muted"
                              : "theme-icon-btn text-litter-primary"
                          }`}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-litter-border">
          {isLoading ? (
            mobileSkeletonRows.map((rowId) => (
              <div key={rowId} className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-litter-border animate-pulse shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-litter-border rounded animate-pulse mb-2" />
                    <div className="h-3 w-48 bg-litter-border rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))
          ) : filteredUsers.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <p className="text-sm font-semibold text-litter-text">No users found.</p>
            </div>
          ) : (
            filteredUsers.map((u) => (
              <div key={u.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-semibold text-lg shrink-0">
                      {u.name[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-litter-text truncate text-sm">
                        {u.name}
                      </p>
                      <p className="text-xs text-litter-muted truncate">
                        {u.email}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                      u.status === "active"
                        ? "bg-status-normal text-status-normal"
                        : "bg-litter-bg text-litter-muted border border-litter-border"
                    }`}
                  >
                    {u.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs border-t border-litter-border/50 pt-3 mt-1">
                  <div className="flex items-center gap-4 text-litter-text-secondary">
                    <div>
                      <span className="font-semibold text-litter-text">{u.cats.length}</span>{" "}
                      <span className="text-[10px] uppercase tracking-wider text-litter-muted">Cats</span>
                    </div>
                    <div className="w-px h-3 bg-litter-border"></div>
                    <div className="text-litter-muted">
                      {formatDate(u.registeredDate)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      title="View user"
                      className="p-1.5 text-litter-muted hover:text-litter-primary transition-colors rounded-lg bg-litter-bg border border-litter-border"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      title={u.status === "active" ? "Suspend user" : "Restore user"}
                      onClick={() => onSuspend(u.id, u.name, u.status === "active")}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        u.status === "active"
                          ? "bg-status-danger/10 text-status-danger border-status-danger/20"
                          : "bg-litter-primary-light text-litter-primary border-litter-primary/20"
                      }`}
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
