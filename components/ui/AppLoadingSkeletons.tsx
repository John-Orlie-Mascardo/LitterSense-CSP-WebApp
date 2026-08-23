/**
 * AppLoadingSkeletons.tsx
 *
 * Stable, theme-aware loading shapes for primary LitterSense routes.
 *
 * DONE: app shell, dashboard, cats, reports, live, settings, and notification skeletons
 * PLACEHOLDER: none; these shapes are intentional loading UI, not mock content
 *
 * NEXT: route owners should update the matching skeleton when a page's major layout changes.
 */

import type { ReactNode } from "react";

function Pulse({ className, marker }: { readonly className: string; readonly marker?: string }) {
  return (
    <div
      data-skeleton={marker}
      className={`animate-pulse rounded-xl bg-theme-overlay ${className}`}
    />
  );
}

function StatGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          data-skeleton="stat-card"
          className="h-32 animate-pulse rounded-2xl border border-litter-border bg-litter-card p-4"
        >
          <Pulse className="h-6 w-6 rounded-full" />
          <Pulse className="mt-5 h-7 w-24" />
          <Pulse className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

function RowList({ marker = "table-row", count = 4 }: { readonly marker?: string; readonly count?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-litter-border bg-litter-card">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          data-skeleton={marker}
          className="flex h-16 animate-pulse items-center gap-3 border-b border-litter-border px-4 last:border-b-0"
        >
          <Pulse className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1">
            <Pulse className="h-3 w-2/5" />
            <Pulse className="mt-2 h-2.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardContentSkeleton() {
  return (
    <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8" aria-label="Loading content">
      <div className="pt-6">
        <Pulse className="h-4 w-44" />
        <div className="mt-5 rounded-2xl border border-litter-border bg-litter-card p-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Pulse key={index} className="mb-3 h-8 last:mb-0" />
          ))}
        </div>
      </div>
      <div className="pt-6">
        <Pulse className="mb-4 h-5 w-44" />
        <Pulse marker="chart-block" className="mb-6 h-56 border border-litter-border bg-litter-card" />
        <StatGrid />
        <div className="mt-8"><RowList count={3} /></div>
      </div>
    </div>
  );
}

export function CatGridSkeleton() {
  return (
    <div aria-label="Loading content" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          data-skeleton="cat-card"
          className="h-48 animate-pulse rounded-2xl border border-litter-border bg-litter-card p-5"
        >
          <div className="flex items-center gap-4">
            <Pulse className="h-14 w-14 rounded-full" />
            <div className="flex-1"><Pulse className="h-4 w-2/3" /><Pulse className="mt-2 h-3 w-1/2" /></div>
          </div>
          <Pulse className="mt-8 h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ReportsContentSkeleton() {
  return (
    <div aria-label="Loading content" className="space-y-6">
      <div className="h-72 animate-pulse rounded-2xl border border-litter-border bg-litter-card p-5">
        <Pulse className="h-5 w-48" /><Pulse className="mt-5 h-12 w-full" /><Pulse className="mt-4 h-12 w-full" /><Pulse className="mt-5 h-12 w-full" />
      </div>
      <RowList count={4} />
      <Pulse marker="chart-block" className="h-48 border border-litter-border bg-litter-card" />
    </div>
  );
}

export function LiveContentSkeleton() {
  return (
    <div aria-label="Loading content" className="space-y-5">
      <Pulse marker="video-block" className="aspect-video w-full border border-litter-border bg-litter-card" />
      <StatGrid />
    </div>
  );
}

export function SettingsContentSkeleton() {
  return (
    <div aria-label="Loading content" className="space-y-5">
      <Pulse className="h-7 w-40" />
      <RowList marker="settings-row" count={6} />
      <RowList marker="settings-row" count={4} />
    </div>
  );
}

export function NotificationsContentSkeleton() {
  return (
    <div aria-label="Loading content" className="space-y-4">
      <Pulse className="h-7 w-48" />
      <RowList marker="notification-row" count={7} />
    </div>
  );
}

export function AppLoadingFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-screen bg-litter-bg pb-24 lg:pb-10">
      <div className="fixed inset-x-0 top-0 z-40 h-16 border-b border-litter-border bg-litter-card px-4">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between">
          <Pulse className="h-9 w-36" /><Pulse className="h-9 w-24" />
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 lg:px-8">{children}</main>
      <div className="fixed inset-x-2 bottom-4 h-16 animate-pulse rounded-2xl border border-litter-border bg-litter-card lg:hidden" />
    </div>
  );
}

