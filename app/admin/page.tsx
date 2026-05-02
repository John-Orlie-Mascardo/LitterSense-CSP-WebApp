"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  PawPrint,
  Trash2,
  UserCheck,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Ban,
  Check,
  X,
  Shield,
  ArrowLeft,
  CheckCircle,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useDeleteRequest } from "@/lib/contexts/DeleteRequestContext";
import { StatCard } from "@/components/dashboard/StatCard";
import { ToastContainer, type ToastProps } from "@/components/ui/Toast";
import { mockAdminUsers, type AdminUser } from "@/lib/data/mockData";
import { generateId } from "@/lib/utils/formatters";
import { RulesManager } from "@/components/admin/RulesManager";
import { deleteUserData } from "@/lib/utils/deleteUserData";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = "name" | "registeredDate" | "cats";
type SortDir = "asc" | "desc";

const GENDER_COLORS: Record<string, string> = {
  Male: "var(--color-primary)",
  Female: "var(--color-accent)",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Skeleton row — mirrors the 6-column table structure ─────────────────────

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

// ─── Admin Dashboard Page ─────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { requests, approveRequest, rejectRequest } = useDeleteRequest();

  // Local state
  const [users, setUsers] = useState<AdminUser[]>(mockAdminUsers);
  const [toasts, setToasts] = useState<Omit<ToastProps, "onClose">[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingUserId, setIsDeletingUserId] = useState<string | null>(null);

  // Simulate data fetch — flip to false once data is ready
  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(t);
  }, []);

  function addToast(message: string, type: ToastProps["type"] = "info") {
    setToasts((prev) => [...prev, { id: generateId(), message, type }]);
  }

  // ── Derived aggregates (live — update when user suspends / admin acts) ────
  const agg = useMemo(() => {
    const allCats = users.flatMap((u) => u.cats);
    return {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === "active").length,
      totalCats: allCats.length,
      maleCats: allCats.filter((c) => c.gender === "male").length,
      femaleCats: allCats.filter((c) => c.gender === "female").length,
      pendingDeletes: requests.filter((r) => r.status === "pending").length,
    };
  }, [users, requests]);

  // ── Filtered + sorted users table ─────────────────────────────────────────
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

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );
  const resolvedRequests = useMemo(
    () => requests.filter((r) => r.status === "approved" || r.status === "rejected"),
    [requests]
  );

  // ── Chart data ────────────────────────────────────────────────────────────
  const genderData = [
    { name: "Male", value: agg.maleCats },
    { name: "Female", value: agg.femaleCats },
  ];

  const catsPerUserData = useMemo(
    () =>
      [...users]
        .sort((a, b) => b.cats.length - a.cats.length)
        .slice(0, 10)
        .map((u) => ({ name: u.name.split(" ")[0], cats: u.cats.length })),
    [users]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function handleApprove(id: string) {
    const req = requests.find((r) => r.id === id);
    if (!req) return;

    setIsDeletingUserId(req.userId);
    try {
      // Perform hard delete of user data
      await deleteUserData(req.userId);
      
      // Approve the deletion request
      approveRequest(id);
      
      // Remove the matching user from the admin table
      setUsers((prev) => prev.filter((u) => u.id !== req.userId));
      
      addToast(
        `Hard delete completed for ${req.userName}. All data permanently removed.`,
        "success"
      );
    } catch (error) {
      addToast(
        `Failed to delete user data: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error"
      );
      console.error("Deletion error:", error);
    } finally {
      setIsDeletingUserId(null);
    }
  }

  function handleReject(id: string) {
    rejectRequest(id);
    addToast("Request rejected. User has been notified. (stub)", "info");
  }

  function handleSuspend(userId: string) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              status:
                u.status === "active"
                  ? ("inactive" as const)
                  : ("active" as const),
            }
          : u
      )
    );
  }

  // ── Identity ──────────────────────────────────────────────────────────────
  const adminName =
    user?.displayName || user?.email?.split("@")[0] || "Admin";
  const adminInitial = adminName[0].toUpperCase();

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

  const tooltipStyle = {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    fontSize: "13px",
    color: "var(--color-text)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-litter-bg">
      <ToastContainer
        toasts={toasts}
        onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="bg-litter-card border-b border-litter-border sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-litter-primary flex items-center justify-center shrink-0">
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

          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="hidden sm:flex items-center gap-1.5 text-sm text-litter-muted hover:text-litter-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to App
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-litter-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
                {adminInitial}
              </div>
              <span className="hidden sm:block text-sm font-medium text-litter-text">
                {adminName}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-litter-text">
            Admin Dashboard
          </h1>
          <p className="text-sm text-litter-muted mt-0.5">
            System overview and user management
          </p>
        </div>

        {/* ── KPI row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            value={agg.totalUsers}
            label="Total Users"
            status="normal"
          />
          <StatCard
            icon={PawPrint}
            value={agg.totalCats}
            label="Total Cats"
            status="normal"
          />
          <StatCard
            icon={Trash2}
            value={agg.pendingDeletes}
            label="Pending Deletions"
            status={agg.pendingDeletes > 0 ? "alert" : "normal"}
            statusLabel={agg.pendingDeletes > 0 ? "Needs review" : "All clear"}
          />
          <StatCard
            icon={UserCheck}
            value={agg.activeUsers}
            label="Active Users"
            status="healthy"
            statusLabel="last 7 days"
          />
        </div>

        {/* ── Charts row ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gender donut */}
          <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-6">
            <h2 className="font-display font-semibold text-litter-text text-base mb-1">
              Cat Gender Split
            </h2>
            <p className="text-xs text-litter-muted mb-4">
              Across all registered users
            </p>

            <div className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={genderData}
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={92}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {genderData.map((entry, i) => (
                      <Cell key={i} fill={GENDER_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number | undefined, name: string | undefined) => [
                      `${value ?? 0} cats`,
                      name ?? "",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 h-[200px] flex flex-col items-center justify-center pointer-events-none">
                <span className="font-display font-bold text-3xl text-litter-text leading-none">
                  {agg.totalCats}
                </span>
                <span className="text-xs text-litter-muted mt-0.5">
                  total cats
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-8 mt-4 pt-4 border-t border-litter-border">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-litter-primary shrink-0" />
                <div>
                  <p className="font-display font-bold text-litter-text text-lg leading-none">
                    {agg.maleCats}
                  </p>
                  <p className="text-xs text-litter-muted">Male</p>
                </div>
              </div>
              <div className="w-px h-8 bg-litter-border" />
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-litter-accent shrink-0" />
                <div>
                  <p className="font-display font-bold text-litter-text text-lg leading-none">
                    {agg.femaleCats}
                  </p>
                  <p className="text-xs text-litter-muted">Female</p>
                </div>
              </div>
            </div>
          </div>

          {/* Cats per user bar chart */}
          <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-6">
            <h2 className="font-display font-semibold text-litter-text text-base mb-1">
              Cats per User
            </h2>
            <p className="text-xs text-litter-muted mb-4">Top 10 by cat count</p>

            <ResponsiveContainer width="100%" height={248}>
              <BarChart
                data={catsPerUserData}
                layout="vertical"
                margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={76}
                  tick={{ fontSize: 12, fill: "var(--color-text)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--color-overlay)" }}
                  formatter={(value: number | undefined) => [
                    `${value ?? 0} cat${value !== 1 ? "s" : ""}`,
                    "Cats",
                  ]}
                />
                <Bar
                  dataKey="cats"
                  fill="var(--color-primary)"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Delete requests queue ─────────────────────────────────────── */}
        <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-litter-border flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-semibold text-litter-text text-base">
                Delete Requests
              </h2>
              <p className="text-xs text-litter-muted mt-0.5">
                Account deletion queue
              </p>
            </div>
            {agg.pendingDeletes > 0 && (
              <span className="shrink-0 px-2.5 py-1 bg-status-alert text-status-alert text-xs font-semibold rounded-full">
                {agg.pendingDeletes} pending
              </span>
            )}
          </div>

          {pendingRequests.length === 0 && resolvedRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-litter-primary-light flex items-center justify-center mb-3">
                <CheckCircle className="w-6 h-6 text-litter-primary" />
              </div>
              <p className="font-display font-semibold text-litter-text">
                All clear
              </p>
              <p className="text-sm text-litter-muted mt-1">
                No pending deletion requests
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-litter-border">
              {[...pendingRequests, ...resolvedRequests].map((req) => (
                <li
                  key={req.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-litter-text">
                        {req.userName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                          req.status === "pending"
                            ? "bg-status-alert text-status-alert"
                            : req.status === "approved"
                            ? "bg-litter-primary-light text-litter-primary"
                            : "bg-litter-bg text-litter-muted border border-litter-border"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs text-litter-muted mt-0.5">
                      {req.userEmail}
                    </p>
                    <p className="text-xs text-litter-muted mt-1 leading-relaxed">
                      <span className="font-medium text-litter-text-secondary">
                        Reason:
                      </span>{" "}
                      {req.reason ?? "Account deletion request"}
                      {" · "}
                      <span className="font-medium text-litter-text-secondary">
                        Requested:
                      </span>{" "}
                      {formatDate(req.requestedDate)}
                      {req.resolvedDate && (
                        <>
                          {" · "}
                          <span className="font-medium text-litter-text-secondary">
                            {req.status === "approved" ? "Approved:" : "Rejected:"}
                          </span>{" "}
                          {formatDate(req.resolvedDate)}
                        </>
                      )}
                    </p>
                  </div>

                  {/* Actions */}
                  {req.status === "pending" ? (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={isDeletingUserId === req.userId}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-litter-primary text-white text-xs font-semibold rounded-lg hover:bg-litter-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeletingUserId === req.userId ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={isDeletingUserId === req.userId}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-litter-card border border-litter-border text-litter-text text-xs font-semibold rounded-lg hover:border-litter-alert hover:text-litter-alert transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-litter-muted shrink-0 italic capitalize">
                      {req.status}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── System Rules ──────────────────────────────────────────────── */}
        <RulesManager />

        {/* ── Users table ──────────────────────────────────────────────── */}
        <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-litter-border flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-semibold text-litter-text text-base">
                Users{" "}
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

          <div className="overflow-x-auto">
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
                  // Skeleton rows while data loads
                  Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      {search ? (
                        // No search results
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
                        // No users at all
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
                      <td className="px-4 py-3.5 text-litter-muted">
                        {u.email}
                      </td>
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
                              ? "bg-status-healthy text-status-healthy"
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
                            onClick={() => handleSuspend(u.id)}
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
        </div>

        <div className="h-4" />
      </main>
    </div>
  );
}
