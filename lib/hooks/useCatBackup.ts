'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { CatalogBackup, VisitBackup } from '../interfaces/CatHistoryBackup';

type Owner = { uid: string; getIdToken: () => Promise<string> };
export type CatBackupSnapshot = {
  ownerId: string;
  catalog: CatalogBackup;
  catalogSource: 'firebase' | 'supabase';
  historySource: 'firebase' | 'supabase' | 'mixed';
  visits: VisitBackup[];
  complete: boolean;
  pendingCount: number;
  backupPending: boolean;
  truncated: boolean;
};

export async function fetchCatBackupSnapshot(owner: Owner, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<CatBackupSnapshot> {
  const token = await owner.getIdToken();
  const init = { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' as const, signal };
  const catsResponse = await fetchImpl('/api/cats', init);
  if (!catsResponse.ok) throw new Error('Cat profiles are unavailable');
  const catalog = await catsResponse.json() as CatalogBackup & { source: 'firebase' | 'supabase'; backupPending: boolean };
  const params = new URLSearchParams({ startDate: '0001-01-01', endDate: '2099-12-31', sort: 'desc', catId: 'all' });
  let visits: VisitBackup[] = [], cursor: string | null = null, historySource: CatBackupSnapshot['historySource'] = 'firebase', pendingCount = 0, complete = false;
  let truncated = false, resets = 0;
  for (let page = 0; page < 1000; page++) {
    if (cursor) params.set('cursor', cursor); else params.delete('cursor');
    const response = await fetchImpl(`/api/cat-history?${params.toString()}`, init);
    if (response.status === 409 && (await response.json()).resetRequired === true && resets++ < 1) { visits = []; cursor = null; page = -1; continue; }
    if (!response.ok) throw new Error('Cat history is unavailable');
    const result = await response.json() as { rows: VisitBackup[]; nextCursor: string | null; source: CatBackupSnapshot['historySource']; pendingCount: number; complete: boolean };
    historySource = result.source; pendingCount = result.pendingCount; complete = result.complete;
    // Healthy normal operation keeps the established Firebase subscriptions as the data source.
    if (catalog.source === 'firebase' && result.source === 'firebase' && !result.pendingCount) break;
    visits = [...new Map([...visits, ...result.rows].map(row => [row.sessionId, row])).values()];
    cursor = result.nextCursor;
    if (!cursor) break;
    if (page === 999) truncated = true;
  }
  return { ownerId: owner.uid, catalog, catalogSource: catalog.source, historySource, visits, complete: catalog.complete && complete && !truncated, pendingCount, backupPending: catalog.backupPending, truncated };
}

export function useCatBackup() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState<{ snapshot: CatBackupSnapshot | null; error: string | null; errorOwner: string | null }>({ snapshot: null, error: null, errorOwner: null });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!user) return;
    let active = true, timer: ReturnType<typeof setTimeout> | null = null, inFlight = false;
    const controller = new AbortController();
    const run = async () => {
      if (inFlight || !active) return;
      inFlight = true;
      let keepChecking = false;
      try {
        const snapshot = await fetchCatBackupSnapshot(user, controller.signal);
        if (!active) return;
        setState({ snapshot, error: null, errorOwner: null });
        keepChecking = snapshot.catalogSource === 'supabase' || snapshot.historySource !== 'firebase' || snapshot.pendingCount > 0 || snapshot.backupPending || !snapshot.complete;
      } catch {
        if (!active) return;
        setState(previous => ({ snapshot: previous.snapshot?.ownerId === uid ? previous.snapshot : null, error: 'Cat backup is temporarily unavailable.', errorOwner: uid ?? null }));
        keepChecking = true;
      } finally {
        inFlight = false;
        if (active && keepChecking) timer = setTimeout(() => { void run(); }, document.hidden ? 60_000 : 30_000);
      }
    };
    void run();
    return () => { active = false; controller.abort(); if (timer) clearTimeout(timer); };
  }, [uid, user, revision]);
  const snapshot = state.snapshot?.ownerId === uid ? state.snapshot : null;
  return { snapshot, error: uid && state.errorOwner === uid ? state.error : null, refresh };
}
