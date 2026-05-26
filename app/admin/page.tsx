"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Users, PawPrint, Trash2, UserCheck } from "lucide-react";
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
import { useAdmin } from "@/lib/contexts/AdminContext";
import { useDeleteRequest } from "@/lib/contexts/DeleteRequestContext";
import { StatCard } from "@/components/dashboard/StatCard";
import { ToastContainer } from "@/components/ui/Toast";

const GENDER_COLORS: Record<string, string> = {
  Male: "var(--color-primary)",
  Female: "var(--color-accent)",
};

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: "12px",
  fontSize: "13px",
  color: "var(--color-text)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
};

const skeletonCards = ["gender-chart", "cats-chart"];

export default function AdminOverviewPage() {
  const { users, isLoading, toasts, dismissToast } = useAdmin();
  const { requests } = useDeleteRequest();

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
    [users],
  );

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 overflow-auto">
      <ToastContainer toasts={toasts} onClose={dismissToast} />

      <div>
        <h1 className="font-display font-bold text-2xl text-litter-text">
          Dashboard Overview
        </h1>
        <p className="text-sm text-litter-muted mt-0.5">
          System-wide snapshot of users, cats, and pending requests
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          value={isLoading ? "--" : agg.totalUsers}
          label="Total Users"
          status="normal"
        />
        <StatCard
          icon={PawPrint}
          value={isLoading ? "--" : agg.totalCats}
          label="Total Cats"
          status="normal"
        />
        <StatCard
          icon={Trash2}
          value={isLoading ? "--" : agg.pendingDeletes}
          label="Pending Deletions"
          status={agg.pendingDeletes > 0 ? "abnormal" : "normal"}
          statusLabel={agg.pendingDeletes > 0 ? "Needs review" : "All clear"}
        />
        <StatCard
          icon={UserCheck}
          value={isLoading ? "--" : agg.activeUsers}
          label="Active Users"
          status="normal"
          statusLabel="all time"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {skeletonCards.map((cardId) => (
            <div
              key={cardId}
              className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-6 h-64 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    {genderData.map((entry) => (
                      <Cell key={entry.name} fill={GENDER_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={tooltipStyle}
                    formatter={(
                      value: number | undefined,
                      name: string | undefined,
                    ) => [`${value ?? 0} cats`, name ?? ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 h-50 flex flex-col items-center justify-center pointer-events-none">
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

          <div className="bg-litter-card rounded-2xl border border-litter-border shadow-sm p-6">
            <h2 className="font-display font-semibold text-litter-text text-base mb-1">
              Cats per User
            </h2>
            <p className="text-xs text-litter-muted mb-4">
              Top 10 by cat count
            </p>

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
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/users"
            className="group bg-litter-card rounded-2xl border border-litter-border shadow-sm p-5 flex items-center gap-4 hover:border-litter-primary/40 hover:shadow-md transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-xl bg-litter-primary-light flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5 text-litter-primary" />
            </div>
            <div>
              <p className="font-display font-semibold text-litter-text">
                Manage Users
              </p>
              <p className="text-xs text-litter-muted mt-0.5">
                Search, sort, and suspend accounts
              </p>
            </div>
          </Link>
          <Link
            href="/admin/requests"
            className="group bg-litter-card rounded-2xl border border-litter-border shadow-sm p-5 flex items-center gap-4 hover:border-litter-primary/40 hover:shadow-md transition-all duration-200"
          >
            <div className="w-11 h-11 rounded-xl bg-status-danger flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Trash2 className="w-5 h-5 text-status-danger" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-display font-semibold text-litter-text">
                  Delete Requests
                </p>
                {agg.pendingDeletes > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 leading-none">
                    {agg.pendingDeletes}
                  </span>
                )}
              </div>
              <p className="text-xs text-litter-muted mt-0.5">
                Review and act on account deletion queue
              </p>
            </div>
          </Link>
        </div>
      )}
    </main>
  );
}
