import { createHash } from 'node:crypto';
import type { BackupVisitState, ProfileBackup, VisitBackup } from '../interfaces/CatHistoryBackup';

export function validateBackupId(value: string): string {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || value.includes('/') || Buffer.byteLength(value, 'utf8') > 1500) throw new Error('Invalid backup document ID');
  return value;
}

export function validateBackupDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Invalid activity date');
  return value;
}

function timestamp(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid visit timestamp');
  validateBackupDate(value.slice(0, 10));
  return new Date(value).toISOString().replace('.000Z', 'Z');
}

const ignored = new Set(['configToken', 'wifiPassword', 'ownerId', 'receivedAt', 'updatedAt', 'createdAt', 'id']);
const visitFields = new Set(['catId', 'date', 'time', 'startedAt', 'endedAt', 'durationSecs', 'mq135Delta', 'mq136Delta', 'anomaly', 'anomalyType', 'sessionStatus', 'summaryVisits', 'syncedFromDevice']);

function serialize(source: Record<string, unknown>, fields: Set<string>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (ignored.has(key) || value === undefined) continue;
    if (!fields.has(key)) throw new Error(`Unsupported backup field: ${key}`);
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid backup number');
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new Error('Invalid backup value');
    clean[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(clean)) > 32768) throw new Error('Backup document too large');
  return clean;
}

export function buildVisitBackup(sessionId: string, source: Record<string, unknown>, tokenHash: string | null, state: BackupVisitState): VisitBackup {
  validateBackupId(sessionId);
  if (tokenHash !== null && !/^[a-f0-9]{64}$/.test(tokenHash)) throw new Error('Invalid device hash');
  if (!['primary_saved', 'pending', 'claimed', 'conflict', 'cancelled'].includes(state)) throw new Error('Invalid backup state');
  const data = serialize(source, visitFields);
  const catId = validateBackupId(data.catId as string);
  if (typeof data.durationSecs !== 'number' || data.durationSecs < 0) throw new Error('Invalid visit duration');
  data.date = data.date ? validateBackupDate(data.date as string) : '';
  data.endedAt = timestamp(data.endedAt);
  data.startedAt = timestamp(data.startedAt);
  if (!data.startedAt && data.endedAt) data.startedAt = new Date(Date.parse(data.endedAt as string) - data.durationSecs * 1000).toISOString().replace('.000Z', 'Z');
  for (const key of ['mq135Delta', 'mq136Delta', 'summaryVisits']) if (data[key] !== undefined && typeof data[key] !== 'number') throw new Error('Invalid visit number');
  for (const key of ['time', 'sessionStatus', 'anomalyType']) if (data[key] !== undefined && data[key] !== null && typeof data[key] !== 'string') throw new Error('Invalid visit text');
  for (const key of ['anomaly', 'syncedFromDevice']) if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new Error('Invalid visit flag');
  if (data.summaryVisits !== undefined && (!Number.isSafeInteger(data.summaryVisits) || (data.summaryVisits as number) < 0)) throw new Error('Invalid legacy visit count');
  const semantic = [catId, data.durationSecs, data.startedAt, data.endedAt, data.date, data.sessionStatus ?? '', data.mq135Delta ?? 0, data.mq136Delta ?? 0];
  const digest = createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
  return { sessionId, catId, data, digest, tokenHash, state };
}

export function sanitizeProfileBackup(profile: ProfileBackup): ProfileBackup {
  const catId = validateBackupId(profile.catId);
  const cat = serialize(profile.cat, new Set(['name', 'status', 'avatar', 'isOnline']));
  const { baseline, ...detailsSource } = profile.details;
  const details = serialize(detailsSource, new Set(['breed', 'gender', 'dob', 'rfidTag', 'healthInsight', 'weight']));
  for (const key of ['name', 'status', 'avatar']) if (cat[key] !== undefined && cat[key] !== null && typeof cat[key] !== 'string') throw new Error('Invalid cat text');
  if (cat.isOnline !== undefined && typeof cat.isOnline !== 'boolean') throw new Error('Invalid cat online flag');
  if (cat.status !== undefined && !['normal', 'watch', 'abnormal'].includes(cat.status as string)) throw new Error('Invalid cat status');
  for (const key of ['breed', 'gender', 'dob', 'rfidTag', 'healthInsight']) if (details[key] !== undefined && typeof details[key] !== 'string') throw new Error('Invalid profile text');
  if (details.weight !== undefined && (typeof details.weight !== 'number' || details.weight < 0)) throw new Error('Invalid legacy weight');
  if (baseline !== undefined) {
    if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) throw new Error('Invalid baseline');
    details.baseline = serialize(baseline as Record<string, unknown>, new Set(['avgVisitsPerDay', 'avgDurationSecs', 'mq135DeltaPercent', 'mq136DeltaPercent', 'lastUpdated']));
    for (const [key, value] of Object.entries(details.baseline as Record<string, unknown>)) if (typeof value !== (key === 'lastUpdated' ? 'string' : 'number')) throw new Error('Invalid baseline value');
  }
  if (Buffer.byteLength(JSON.stringify({ cat, details })) > 32768) throw new Error('Backup profile too large');
  return { catId, cat, details };
}

export function mergeHistoryById(primary: VisitBackup[], backup: VisitBackup[]): VisitBackup[] {
  const rows = new Map<string, VisitBackup>();
  for (const row of [...primary, ...backup]) {
    const existing = rows.get(row.sessionId);
    if (existing && existing.digest !== row.digest) throw new Error('Visit identity conflict');
    if (!existing) rows.set(row.sessionId, row);
  }
  return [...rows.values()];
}
