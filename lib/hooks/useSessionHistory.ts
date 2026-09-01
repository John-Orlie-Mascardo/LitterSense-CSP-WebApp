/**
 * useSessionHistory.ts
 *
 * Loads owner-scoped Session History from Firestore in bounded cursor batches.
 *
 * DONE: inclusive dates, deterministic order, client-derived state filters,
 * stale-request protection, existence check, incremental retry behavior
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
  const { cats, catDetails } = useCats();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasAnySessions, setHasAnySessions] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const loadingRef = useRef(false);
  const requestGenerationRef = useRef(0);

  const catIds = useMemo(
    () => new Set(cats.map((cat) => cat.id)),
    [cats],
  );
  const baselineCatIds = useMemo(
    () => new Set(
      cats
        .filter((cat) => hasEstablishedBaseline(catDetails[cat.id]))
        .map((cat) => cat.id),
    ),
    [catDetails, cats],
  );
  const fetchPage = useCallback(async (reset: boolean) => {
    if (!user || (!reset && loadingRef.current)) return;

    const generation = reset
      ? ++requestGenerationRef.current
      : requestGenerationRef.current;
    loadingRef.current = true;
    setError(null);
    if (reset) {
      cursorRef.current = null;
      setSessions([]);
      setHasMore(true);
      setIsInitialLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const collected: Session[] = [];
      let nextCursor = reset ? null : cursorRef.current;
      let serverHasMore = true;

      while (collected.length < HISTORY_BATCH_SIZE && serverHasMore) {
        const sessionsCollection = collection(db, "users", user.uid, "sessions");
        const pageQuery = nextCursor
          ? query(
            sessionsCollection,
            where("date", ">=", filters.startDate),
            where("date", "<=", filters.endDate),
            orderBy("date", filters.sort),
            orderBy(documentId(), filters.sort),
            startAfter(nextCursor),
            limit(HISTORY_BATCH_SIZE),
          )
          : query(
            sessionsCollection,
            where("date", ">=", filters.startDate),
            where("date", "<=", filters.endDate),
            orderBy("date", filters.sort),
            orderBy(documentId(), filters.sort),
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
            filters,
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
      setError("We couldn't load session history. Please try again.");
    } finally {
      if (generation === requestGenerationRef.current) {
        loadingRef.current = false;
        setIsInitialLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [baselineCatIds, catIds, filters, user]);

  useEffect(() => {
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

  const loadMore = useCallback(() => fetchPage(false), [fetchPage]);
  const retry = useCallback(() => setRetryVersion((current) => current + 1), []);

  return {
    sessions,
    isInitialLoading,
    isLoadingMore,
    hasMore,
    hasAnySessions,
    error,
    loadMore,
    retry,
  };
}
