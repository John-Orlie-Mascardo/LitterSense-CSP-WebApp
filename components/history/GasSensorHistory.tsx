"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { subscribeSensorChanges } from '@/lib/utils/notificationLive';
import type { GasHistoryEvent } from '@/lib/server/gasHistory';

type HistoryState = { uid: string; events: GasHistoryEvent[]; nextCursor: string | null; error: string; loading: boolean };
const formatTime = (value: string) => new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

export function GasSensorHistory({ preview = false }: { preview?: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState<HistoryState | null>(null);
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
    const refresh = () => { if (!document.hidden) void load(); };
    const disconnect = subscribeSensorChanges(refresh);
    const timer = setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; controller.abort(); clearInterval(timer); disconnect(); document.removeEventListener('visibilitychange', refresh); loadRef.current = () => {}; };
  }, [user]);
  const current = state?.uid === user?.uid ? state : null;
  const events = preview ? current?.events.slice(0, 3) : current?.events;
  return <section className="rounded-xl border border-litter-border bg-litter-card p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display font-semibold text-litter-text">Gas Sensor History</h2>
      {preview && <Link href="/dashboard/history" className="text-xs font-semibold text-litter-primary hover:underline">VIEW ALL</Link>}
    </div>
    <p className="mt-1 text-xs text-litter-muted">Recorded readings, including events uploaded after internet returned. These are separate from the current gas readings.</p>
    {current?.error && <p role="alert" className="mt-3 text-sm text-red-400">{current.error} <button onClick={() => loadRef.current()} className="underline">Retry</button></p>}
    {!current && <p className="mt-3 text-sm text-litter-muted">Loading recorded readings…</p>}
    {current && !current.loading && !current.error && !events?.length && <p className="mt-3 text-sm text-litter-muted">No recorded gas readings yet.</p>}
    <ul className="mt-3 divide-y divide-litter-border">
      {events?.map(event => <li key={event.id} className="py-3 text-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-medium">
          <span className={event.mq135Raw === 0 ? 'text-red-400' : 'text-litter-primary'}>Urine odor: {event.mq135Raw === 0 ? 'Detected' : 'Clear'}</span>
          <span className={event.mq136Raw === 0 ? 'text-red-400' : 'text-litter-primary'}>Stool odor: {event.mq136Raw === 0 ? 'Detected' : 'Clear'}</span>
        </div>
        <p className="mt-1 text-xs text-litter-text">Recorded: {event.capturedAt ? formatTime(event.capturedAt) : 'Time uncertain'}</p>
        <p className="mt-1 text-xs text-litter-muted">Uploaded: {formatTime(event.receivedAt)}</p>
      </li>)}
    </ul>
    {!preview && current?.nextCursor && <button disabled={current.loading} onClick={() => loadRef.current(true)} className="mt-3 text-sm font-semibold text-litter-primary disabled:opacity-50">{current.loading ? 'Loading…' : 'Load older readings'}</button>}
  </section>;
}
