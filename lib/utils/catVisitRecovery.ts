import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/lib/configs/firebase-admin';
import type { VisitBackup } from '../interfaces/CatHistoryBackup';
import { buildVisitBackup, validateBackupId } from './catHistoryNormalization';
import { preserveFirmwareVisitTime } from './catVisitIngestion';
import { claimPendingVisits, claimRepairOwner, finishClaim, finishRepairOwner, resolveCatBackupDeviceHash, saveCatalogBackup } from './catHistoryStore';
import { captureCatalog } from './catCatalogSync';
import { copyHistoryPage } from './catHistoryBackfill';
import { COUNTABLE_SESSION_STATUSES } from './sensorSync';
import { getLocalDateKey, toIsoStringFromDateLike } from './sessionDate';

export class VisitAuthorityError extends Error {
  constructor() { super('Visit authority is no longer active'); }
}
export class VisitConflictError extends Error {
  constructor() { super('Conflicting visit identity requires review'); }
}

// Admin SDK gRPC codes; unclassified errors never authorize an outage upload.
export function primaryVisitFailureStatus(error: unknown): number | null {
  const code = (error as { code?: unknown })?.code;
  if (code === 8 || code === 'resource-exhausted') return 429;
  if ([4, 10, 13, 14, 'deadline-exceeded', 'aborted', 'internal', 'unavailable'].includes(code as number | string)) return 503;
  if (code === 7 || code === 'permission-denied') return 403;
  if (code === 16 || code === 'unauthenticated') return 401;
  return null;
}

async function verifyAccount(ownerId: string) {
  validateBackupId(ownerId);
  if (ownerId.length > 128) throw new Error('Invalid history owner');
  try { if ((await getAdminAuth().getUser(ownerId)).disabled) throw new VisitAuthorityError(); }
  catch (error) {
    if ((error as { code?: string })?.code === 'auth/user-not-found') throw new VisitAuthorityError();
    throw error;
  }
}

export async function persistVisitOnce(ownerId: string, visit: VisitBackup): Promise<'created' | 'duplicate' | 'conflict'> {
  let clean: VisitBackup;
  try {
    clean = buildVisitBackup(visit.sessionId, visit.data, visit.tokenHash, visit.state);
    if (clean.digest !== visit.digest || clean.catId !== visit.catId || !['primary_saved', 'pending', 'claimed'].includes(clean.state) || !clean.tokenHash || !clean.data.date || !clean.data.endedAt || !clean.data.startedAt || (clean.data.durationSecs as number) < 1 || !COUNTABLE_SESSION_STATUSES.includes(clean.data.sessionStatus as typeof COUNTABLE_SESSION_STATUSES[number])) throw new Error('Invalid recoverable visit');
  } catch { throw new VisitConflictError(); }
  await verifyAccount(ownerId);
  const db = getAdminFirestore(), root = `users/${ownerId}`;
  return db.runTransaction(async tx => {
    const sessionRef = db.doc(`${root}/sessions/${clean.sessionId}`);
    const [existing, account, cat, config] = await Promise.all([
      tx.get(sessionRef), tx.get(db.doc(root)), tx.get(db.doc(`${root}/cats/${clean.catId}`)), tx.get(db.doc(`${root}/deviceConfig/default`)),
    ]);
    if (!account.exists) throw new VisitAuthorityError();
    if (existing.exists) {
      try {
        const data = { ...existing.data() };
        for (const key of ['startedAt', 'endedAt']) if (data[key] && typeof data[key] !== 'string') data[key] = toIsoStringFromDateLike(data[key]);
        const original = buildVisitBackup(clean.sessionId, data, null, 'primary_saved');
        return preserveFirmwareVisitTime(clean, original).digest === original.digest ? 'duplicate' : 'conflict';
      } catch { return 'conflict'; }
    }
    const token = config.data()?.configToken;
    if (!cat.exists || typeof cat.data()?.name !== 'string' || !cat.data()?.name.trim() || typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(token) || createHash('sha256').update(token).digest('hex') !== clean.tokenHash) throw new VisitAuthorityError();
    const device = await tx.get(db.doc(`deviceConfigs/${token}`));
    if (!device.exists || device.data()?.ownerId !== ownerId || device.data()?.revoked === true) throw new VisitAuthorityError();
    const now = new Date(), day = clean.data.date as string, endedAt = clean.data.endedAt as string;
    const interrupted = clean.data.sessionStatus === "SESSION_INTERRUPTED";
    const paths = interrupted ? [] : [`${root}/dailyCatStats/${day}/cats/${clean.catId}`, `${root}/catStats/${clean.catId}/daily/${day}`];
    if (!interrupted && day === getLocalDateKey(now)) paths.push(`${root}/catStats/${clean.catId}`);
    const refs = paths.map(path => db.doc(path)), summaries = await Promise.all(refs.map(ref => tx.get(ref)));
    // All reads precede writes; competing board/worker transactions retry against the session identity.
    tx.create(sessionRef, { ...clean.data, configToken: token, createdAt: now.toISOString() });
    for (let i = 0; i < refs.length; i++) {
      const previous = toIsoStringFromDateLike(summaries[i].data()?.lastVisit);
      tx.set(refs[i], { catId: clean.catId, date: day, updatedAt: now.toISOString(), lastVisit: Date.parse(previous) > Date.parse(endedAt) ? previous : endedAt, visits: FieldValue.increment(1), totalDurationSecs: FieldValue.increment(clean.data.durationSecs as number) }, { merge: true });
    }
    return 'created';
  }, { maxAttempts: 3 });
}

