/**
 * useSessionHistory.ts
 *
 * Loads owner-scoped Session History from Firestore in bounded cursor batches.
 *
 * DONE: stable filter/category keys, inclusive dates, deterministic order,
 * client-derived states, stale-request protection, and incremental retry
 * PLACEHOLDER: none
 *
 * NEXT: backend owners should add emulator coverage before changing query fields.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useCats } from "@/lib/contexts/CatContext";
import type { Session } from "@/lib/interfaces/Session";
import { hasEstablishedBaseline } from "@/lib/presentation/behaviorStates";
import {
  filterAndSortHistorySessions,
  HISTORY_BATCH_SIZE,
  parseHistoryFilters,
  serializeHistoryFilters,
  type HistoryFilters,
} from "@/lib/presentation/sessionHistory";
import { normalizeSessionDocument } from "@/lib/utils/sessionNormalization";

export interface SessionHistoryResult {
  readonly sessions: readonly Session[];
  readonly isInitialLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly hasMore: boolean;
  readonly hasAnySessions: boolean | null;
  readonly error: string | null;
  readonly loadMore: () => Promise<void>;
  readonly retry: () => void;
}

export function useSessionHistory(
  filters: HistoryFilters,
): SessionHistoryResult {
  const { user } = useAuth();
  const { cats, catDetails, sessions: contextSessions, backupStatus } = useCats();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasAnySessions, setHasAnySessions] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [historySource, setHistorySource] = useState<'firebase' | 'backup'>('firebase');
  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const backupCursorRef = useRef<string | null>(null);
  const sourceRef = useRef<'firebase' | 'backup'>('firebase');
  const ownerRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const requestGenerationRef = useRef(0);

  const filterKey = serializeHistoryFilters(filters).toString();
  const stableFilters = useMemo(
    () => parseHistoryFilters(
      new URLSearchParams(filterKey),
      [],
      new Date(),
      false,
    ),
    [filterKey],
  );
  const catIdsKey = cats.map((cat) => cat.id).sort().join("\u001f");
  const catIds = useMemo(
    () => new Set(catIdsKey ? catIdsKey.split("\u001f") : []),
    [catIdsKey],
  );
  const baselineCatIdsKey = cats
    .filter((cat) => hasEstablishedBaseline(catDetails[cat.id]))
    .map((cat) => cat.id)
    .sort()
    .join("\u001f");
  const baselineCatIds = useMemo(
    () => new Set(
      baselineCatIdsKey ? baselineCatIdsKey.split("\u001f") : [],
    ),
    [baselineCatIdsKey],
  );
  const backupRows = useMemo(() => backupStatus.pendingCount > 0 || backupStatus.mode
    ? filterAndSortHistorySessions(contextSessions, stableFilters, catIds, baselineCatIds)
    : [], [backupStatus.pendingCount, backupStatus.mode, contextSessions, stableFilters, catIds, baselineCatIds]);
  const fetchPage = useCallback(async (reset: boolean) => {
    if (!user || (!reset && loadingRef.current)) return;

    const generation = reset
      ? ++requestGenerationRef.current
      : requestGenerationRef.current;
    loadingRef.current = true;
    setError(null);
    if (reset) {
      cursorRef.current = null;
      backupCursorRef.current = null;
      setSessions([]);
      setHasMore(true);
      setIsInitialLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const loadBackup = async (firstPage: boolean) => {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ startDate: stableFilters.startDate, endDate: stableFilters.endDate, sort: stableFilters.sort, catId: stableFilters.catId });
        if (stableFilters.states.length) params.set('states', stableFilters.states.join(','));
        let cursor = firstPage ? null : backupCursorRef.current;
        const collected: Session[] = [];
        let hasNext = true;
        for (let batch = 0; batch < 50 && collected.length < HISTORY_BATCH_SIZE && hasNext; batch++) {
          if (cursor) params.set('cursor', cursor); else params.delete('cursor');
          const response = await fetch(`/api/cat-history?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
          if (response.status === 409 && (await response.json()).resetRequired === true) {
            backupCursorRef.current = null;
            sourceRef.current = 'firebase';
            setHistorySource('firebase');
            setRetryVersion(value => value + 1);
            return;
          }
          if (!response.ok) throw new Error('Cat history backup request failed');
          const page = await response.json() as { rows: { sessionId: string; data: Record<string, unknown> }[]; nextCursor: string | null; complete: boolean };
          if (generation !== requestGenerationRef.current) return;
          collected.push(...page.rows.map(row => normalizeSessionDocument(row.sessionId, row.data)));
          if (page.nextCursor === cursor) throw new Error('Cat history backup cursor did not advance');
          cursor = page.nextCursor;
          hasNext = Boolean(cursor);
          if (!hasNext && collected.length === 0) setHasAnySessions(page.complete ? false : null);
        }
        if (generation !== requestGenerationRef.current) return;
        backupCursorRef.current = cursor;
        setHasMore(hasNext);
        setSessions(current => {
          const rows = firstPage ? collected : [...current, ...collected];
          return Array.from(new Map(rows.map(row => [row.id, row])).values());
        });
        if (collected.length > 0) setHasAnySessions(true);
      };
      if (sourceRef.current === 'backup') {
        await loadBackup(reset);
        return;
      }
      const collected: Session[] = [];
      let nextCursor = reset ? null : cursorRef.current;
      let serverHasMore = true;

      while (collected.length < HISTORY_BATCH_SIZE && serverHasMore) {
        const sessionsCollection = collection(db, "users", user.uid, "sessions");
        const pageQuery = nextCursor
          ? query(
            sessionsCollection,
            where("date", ">=", stableFilters.startDate),
            where("date", "<=", stableFilters.endDate),
            orderBy("date", stableFilters.sort),
            orderBy(documentId(), stableFilters.sort),
            startAfter(nextCursor),
            limit(HISTORY_BATCH_SIZE),
          )
          : query(
            sessionsCollection,
            where("date", ">=", stableFilters.startDate),
            where("date", "<=", stableFilters.endDate),
            orderBy("date", stableFilters.sort),
            orderBy(documentId(), stableFilters.sort),
            limit(HISTORY_BATCH_SIZE),
          );
        const snapshot = await getDocs(pageQuery);
        if (generation !== requestGenerationRef.current) return;

        const normalized = snapshot.docs.map((sessionDoc) =>
          normalizeSessionDocument(sessionDoc.id, sessionDoc.data())
        );
        collected.push(
          ...filterAndSortHistorySessions(
            normalized,
            stableFilters,
            catIds,
            baselineCatIds,
          ),
        );
        nextCursor = snapshot.docs.at(-1) ?? nextCursor;
        serverHasMore = snapshot.docs.length === HISTORY_BATCH_SIZE;
      }

      if (generation !== requestGenerationRef.current) return;
      cursorRef.current = nextCursor;
      setHasMore(serverHasMore);
      setSessions((current) => {
        const rows = reset ? collected : [...current, ...collected];
        return Array.from(new Map(rows.map((row) => [row.id, row])).values());
      });
    } catch (loadError) {
      if (generation !== requestGenerationRef.current) return;
      console.error("Failed to load session history:", loadError);
      const code = (loadError as { code?: string })?.code ?? '';
      if (sourceRef.current === 'firebase' && /resource-exhausted|unavailable|deadline-exceeded|internal|aborted/.test(code)) {
        sourceRef.current = 'backup';
        setHistorySource('backup');
        backupCursorRef.current = null;
        setRetryVersion(value => value + 1);
      } else setError("We couldn't load session history. Please try again.");
    } finally {
      if (generation === requestGenerationRef.current) {
        loadingRef.current = false;
        setIsInitialLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [baselineCatIds, catIds, stableFilters, user]);

  useEffect(() => {
    if (ownerRef.current !== (user?.uid ?? null)) {
      ownerRef.current = user?.uid ?? null;
      sourceRef.current = 'firebase';
      setHistorySource('firebase');
      backupCursorRef.current = null;
      requestGenerationRef.current++;
    }
    if (!user) {
      queueMicrotask(() => {
        setSessions([]);
        setHasAnySessions(false);
        setIsInitialLoading(false);
      });
      return;
    }
    void fetchPage(true);
  }, [fetchPage, retryVersion, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const checkAnySessions = async () => {
      try {
        const snapshot = await getDocs(query(
          collection(db, "users", user.uid, "sessions"),
          limit(1),
        ));
        if (active) setHasAnySessions(!snapshot.empty);
      } catch (existenceError) {
        console.error("Failed to check whether session history exists:", existenceError);
        if (active) setHasAnySessions(null);
      }
    };
    void checkAnySessions();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || (historySource !== 'backup' && backupStatus.pendingCount === 0)) return;
    const timer = setTimeout(() => {
      if (!loadingRef.current) setRetryVersion(value => value + 1);
    }, document.hidden ? 60_000 : 30_000);
    return () => clearTimeout(timer);
  }, [user, historySource, backupStatus.pendingCount, retryVersion]);

  const loadMore = useCallback(() => fetchPage(false), [fetchPage]);
  const retry = useCallback(() => setRetryVersion((current) => current + 1), []);
  const visibleSessions = useMemo(() => {
    if (ownerRef.current !== user?.uid) return [];
    const merged = new Map(backupRows.map(row => [row.id, row]));
    for (const row of sessions) merged.set(row.id, row);
    return filterAndSortHistorySessions([...merged.values()], stableFilters, catIds, baselineCatIds);
  }, [backupRows, sessions, stableFilters, catIds, baselineCatIds, user?.uid]);

  return {
    sessions: visibleSessions,
    isInitialLoading,
    isLoadingMore,
    hasMore,
    hasAnySessions,
    error,
    loadMore,
    retry,
  };
}
