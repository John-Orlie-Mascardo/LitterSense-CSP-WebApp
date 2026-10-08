"use client";
import * as fs from 'firebase/firestore';
import { auth } from '@/lib/configs/firebase';
import { operationalPrimary } from './operationalMode';
export * from 'firebase/firestore';
type Constraint = { kind: string; field?: string; op?: string; value?: unknown };
type Spec = { path: string; constraints: Constraint[] };
type Row = { path: string; revision: number; data: fs.DocumentData };
type Write = { path: string; action: string; data?: unknown; merge?: boolean; revision?: number };
const constraints = new WeakMap<object, Constraint>();
const specs = new WeakMap<object, Spec>();
const fields = new WeakMap<object, unknown>();
export const serverTimestamp: typeof fs.serverTimestamp = () => { const value = fs.serverTimestamp(); fields.set(value, { __op: 'timestamp' }); return value; };
export const arrayUnion: typeof fs.arrayUnion = (...values) => { const value = fs.arrayUnion(...values); fields.set(value, { __op: 'arrayUnion', values }); return value; };
export const where: typeof fs.where = (field, op, value) => { const c = fs.where(field, op, value); constraints.set(c, { kind: 'where', field: String(field), op, value }); return c; };
export const orderBy: typeof fs.orderBy = (field, direction) => { const c = fs.orderBy(field, direction); constraints.set(c, { kind: 'order', field: String(field), value: direction ?? 'asc' }); return c; };
export const limit: typeof fs.limit = value => { const c = fs.limit(value); constraints.set(c, { kind: 'limit', value }); return c; };
export const startAfter: typeof fs.startAfter = (...values: unknown[]) => { const c = fs.startAfter(...values); constraints.set(c, { kind: 'after', value: (values[0] as { id?: string })?.id ?? values }); return c; };
export const query: typeof fs.query = ((ref: fs.Query, ...args: fs.QueryConstraint[]) => {
  const q = fs.query(ref, ...args);
  specs.set(q, { path: specs.get(ref)?.path ?? (ref as fs.CollectionReference).path, constraints: [...(specs.get(ref)?.constraints ?? []), ...args.map(c => { const value = constraints.get(c); if (!value) throw new Error('Unsupported primary query'); return value; })] });
  return q;
}) as typeof fs.query;
function encode(value: unknown): unknown {
  if (value instanceof fs.Timestamp) return { __firestoreType: 'timestamp', value: value.toDate().toISOString(), seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return fields.get(value) ?? Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v]) => [k, encode(v)]));
  return value;
}
function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.__firestoreType === 'timestamp') return typeof record.seconds === 'number' && typeof record.nanoseconds === 'number' ? new fs.Timestamp(record.seconds, record.nanoseconds) : fs.Timestamp.fromDate(new Date(String(record.value)));
    return Object.fromEntries(Object.entries(record).map(([k,v]) => [k, decode(v)]));
  }
  return value;
}
const recordRefreshListeners = new Set<() => void>();
const notificationRefreshListeners = new Set<() => void>();
export function refreshNotificationRecords() { notificationRefreshListeners.forEach(refresh => refresh()); }
const VISIBLE_REFRESH_MS = 5000;
const HIDDEN_REFRESH_MS = 60000;
async function request(body: unknown) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first');
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed');
  const response = await fetch('/api/operational/records', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(encode(body)), signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed');
  if (!response.ok) throw Object.assign(new Error(data.error), { code: data.code, status: response.status });
  if ((body as { action?: string }).action === 'write') recordRefreshListeners.forEach(refresh => refresh());
  return data;
}
function snapshot(ref: fs.DocumentReference, row?: Row) {
  const data = row ? decode(row.data) as fs.DocumentData : undefined;
  if (data && row?.path.includes("/notifications/") && typeof data.createdAt === "string" && Number.isFinite(Date.parse(data.createdAt))) data.createdAt = fs.Timestamp.fromDate(new Date(data.createdAt));
  return { id: ref.id, ref, exists: () => !!row, data: () => data, get: (key: string) => key.split('.').reduce<unknown>((v, k) => v && typeof v === 'object' ? (v as fs.DocumentData)[k] : undefined, data), revision: row?.revision ?? 0, metadata: { fromCache: false, hasPendingWrites: false } } as unknown as fs.DocumentSnapshot & { revision: number };
}
export const getDoc: typeof fs.getDoc = (async (ref: fs.DocumentReference) => {
  if (!await operationalPrimary()) return fs.getDoc(ref);
  const data = await request({ action: 'read', path: ref.path });
  return snapshot(ref, data.rows[0]);
}) as typeof fs.getDoc;
function comparable(value: unknown) { return value instanceof fs.Timestamp ? value.toMillis() : value as string | number; }
export const getDocs: typeof fs.getDocs = (async (ref: fs.Query) => {
  if (!await operationalPrimary()) return fs.getDocs(ref);
  const spec = specs.get(ref) ?? { path: (ref as fs.CollectionReference).path, constraints: [] };
  let docs = (await request({ action: 'list', path: spec.path })).rows.map((row: Row) => snapshot(fs.doc(ref.firestore, row.path), row)) as fs.QueryDocumentSnapshot[];
  for (const c of spec.constraints.filter(c => c.kind === 'where')) docs = docs.filter(d => {
    const a = comparable(d.get(c.field!)), b = comparable(c.value);
    switch (c.op) { case '==': return a === b; case '>=': return a >= b; case '<=': return a <= b; case '>': return a > b; case '<': return a < b; default: throw new Error('Unsupported primary filter'); }
  });
  const orders = spec.constraints.filter(c => c.kind === 'order');
  if (orders.length) docs.sort((a, b) => { for (const c of orders) { const av = comparable(c.field === '__name__' ? a.id : a.get(c.field!)), bv = comparable(c.field === '__name__' ? b.id : b.get(c.field!)); if (av !== bv) return (av < bv ? -1 : 1) * (c.value === 'desc' ? -1 : 1); } return a.id.localeCompare(b.id); });
  const after = spec.constraints.find(c => c.kind === 'after');
  if (after) docs = docs.slice(docs.findIndex(d => d.id === after.value) + 1);
  const cap = spec.constraints.find(c => c.kind === 'limit');
  if (cap) docs = docs.slice(0, Number(cap.value));
  return { docs, size: docs.length, empty: !docs.length, forEach: (cb: (d: fs.QueryDocumentSnapshot) => void) => docs.forEach(cb), metadata: { fromCache: false, hasPendingWrites: false } } as fs.QuerySnapshot;
}) as typeof fs.getDocs;
export const onSnapshot: typeof fs.onSnapshot = ((ref: fs.Query | fs.DocumentReference, ...args: unknown[]) => {
  const next = args.find(v => typeof v === 'function') as (value: unknown) => void;
  const error = args.filter(v => typeof v === 'function')[1] as ((error: unknown) => void) | undefined;
  let stopped = false, timer: ReturnType<typeof setTimeout>, legacy: (() => void) | undefined, previous = '';
  const user = auth.currentUser?.uid;
  let inFlight = false, refreshPending = false, failures = 0;
  const refresh = () => {
    if (stopped || legacy || auth.currentUser?.uid !== user) return;
    clearTimeout(timer);
    if (inFlight) { refreshPending = true; return; }
    void poll();
  };
  const onVisibility = () => { if (!document.hidden) refresh(); };
  document.addEventListener('visibilitychange', onVisibility);
  recordRefreshListeners.add(refresh);
  const listenerPath = specs.get(ref)?.path ?? (ref as fs.CollectionReference).path;
  if (listenerPath?.includes('/notifications')) notificationRefreshListeners.add(refresh);
  async function poll() {
    if (stopped || inFlight || auth.currentUser?.uid !== user) return;
    inFlight = true;
    try {
      if (stopped || auth.currentUser?.uid !== user) return;
      if (!await operationalPrimary()) { if (!stopped) legacy = fs.onSnapshot(ref as fs.Query, next, error); return; }
      const value = ref.type === 'document' ? await getDoc(ref as fs.DocumentReference) : await getDocs(ref as fs.Query);
      if (stopped || auth.currentUser?.uid !== user) return;
      failures = 0;
      const digest = JSON.stringify('docs' in value ? value.docs.map(d => [d.id, d.data()]) : value.data());
      if (digest !== previous) { previous = digest; next(value); }
    } catch (e) { ++failures; if (!stopped && auth.currentUser?.uid === user) error?.(e); }
    finally {
      inFlight = false;
      if (!stopped && !legacy && auth.currentUser?.uid === user) {
        const delay = failures ? Math.min(HIDDEN_REFRESH_MS, VISIBLE_REFRESH_MS * 2 ** Math.min(failures, 4)) : document.hidden ? HIDDEN_REFRESH_MS : VISIBLE_REFRESH_MS;
        timer = setTimeout(poll, refreshPending ? 0 : delay);
        refreshPending = false;
      }
    }
  }
  void poll();
  return () => { stopped = true; clearTimeout(timer); legacy?.(); recordRefreshListeners.delete(refresh); notificationRefreshListeners.delete(refresh); document.removeEventListener('visibilitychange', onVisibility); };
}) as typeof fs.onSnapshot;
export const setDoc: typeof fs.setDoc = (async (ref: fs.DocumentReference, data: fs.DocumentData, options?: fs.SetOptions) => {
  if (!await operationalPrimary()) return options ? fs.setDoc(ref, data, options) : fs.setDoc(ref, data);
  await request({ action: 'write', writes: [{ path: ref.path, action: 'set', data, merge: options && 'merge' in options && options.merge }] });
}) as typeof fs.setDoc;
export const updateDoc: typeof fs.updateDoc = (async (ref: fs.DocumentReference, data: fs.DocumentData) => {
  if (!await operationalPrimary()) return fs.updateDoc(ref, data);
  await request({ action: 'write', writes: [{ path: ref.path, action: 'update', data }] });
}) as typeof fs.updateDoc;
export const deleteDoc: typeof fs.deleteDoc = async ref => { if (!await operationalPrimary()) return fs.deleteDoc(ref); await request({ action: 'write', writes: [{ path: ref.path, action: 'delete' }] }); };
export const addDoc: typeof fs.addDoc = (async (ref: fs.CollectionReference, data: fs.DocumentData) => { if (!await operationalPrimary()) return fs.addDoc(ref, data); const created = fs.doc(ref); await setDoc(created, data); return created; }) as typeof fs.addDoc;
export const writeBatch: typeof fs.writeBatch = db => {
  const legacy = fs.writeBatch(db), writes: Write[] = [];
  const batch = {
    set(ref: fs.DocumentReference, data: fs.DocumentData, options?: fs.SetOptions) { writes.push({ path: ref.path, action: 'set', data, merge: options && 'merge' in options && options.merge }); if (options) legacy.set(ref, data, options); else legacy.set(ref, data); return batch; },
    update(ref: fs.DocumentReference, data: fs.DocumentData) { writes.push({ path: ref.path, action: 'update', data }); legacy.update(ref, data); return batch; },
    delete(ref: fs.DocumentReference) { writes.push({ path: ref.path, action: 'delete' }); legacy.delete(ref); return batch; },
    async commit() { if (!await operationalPrimary()) return legacy.commit(); for (let i = 0; i < writes.length; i += 100) await request({ action: 'write', writes: writes.slice(i, i + 100) }); },
  };
  return batch as fs.WriteBatch;
};
export const runTransaction: typeof fs.runTransaction = (async (db: fs.Firestore, work: (tx: fs.Transaction) => Promise<unknown>) => {
  if (!await operationalPrimary()) return fs.runTransaction(db, work);
  for (let attempt = 0; attempt < 3; attempt++) {
    const revisions = new Map<string, number>(), writes: Write[] = [];
    const tx = {
      async get(ref: fs.DocumentReference) { const value = await getDoc(ref) as fs.DocumentSnapshot & { revision: number }; revisions.set(ref.path, value.revision); return value; },
      set(ref: fs.DocumentReference, data: fs.DocumentData, options?: fs.SetOptions) { writes.push({ path: ref.path, action: 'set', data, merge: options && 'merge' in options && options.merge }); return tx; },
      update(ref: fs.DocumentReference, data: fs.DocumentData) { writes.push({ path: ref.path, action: 'update', data }); return tx; },
      delete(ref: fs.DocumentReference) { writes.push({ path: ref.path, action: 'delete' }); return tx; },
    };
    const value = await work(tx as unknown as fs.Transaction);
    // Current app transactions read only documents they also write (notification dedupe and manual visits).
    if ([...revisions.keys()].some(path => !writes.some(w => w.path === path)) && writes.length) throw new Error('Read-only transaction guards require the dedicated endpoint');
    try { if (writes.length) await request({ action: 'write', writes: writes.map(w => ({ ...w, revision: revisions.get(w.path) })) }); return value; }
    catch (e) { if (attempt === 2 || (e as { code?: string }).code !== 'CLIENT_CONFLICT') throw e; }
  }
}) as typeof fs.runTransaction;

