import { smsStoreRequest } from '@/lib/utils/smsAccountSync';

// Staged operational cutover: RFID, sensor snapshots, provisioning and camera metadata.
export const rfidPrimaryEnabled = () => process.env.SUPABASE_RFID_PRIMARY_ENABLED === 'true';
export class OperationalError extends Error {
  constructor(message: string, readonly status = 503, readonly code = '') { super(message); }
}
export type OperationalRecord = { document_path: string; owner_id: string; data: Record<string, unknown>; revision: number; rawData?: Record<string, unknown> };
export type OperationalChange = { action: 'set' | 'delete'; document_path: string; expected_revision: number; data?: Record<string, unknown> };
const owner = (uid: string) => {
  if (!/^[^/\u0000-\u001f]{1,128}$/.test(uid) || uid === '@system') throw new OperationalError('Invalid owner', 403);
  return uid;
};
async function result<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const code = typeof error.code === 'string' ? error.code : '';
    throw new OperationalError(code === '23505' || code === '40001' ? 'Record changed or tag already registered. Refresh and try again.' : 'Operational storage unavailable.', ['23505', '40001'].includes(code) ? 409 : code === '42501' ? 403 : 503, code);
  }
  return response.json();
}
export function decodeOperational(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeOperational);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.__firestoreType === 'timestamp') return record.value;
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, decodeOperational(entry)]));
  }
  return value;
}
export async function readOperationalRecord(uid: string, path: string): Promise<OperationalRecord | null> {
  const rows = await result<OperationalRecord[]>(await smsStoreRequest(`operational_records?owner_id=eq.${encodeURIComponent(owner(uid))}&document_path=eq.${encodeURIComponent(path)}&select=document_path,owner_id,data,revision&limit=1`));
  return rows[0] ? { ...rows[0], rawData: rows[0].data, data: decodeOperational(rows[0].data) as Record<string, unknown> } : null;
}
// Server-only credential lookup before the owner is known. Never accepts user-document paths.
export async function readOperationalCredential(path: string): Promise<OperationalRecord | null> {
  if (!/^(deviceConfigs\/[A-Za-z0-9_-]{16,256}|cameraDevices\/cam_[a-f0-9]{32})$/.test(path)) throw new OperationalError('Invalid device credential', 403);
  const rows = await result<OperationalRecord[]>(await smsStoreRequest(`operational_records?document_path=eq.${encodeURIComponent(path)}&select=document_path,owner_id,data,revision&limit=1`));
  const row = rows[0];
  if (!row) return null;
  if (row.data.ownerId !== owner(row.owner_id)) throw new OperationalError('Invalid device ownership', 403);
  return { ...row, rawData: row.data, data: decodeOperational(row.data) as Record<string, unknown> };
}
export async function listOperationalRecords(uid: string, prefix: string): Promise<OperationalRecord[]> {
  // ponytail: bounded collection scans; add indexed history queries before exceeding 5,000 records per collection.
  if (!prefix.startsWith(`users/${owner(uid)}/`) || /[*%]/.test(prefix)) throw new OperationalError('Invalid record prefix', 403);
  const records: OperationalRecord[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await result<OperationalRecord[]>(await smsStoreRequest(`operational_records?owner_id=eq.${encodeURIComponent(uid)}&document_path=like.${encodeURIComponent(prefix.replace(/_/g, '\\_') + '*')}&select=document_path,owner_id,data,revision&order=document_path.asc&limit=500&offset=${offset}`));
    records.push(...rows.map(row => ({ ...row, rawData: row.data, data: decodeOperational(row.data) as Record<string, unknown> })));
    if (rows.length < 500) return records;
    if (records.length > 5000) throw new OperationalError('Record page limit exceeded');
  }
}
export async function assertOperationalFoundation() {
  const state = await result<Array<{ imported_at: string | null; runtime_primary: boolean; cutover_at: string | null }>>(await smsStoreRequest('operational_migration_state?singleton=eq.true&select=imported_at,runtime_primary,cutover_at'));
  if (!state[0]?.imported_at || !state[0].runtime_primary || !state[0].cutover_at) throw new OperationalError('Migration data is not ready. Keep the current database mode until import and cutover are verified.');
}
export async function assertOperationalReady(uid: string) {
  await assertOperationalFoundation();
  if (!await readOperationalRecord(uid, `users/${uid}`)) throw new OperationalError('Migration data is not ready. Keep the current database mode until import is verified.');
}
export async function commitOperational(uid: string, changes: OperationalChange[]) {
  return result<{ changed: number }>(await smsStoreRequest('rpc/operational_commit', { method: 'POST', body: JSON.stringify({ p_owner_id: owner(uid), p_changes: changes }) }));
}
// Preserve imported type markers (including timestamp nanoseconds) on untouched fields.
function preserveImported(raw: unknown, next: unknown): unknown {
  if (JSON.stringify(decodeOperational(raw)) === JSON.stringify(next)) return raw;
  if (next && typeof next === 'object' && !Array.isArray(next) && raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.fromEntries(Object.entries(next).map(([key, value]) => [key, key in raw ? preserveImported((raw as Record<string, unknown>)[key], value) : value]));
  }
  return next;
}
export const setOperational = (path: string, previous: OperationalRecord | null, data: Record<string, unknown>): OperationalChange => ({ action: 'set', document_path: path, expected_revision: previous?.revision ?? 0, data: previous?.rawData ? preserveImported(previous.rawData, data) as Record<string, unknown> : data });
export async function retryOperational<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) { if (!(error instanceof OperationalError) || error.code !== '40001' || attempt >= 2) throw error; }
  }
}
