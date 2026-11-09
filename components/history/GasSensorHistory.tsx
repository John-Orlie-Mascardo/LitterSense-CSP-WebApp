"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { subscribeSensorChanges } from '@/lib/utils/notificationLive';
import type { GasHistoryEvent } from '@/lib/server/gasHistory';
import { groupGasReadings } from '@/lib/presentation/gasHistoryGroups';

// Rows shown at first and added per "Show more"; repeated readings are combined into one row.
const ROWS_PER_STEP = 8;

type HistoryState = { uid: string; events: GasHistoryEvent[]; nextCursor: string | null; error: string; loading: boolean };
const formatTime = (value: string) => new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const formatClock = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
// The end keeps its date when a run of readings crosses midnight.
const formatRange = (from: string, to: string) => `${formatTime(from)} – ${new Date(from).toDateString() === new Date(to).toDateString() ? formatClock(to) : formatTime(to)}`;

export function GasSensorHistory({ preview = false }: { preview?: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState<HistoryState | null>(null);
  const [rowLimit, setRowLimit] = useState(ROWS_PER_STEP);
  const loadRef = useRef<(more?: boolean) => void>(() => {});
  useEffect(() => {
    if (!user) return;
    let active = true, busy = false, pending = false, nextCursor: string | null = null, expanded = false;
    const controller = new AbortController();
    async function load(more = false) {
      if (!active) return;
      if (busy) { if (!more) pending = true; return; }
      busy = true;
      setState(old => ({ uid: user!.uid, events: old?.uid === user!.uid ? old.events : [], nextCursor, error: '', loading: true }));
      try {
        const token = await user!.getIdToken();
        const response = await fetch(`/api/sensors/history${more && nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ''}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Gas history unavailable');
        if (!active) return;
        if (more) expanded = true;
        if (more || !expanded) nextCursor = data.nextCursor;
        setState(old => {
          const previous = old?.uid === user!.uid ? old.events : [];
          const events = more || expanded ? [...new Map([...previous, ...data.events].map((event: GasHistoryEvent) => [event.id, event])).values()] : data.events as GasHistoryEvent[];
          events.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || b.id.localeCompare(a.id));
          return { uid: user!.uid, events, nextCursor, error: '', loading: false };
        });
      } catch (error) {
        if (active) setState(old => ({ uid: user!.uid, events: old?.uid === user!.uid ? old.events : [], nextCursor, error: error instanceof Error ? error.message : 'Gas history unavailable', loading: false }));
      } finally {
        busy = false;
        if (pending && active) { pending = false; void load(); }
      }
    }
    loadRef.current = more => { void load(more); };
    void load();
    const refresh = () => { void load(); };
    const disconnect = subscribeSensorChanges(refresh);
    const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; controller.abort(); clearInterval(timer); disconnect(); document.removeEventListener('visibilitychange', refresh); loadRef.current = () => {}; };
  }, [user]);
  const current = state?.uid === user?.uid ? state : null;
  const rows = groupGasReadings(current?.events ?? []);
  const shownRows = preview ? rows.slice(0, 3) : rows.slice(0, rowLimit);
  return <section className="rounded-2xl border border-litter-border bg-litter-card p-4 sm:p-6">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display font-semibold text-litter-text">Gas Sensor History</h2>
      {preview && <Link href="/dashboard/history" className="text-xs font-semibold text-litter-primary hover:underline">VIEW ALL</Link>}
    </div>
    <p className="mt-1 text-xs text-litter-muted">Recorded readings, including events uploaded after internet returned. These are separate from the current gas readings.</p>
    {current?.error && <p role="alert" className="mt-3 text-sm text-red-400">{current.error} <button onClick={() => loadRef.current()} className="underline">Retry</button></p>}
    {!current && <p className="mt-3 text-sm text-litter-muted">Loading recorded readings…</p>}
    {current && !current.loading && !current.error && !rows.length && <p className="mt-3 text-sm text-litter-muted">No recorded gas readings yet.</p>}
    <ul className="mt-3 divide-y divide-litter-border">
      {shownRows.map(row => <li key={row.key} className="py-3 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-medium">
          <span className={row.urineDetected ? 'text-red-400' : 'text-litter-primary'}>Urine odor: {row.urineDetected ? 'Detected' : 'Clear'}</span>
          <span className={row.stoolDetected ? 'text-red-400' : 'text-litter-primary'}>Stool odor: {row.stoolDetected ? 'Detected' : 'Clear'}</span>
          {row.count > 1 && <span className="text-xs font-normal text-litter-muted">{row.count} readings</span>}
        </div>
        {row.count === 1 ? <>
          <p className="mt-1 text-xs text-litter-text">Recorded: {row.newest.capturedAt ? formatTime(row.newest.capturedAt) : 'Time uncertain'}</p>
          <p className="mt-1 text-xs text-litter-muted">Uploaded: {formatTime(row.newest.receivedAt)}</p>
        </> : <>
          <p className="mt-1 text-xs text-litter-text">Recorded: {row.oldest.capturedAt && row.newest.capturedAt ? formatRange(row.oldest.capturedAt, row.newest.capturedAt) : 'Time uncertain'}</p>
          <p className="mt-1 text-xs text-litter-muted">Last uploaded: {formatTime(row.newest.receivedAt)}</p>
        </>}
      </li>)}
    </ul>
    {!preview && rows.length > rowLimit && <button onClick={() => setRowLimit(limit => limit + ROWS_PER_STEP)} className="mt-3 text-sm font-semibold text-litter-primary">Show more</button>}
    {!preview && rows.length <= rowLimit && current?.nextCursor && <button disabled={current.loading} onClick={() => { setRowLimit(limit => limit + ROWS_PER_STEP); loadRef.current(true); }} className="mt-3 text-sm font-semibold text-litter-primary disabled:opacity-50">{current.loading ? 'Loading…' : 'Load older readings'}</button>}
  </section>;
}