export async function processCatHistoryRecovery(): Promise<{ restored: number; duplicates: number; conflicts: number; cancelled: number; retried: number; repairedRows: number }> {
  const result = { restored: 0, duplicates: 0, conflicts: 0, cancelled: 0, retried: 0, repairedRows: 0 };
  const started = Date.now();
  let primaryUnavailable = false;
  const claims = await claimPendingVisits(5);
  for (const visit of claims) {
    // Leave unprocessed claims for lease expiry when the bounded route is nearly out of time.
    if (Date.now() - started > 40000) break;
    if (!Number.isFinite(Date.parse(visit.leaseUntil)) || Date.parse(visit.leaseUntil) <= Date.now()) continue;
    let outcome: 'primary_saved' | 'conflict' | 'cancelled' | 'retry', counter: 'restored' | 'duplicates' | 'conflicts' | 'cancelled' | 'retried';
    try {
      if (primaryUnavailable) { outcome = 'retry'; counter = 'retried'; }
      else if (visit.state !== 'claimed' || !visit.tokenHash) { outcome = 'conflict'; counter = 'conflicts'; }
      else {
        const device = await resolveCatBackupDeviceHash(visit.tokenHash);
        if (device && !device.catalog.complete) throw new Error('Catalog authority unavailable');
        if (!device || device.ownerId !== visit.ownerId || device.tokenHash !== visit.tokenHash || !device.catalog.profiles.some(cat => cat.catId === visit.catId && typeof cat.cat.name === 'string' && cat.cat.name.trim())) throw new VisitAuthorityError();
        const saved = await persistVisitOnce(visit.ownerId, visit);
        outcome = saved === 'conflict' ? 'conflict' : 'primary_saved'; counter = saved === 'created' ? 'restored' : saved === 'duplicate' ? 'duplicates' : 'conflicts';
      }
    } catch (error) {
      const status = primaryVisitFailureStatus(error);
      if (status === 429 || status === 503) primaryUnavailable = true;
      outcome = error instanceof VisitAuthorityError ? 'cancelled' : error instanceof VisitConflictError ? 'conflict' : 'retry'; counter = outcome === 'cancelled' ? 'cancelled' : outcome === 'conflict' ? 'conflicts' : 'retried';
    }
    // A failed/stale finalization propagates; the next lease holder checks primary before any increment.
    await finishClaim(visit.claimId, outcome, outcome === 'retry' ? 'Primary authority or persistence unavailable' : outcome === 'conflict' ? 'Conflicting or unsupported visit' : outcome === 'cancelled' ? 'Account, device or cat is no longer active' : undefined);
    result[counter]++;
  }
  if (Date.now() - started > 40000) return result;
  const repair = await claimRepairOwner();
  if (repair) {
    let outcome: 'success' | 'retry' = 'retry';
    try {
      if (primaryUnavailable) throw new Error('Primary unavailable');
      await verifyAccount(repair.ownerId);
      if (!(await getAdminFirestore().doc(`users/${repair.ownerId}`).get()).exists) throw new VisitAuthorityError();
      const catalog = await captureCatalog(repair.ownerId);
      await saveCatalogBackup(repair.ownerId, catalog);
      const progress = await copyHistoryPage(repair.ownerId);
      if (progress.lastError) throw new Error('History repair incomplete');
      result.repairedRows = progress.copiedRows;
      outcome = 'success';
    } catch { /* Retry uses the independent persisted repair backoff, never a full-owner scan. */ }
    await finishRepairOwner(repair.claimId, outcome);
  }
  return result;
}
