/**
 * Session History page.
 *
 * Filterable, grouped, incrementally loaded owner view of recorded litter-box sessions.
 *
 * DONE: URL/session persistence, responsive filters, sticky dates, state badges,
 * cursor loading, retry and zero-data states
 * PLACEHOLDER: none
 *
 * NEXT: Firebase owners should monitor query performance as real history grows.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Radio, RotateCcw } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { SessionTimelineCard } from "@/components/dashboard/SessionTimelineCard";
import { SessionHistoryFilters } from "@/components/history/HistoryFilters";
import { SessionHistorySkeleton } from "@/components/ui/AppLoadingSkeletons";
import { useCats } from "@/lib/contexts/CatContext";
import { useSessionHistory } from "@/lib/hooks/useSessionHistory";
import { hasEstablishedBaseline } from "@/lib/presentation/behaviorStates";
import {
  formatHistoryRange,
  getHistoryPresetRange,
  getHistorySessionState,
  groupHistorySessions,
  HISTORY_STORAGE_KEY,
  parseHistoryFilters,
  serializeHistoryFilters,
  type HistoryFilters,
} from "@/lib/presentation/sessionHistory";

function BatchSkeletons() {
  return (
    <div className="space-y-3" aria-label="Loading more sessions">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-44 animate-pulse rounded-xl border border-litter-border bg-litter-card" />
      ))}
    </div>
  );
}

export default function SessionHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cats, catDetails } = useCats();
  const searchKey = searchParams.toString();
  const validCatIds = useMemo(() => cats.map((cat) => cat.id), [cats]);
  const filters = useMemo(
    () => parseHistoryFilters(new URLSearchParams(searchKey), validCatIds),
    [searchKey, validCatIds],
  );
  const filterKey = serializeHistoryFilters(filters).toString();
  const history = useSessionHistory(filters);
  const groups = useMemo(
    () => groupHistorySessions(history.sessions),
    [history.sessions],
  );
  const catById = useMemo(
    () => new Map(cats.map((cat) => [cat.id, cat])),
    [cats],
  );
  const catIds = useMemo(() => new Set(validCatIds), [validCatIds]);
  const baselineCatIds = useMemo(
    () => new Set(
      cats
        .filter((cat) => hasEstablishedBaseline(catDetails[cat.id]))
        .map((cat) => cat.id),
    ),
    [catDetails, cats],
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasMore, loadMore } = history;

  const applyFilters = useCallback((nextFilters: HistoryFilters) => {
    const serialized = serializeHistoryFilters(nextFilters).toString();
    sessionStorage.setItem(HISTORY_STORAGE_KEY, serialized);
    router.replace(`/dashboard/history?${serialized}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    if (searchKey) return;
    const stored = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return;
    const restored = parseHistoryFilters(new URLSearchParams(stored), validCatIds);
    router.replace(
      `/dashboard/history?${serializeHistoryFilters(restored).toString()}`,
      { scroll: false },
    );
  }, [router, searchKey, validCatIds]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    }, { rootMargin: "240px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const resetDateRange = () => applyFilters({
    ...filters,
    ...getHistoryPresetRange("last30"),
    preset: "last30",
  });

  return (
    <div className="min-h-screen bg-litter-bg pb-24 lg:pb-10">
      <TopBar />
      <main className="mx-auto max-w-[1440px] px-4 pt-20 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="font-display text-2xl font-bold text-litter-text sm:text-3xl">Session History</h1>
          <p className="mt-1 text-sm text-litter-muted">
            Showing {history.sessions.length} sessions from {formatHistoryRange(filters.startDate, filters.endDate)}
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-[minmax(280px,360px)_1fr] md:items-start">
          <SessionHistoryFilters
            key={filterKey}
            filters={filters}
            cats={cats}
            onApply={applyFilters}
          />

          <section className="min-w-0">
            {history.isInitialLoading ? (
              <SessionHistorySkeleton />
            ) : history.hasAnySessions === false ? (
              <div className="rounded-2xl border border-litter-border bg-litter-card p-8 text-center">
                <Radio className="mx-auto h-8 w-8 text-litter-primary" />
                <h2 className="mt-3 font-semibold text-litter-text">Waiting for RFID visits</h2>
                <p className="mt-1 text-sm text-litter-muted">Tap the key fob near the antenna to record the first visit.</p>
              </div>
            ) : history.sessions.length === 0 && !history.error ? (
              <div className="rounded-2xl border border-litter-border bg-litter-card p-8 text-center">
                <h2 className="font-semibold text-litter-text">
                  No sessions recorded between {formatHistoryRange(filters.startDate, filters.endDate)}.
                </h2>
                <button type="button" onClick={resetDateRange} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-litter-primary px-4 py-2 text-sm font-semibold text-litter-primary">
                  <RotateCcw className="h-4 w-4" /> Reset date range
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((group) => (
                  <section key={group.dateKey} className="space-y-3">
                    <h2 className="sticky top-16 z-10 border-y border-litter-border bg-litter-bg/95 py-2 text-sm font-semibold text-litter-text backdrop-blur">
                      {group.dateLabel}
                    </h2>
                    {group.sessions.map((session) => (
                      <SessionTimelineCard
                        key={session.id}
                        cat={catById.get(session.catId) ?? null}
                        session={session}
                        displayState={getHistorySessionState(session, catIds, baselineCatIds)}
                      />
                    ))}
                  </section>
                ))}
              </div>
            )}

            {history.error && (
              <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-status-abnormal bg-litter-card p-4">
                <p className="flex items-center gap-2 text-sm text-litter-text"><AlertTriangle className="h-4 w-4 text-status-abnormal" />{history.error}</p>
                <button type="button" onClick={history.retry} className="rounded-lg border border-litter-border px-3 py-2 text-sm font-semibold text-litter-primary">Retry</button>
              </div>
            )}
            {history.isLoadingMore && <div className="mt-4"><BatchSkeletons /></div>}
            <div ref={sentinelRef} className="h-1" aria-hidden="true" />
            {history.hasMore && !history.isInitialLoading && (
              <button type="button" onClick={() => void history.loadMore()} disabled={history.isLoadingMore} className="mt-4 w-full rounded-xl border border-litter-border bg-litter-card px-4 py-3 text-sm font-semibold text-litter-primary disabled:opacity-50">
                Load more
              </button>
            )}
          </section>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
