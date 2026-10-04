import { createHash } from 'node:crypto';
import type { BackupPage, BackupProgress, CatalogBackup, ClaimedVisit, HistoryQuery, VisitBackup } from '../interfaces/CatHistoryBackup';
import { buildVisitBackup, sanitizeProfileBackup, validateBackupDate, validateBackupId } from './catHistoryNormalization';
import { smsStoreRequest } from './smsAccountSync';

function owner(value: string) {
  if (typeof value !== 'string' || !value || value.length > 128) throw new Error('Invalid backup owner');
  return value;
}
function claim(value: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error('Invalid claim ID');
  return value;
}
function receipt(value: string) {
  if (!Number.isFinite(Date.parse(value)) || Date.parse(value) > Date.now() + 5000) throw new Error('Invalid backup receipt');
  return value;
}
async function rpc<T>(name: string, body: Record<string, unknown>, returnsJson = true): Promise<T> {
  const response = await smsStoreRequest(`rpc/cat_history_${name}`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Cat backup storage returned ${response.status}`);
  return returnsJson ? response.json() : undefined as T;
}
export async function saveCatalogBackup(ownerId: string, catalog: CatalogBackup): Promise<{ applied: boolean }> {
  owner(ownerId);
  if (!catalog.complete || !Number.isSafeInteger(catalog.revision) || catalog.revision < 1) throw new Error('Catalog must be complete and versioned');
  receipt(catalog.sourceReadAt);
  const profiles = catalog.profiles.map(sanitizeProfileBackup);
  if (new Set(profiles.map(row => row.catId)).size !== profiles.length) throw new Error('Duplicate catalog cat');
  return rpc('save_catalog', { p_owner_id: ownerId, p_catalog: { ...catalog, profiles } });
}
export async function readCatalogBackup(ownerId: string): Promise<CatalogBackup | null> {
  return rpc('read_catalog', { p_owner_id: owner(ownerId) });
}
export async function saveVisitBackups(ownerId: string, visits: VisitBackup[]): Promise<{ inserted: number; duplicates: number; conflicts: number }> {
  owner(ownerId);
  if (visits.length > 100) throw new Error('Visit batch too large');
  const clean = visits.map(visit => {
    const normalized = buildVisitBackup(visit.sessionId, visit.data, visit.tokenHash, visit.state);
    if (visit.digest !== normalized.digest || visit.catId !== normalized.catId || !['pending', 'primary_saved'].includes(visit.state)) throw new Error('Invalid visit backup');
    return normalized;
  });
  return rpc('save_visits', { p_owner_id: ownerId, p_visits: clean });
}
export async function readVisitBackups(ownerId: string, query: HistoryQuery): Promise<BackupPage<VisitBackup>> {
  owner(ownerId); validateBackupDate(query.startDate); validateBackupDate(query.endDate);
  if (query.startDate > query.endDate || !['asc', 'desc'].includes(query.sort) || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new Error('Invalid history query');
  if (query.catId) validateBackupId(query.catId);
  if (query.cursor && query.cursor.length > 4096) throw new Error('Invalid history cursor');
  // Behavior filtering is applied by the presentation reader after bounded transport pages.
  return rpc('read_visits', { p_owner_id: ownerId, p_query: query });
}
export async function readBackupProgress(ownerId: string): Promise<BackupProgress | null> {
  return rpc('read_progress', { p_owner_id: owner(ownerId) });
}
export async function readVisitBackupsById(ownerId: string, sessionIds: string[]): Promise<VisitBackup[]> {
  owner(ownerId);
  if (sessionIds.length > 100) throw new Error('Visit lookup batch too large');
  sessionIds.forEach(validateBackupId);
  if (!sessionIds.length) return [];
  const filter = `(${sessionIds.map(id => JSON.stringify(id)).join(',')})`;
  const response = await smsStoreRequest(`cat_visit_backups?owner_id=eq.${encodeURIComponent(ownerId)}&session_id=in.${encodeURIComponent(filter)}&select=session_id,cat_id,data,digest,token_hash,state`);
  if (!response.ok) throw new Error(`Cat backup storage returned ${response.status}`);
  const rows = await response.json() as Array<{ session_id: string; cat_id: string; data: Record<string, unknown>; digest: string; token_hash: string | null; state: VisitBackup['state'] }>;
  return rows.map(row => ({ sessionId: row.session_id, catId: row.cat_id, data: row.data, digest: row.digest, tokenHash: row.token_hash, state: row.state }));
}
export async function saveBackupProgress(ownerId: string, progress: BackupProgress): Promise<void> {
  owner(ownerId); receipt(progress.checkedAt);
  if (!Number.isSafeInteger(progress.scanned) || progress.scanned < 0 || (progress.cursor !== null && (typeof progress.cursor !== 'string' || progress.cursor.length > 4096)) || typeof progress.complete !== 'boolean' || (progress.lastError !== null && (typeof progress.lastError !== 'string' || progress.lastError.length > 1000))) throw new Error('Invalid backup progress');
  await rpc('save_progress', { p_owner_id: ownerId, p_progress: progress }, false);
}
export async function resolveCatBackupDevice(configToken: string): Promise<{ ownerId: string; tokenHash: string; catalog: CatalogBackup } | null> {
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(configToken)) throw new Error('Invalid device token');
  return rpc('resolve_device', { p_token_hash: createHash('sha256').update(configToken).digest('hex') });
}
export async function claimPendingVisits(limit: number): Promise<ClaimedVisit[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new Error('Invalid claim limit');
  return rpc('claim_visits', { p_limit: limit });
}
export async function finishClaim(claimId: string, outcome: 'primary_saved' | 'conflict' | 'cancelled' | 'retry', reason?: string): Promise<void> {
  if (!['primary_saved', 'conflict', 'cancelled', 'retry'].includes(outcome) || (reason !== undefined && reason.length > 1000)) throw new Error('Invalid claim outcome');
  await rpc('finish_claim', { p_claim_id: claim(claimId), p_outcome: outcome, p_reason: reason ?? null }, false);
}
export async function claimRepairOwner(): Promise<{ ownerId: string; claimId: string } | null> {
  return rpc('claim_repair_owner', {});
}
export async function finishRepairOwner(claimId: string, outcome: 'success' | 'retry'): Promise<void> {
  if (!['success', 'retry'].includes(outcome)) throw new Error('Invalid repair outcome');
  await rpc('finish_repair_owner', { p_claim_id: claim(claimId), p_outcome: outcome }, false);
}
