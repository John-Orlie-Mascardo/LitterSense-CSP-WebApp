import { FieldPath } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/configs/firebase-admin';
import { BEHAVIOR_STATES } from '@/lib/presentation/behaviorStates';
import { filterAndSortHistorySessions } from '@/lib/presentation/sessionHistory';
import type { BackupPage, CatalogBackup, HistoryQuery, VisitBackup } from '../interfaces/CatHistoryBackup';
import { captureCatalog } from './catCatalogSync';
import { buildVisitBackup, validateBackupDate, validateBackupId } from './catHistoryNormalization';
import { readCatalogBackup, readVisitBackups, saveCatalogBackup } from './catHistoryStore';
import { primaryVisitFailureStatus } from './catVisitRecovery';
import { normalizeSessionDocument } from './sessionNormalization';

export class HistoryReadError extends Error {
  constructor(message: string, readonly status: number, readonly resetRequired = false) { super(message); }
}

function checkOwner(ownerId: string) {
  validateBackupId(ownerId);
  if (ownerId.length > 128) throw new HistoryReadError('Invalid history owner', 400);
}
function primaryUnavailable(error: unknown) {
  const status = primaryVisitFailureStatus(error);
  return status === 429 || status === 503;
}
function emptyCatalog(): CatalogBackup { return { revision: 0, profiles: [], complete: false, sourceReadAt: '' }; }

export async function readCatCatalog(ownerId: string): Promise<{ catalog: CatalogBackup; source: 'firebase' | 'supabase'; backupPending: boolean }> {
  checkOwner(ownerId);
  try {
    const catalog = await captureCatalog(ownerId);
    let backupPending = false;
    try { await saveCatalogBackup(ownerId, catalog); } catch { backupPending = true; }
    return { catalog, source: 'firebase', backupPending };
  } catch (error) {
    if (!primaryUnavailable(error)) throw error;
    const catalog = await readCatalogBackup(ownerId);
    return { catalog: catalog ?? emptyCatalog(), source: 'supabase', backupPending: !catalog?.complete };
  }
}

type Key = { date: string; id: string };
type Cursor = Key & { owner: string; filters: string; source: string; version: 1 };
function compare(a: Key, b: Key, sort: 'asc' | 'desc') {
  const order = a.date === b.date ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0 : a.date < b.date ? -1 : 1;
  return sort === 'asc' ? order : -order;
}
function decodeCursor(value: string, ownerId: string, filters: string): Cursor {
  try {
    if (value.length > 4096) throw new Error('Too long');
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (cursor.owner !== ownerId) throw new HistoryReadError('History cursor belongs to another account', 403);
    if (cursor.version !== 1 || cursor.filters !== filters || !/^\d{4}-\d{2}-\d{2}$/.test(cursor.date) || typeof cursor.id !== 'string' || !cursor.id || typeof cursor.source !== 'string') throw new HistoryReadError('History source changed', 409, true);
    return cursor;
  } catch (error) { if (error instanceof HistoryReadError) throw error; throw new HistoryReadError('Invalid history cursor', 400); }
}
function encodeCursor(owner: string, filters: string, source: string, key: Key) {
  return Buffer.from(JSON.stringify({ owner, filters, source, version: 1, ...key })).toString('base64url');
}

export async function readCatHistory(ownerId: string, query: HistoryQuery): Promise<BackupPage<VisitBackup>> {
  checkOwner(ownerId);
  validateBackupDate(query.startDate); validateBackupDate(query.endDate);
  if (query.startDate > query.endDate || !['asc', 'desc'].includes(query.sort) || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100 || (query.catId && !['all', 'unattributed'].includes(query.catId) && !validateBackupId(query.catId))) throw new HistoryReadError('Invalid history filters', 400);
  const allowedStates = new Set(BEHAVIOR_STATES.map(state => state.id));
  if (query.states?.some(state => !allowedStates.has(state))) throw new HistoryReadError('Invalid history states', 400);
  const filters = JSON.stringify({ startDate: query.startDate, endDate: query.endDate, catId: query.catId ?? 'all', states: query.states ?? [...allowedStates], sort: query.sort, limit: query.limit });
  const cursor = query.cursor ? decodeCursor(query.cursor, ownerId, filters) : null;
  let catalog: CatalogBackup, primary = true;
  try { catalog = await captureCatalog(ownerId); }
  catch (error) { if (!primaryUnavailable(error)) throw error; primary = false; try { catalog = await readCatalogBackup(ownerId) ?? emptyCatalog(); } catch { throw new HistoryReadError('Cat history is temporarily unavailable', 503); } }
  const db = getAdminFirestore();
  const catIds = new Set(catalog.profiles.map(profile => profile.catId));
  const baselineIds = new Set(catalog.profiles.filter(profile => {
    const value = profile.details.baseline as Record<string, unknown> | undefined;
    return value && Number(value.avgVisitsPerDay) > 0 && Number(value.avgDurationSecs) > 0 && typeof value.lastUpdated === 'string' && Boolean(value.lastUpdated.trim());
  }).map(profile => profile.catId));
  const displayFilters = { startDate: query.startDate, endDate: query.endDate, sort: query.sort, catId: query.catId ?? 'all', states: query.states ?? [...allowedStates], preset: 'custom' as const };
  const backupQuery = { startDate: query.startDate, endDate: query.endDate, sort: query.sort, limit: 100, ...(query.catId && !['all', 'unattributed'].includes(query.catId) ? { catId: query.catId } : {}) };
  let key: Key | null = cursor ? { date: cursor.date, id: cursor.id } : null;
  let sourceSignature = '', backupAvailable = false, complete = false, backedUpAt: string | null = null, pendingCount = 0;
  const selected: VisitBackup[] = [];
  let more = false;
  for (let batch = 0; batch < 5; batch++) {
    const internalQuery = { ...backupQuery, ...(key ? { cursor: JSON.stringify({ owner: ownerId, query: backupQuery, date: key.date, id: key.id }) } : {}) };
    const backupPromise = readVisitBackups(ownerId, internalQuery);
    const primaryPromise = primary ? (async () => {
      let collection = db.collection(`users/${ownerId}/sessions`).where('date', '>=', query.startDate).where('date', '<=', query.endDate).orderBy('date', query.sort).orderBy(FieldPath.documentId(), query.sort);
      if (key) collection = collection.startAfter(key.date, key.id);
      return (await collection.limit(100).get()).docs.map(doc => buildVisitBackup(doc.id, normalizeSessionDocument(doc.id, doc.data()) as unknown as Record<string, unknown>, null, 'primary_saved'));
    })() : Promise.resolve([] as VisitBackup[]);
    const [primaryResult, backupResult] = await Promise.allSettled([primaryPromise, backupPromise]);
    if (primaryResult.status === 'rejected') {
      if (!primaryUnavailable(primaryResult.reason)) throw primaryResult.reason;
      if (cursor && cursor.source !== 'supabase') throw new HistoryReadError('History source changed', 409, true);
      if (backupResult.status === 'rejected') throw new HistoryReadError('Cat history is temporarily unavailable', 503);
      primary = false;
    }
    backupAvailable = backupResult.status === 'fulfilled';
    if (!primary && !backupAvailable) throw new HistoryReadError('Cat history is temporarily unavailable', 503);
    sourceSignature = primary ? backupAvailable ? 'mixed' : 'firebase' : 'supabase';
    if (cursor && cursor.source !== sourceSignature) throw new HistoryReadError('History source changed', 409, true);
    const backup = backupResult.status === 'fulfilled' ? backupResult.value : null;
    complete = Boolean(backup?.complete && catalog.complete);
    backedUpAt = backup?.backedUpAt ?? null;
    pendingCount = backup?.pendingCount ?? 0;
    const primaryRows = primary && primaryResult.status === 'fulfilled' ? primaryResult.value : [];
    const backupRows = backup?.rows ?? [];
    // An already committed pending visit can sit on another page/day; check its exact primary ID.
    const pendingRows = primary ? (await Promise.all(backupRows.filter(row => row.state === 'pending' || row.state === 'claimed').map(async row => {
      try { return (await db.doc(`users/${ownerId}/sessions/${row.sessionId}`).get()).exists ? null : row; }
      catch (error) { if (primaryUnavailable(error)) throw new HistoryReadError('History source changed', 409, true); throw error; }
    }))).filter((row): row is VisitBackup => Boolean(row)) : backupRows;
    const byId = new Map<string, VisitBackup>();
    for (const row of pendingRows) byId.set(row.sessionId, row);
    for (const row of primaryRows) byId.set(row.sessionId, row);
    const ordered = [...byId.values()].sort((a, b) => compare({ date: String(a.data.date), id: a.sessionId }, { date: String(b.data.date), id: b.sessionId }, query.sort));
    let consumed = 0;
    for (const row of ordered) {
      consumed++;
      key = { date: String(row.data.date), id: row.sessionId };
      const session = normalizeSessionDocument(row.sessionId, row.data);
      if (filterAndSortHistorySessions([session], displayFilters, catIds, baselineIds).length) selected.push(row);
      if (selected.length === query.limit) break;
    }
    if (selected.length < query.limit) {
      const rawTail = [...primaryRows, ...backupRows].map(row => ({ date: String(row.data.date), id: row.sessionId })).sort((a, b) => compare(a, b, query.sort)).at(-1);
      if (rawTail && (!key || compare(rawTail, key, query.sort) > 0)) key = rawTail;
    }
    more = consumed < ordered.length || primaryRows.length === 100 || backupRows.length === 100;
    if (selected.length === query.limit || !more) break;
  }
  return { rows: selected, nextCursor: more && key ? encodeCursor(ownerId, filters, sourceSignature, key) : null, source: primary ? pendingCount > 0 ? 'mixed' : 'firebase' : 'supabase', complete, backedUpAt, pendingCount };
}
