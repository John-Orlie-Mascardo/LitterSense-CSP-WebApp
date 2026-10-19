import { smsStoreRequest, buildSmsAccountBackup, saveSmsAccountBackup } from '@/lib/utils/smsAccountSync';
import { assertOperationalReady, assertOperationalFoundation, commitOperational, readOperationalRecord, readOperationalCredential, retryOperational, setOperational, OperationalError, type OperationalChange, type OperationalRecord } from './operationalStore';
import { readOperationalCatalog } from './operationalCats';
import { refreshPhotos, storePhotoPointers } from './operationalMedia';

export async function projectOperationalAccount(uid: string) {
  const timingStartedAt = Date.now();
  await assertOperationalReady(uid);
  const [profile, settings, config, catalog] = await Promise.all([readOperationalRecord(uid, `users/${uid}`), readOperationalRecord(uid, `users/${uid}/settings/notifications`), readOperationalRecord(uid, `users/${uid}/deviceConfig/default`), readOperationalCatalog(uid)]);
  if (config?.data.configToken) {
    const credential = await readOperationalCredential(`deviceConfigs/${config.data.configToken}`);
    if (!credential || credential.owner_id !== uid) throw new OperationalError('Invalid device ownership', 403);
  }
  const rows = (key: 'cat' | 'details') => catalog.profiles.map(p => ({ id: p.catId, data: p[key] })) as Parameters<typeof buildSmsAccountBackup>[3];
  await saveSmsAccountBackup(buildSmsAccountBackup(uid, profile!.data, settings?.data ?? {}, rows('cat'), rows('details'), config?.data ?? {}));
  const tokens = await smsStoreRequest('rpc/operational_project_push_tokens', { method: 'POST', body: JSON.stringify({ p_owner_id: uid }) });
  if (!tokens.ok) throw new OperationalError('Push token projection unavailable');
  console.info('[alert timing] Canonical recipient refresh', { elapsedMs: Date.now() - timingStartedAt });
}
const allowed = new Set(['cats', 'catDetails', 'sessions', 'healthLogs', 'notifications', 'reports', 'settings', 'deviceConfig', 'deviceState', 'catStats', 'dailyCatStats', 'catSessionLog']);
type Identity = { uid: string; email?: string; admin?: unknown };
export type RecordWrite = { path: string; action: 'set' | 'update' | 'delete'; data?: Record<string, unknown>; merge?: boolean; revision?: number };
export async function accessRecord(identity: Identity, path: string, write = false): Promise<string> {
  if (typeof path !== 'string' || path.length > 1024 || /[\u0000-\u001f*]/.test(path) || path.split('/').some(s => !s || s === '.' || s === '..')) throw new OperationalError('Invalid record path', 400);
  const parts = path.split('/');
  if (path.includes('%')) {
    // Existing notification IDs are URI-encoded. Allow them only as literal IDs in exact document paths.
    let canonicalNotificationId = false;
    try { canonicalNotificationId = parts.length === 4 && parts[0] === 'users' && parts[2] === 'notifications' && !parts[1].includes('%') && encodeURIComponent(decodeURIComponent(parts[3])) === parts[3]; }
    catch { /* Malformed escapes are invalid paths. */ }
    if (!canonicalNotificationId) throw new OperationalError('Invalid record path', 400);
  }
  if (parts[0] === 'users') {
    if (parts.length === 1) { if (write || identity.admin !== true) throw new OperationalError('Forbidden', 403); return '@all'; }
    if (parts[1] !== identity.uid && identity.admin !== true) throw new OperationalError('Forbidden', 403);
    if (parts.length > 2 && !allowed.has(parts[2])) throw new OperationalError('Forbidden', 403);
    if (write && (parts[1] !== identity.uid || ['cats', 'catDetails', 'deviceConfig', 'deviceState'].includes(parts[2]))) throw new OperationalError('Use the dedicated mutation endpoint', 403);
    return parts[1];
  }
  if (parts[0] === 'admins' || parts[0] === 'auditLogs') {
    if (write || identity.admin !== true) throw new OperationalError('Forbidden', 403);
    return '@system';
  }
  if (parts[0] === 'deleteRequests') { if (write) throw new OperationalError('Use the dedicated deletion endpoint', 403); return identity.admin === true ? '@all' : identity.uid; }
  throw new OperationalError('Forbidden', 403);
}
async function fetchSpecial(owner: string, path: string, list = false) {
  const latestAudit = path === 'auditLogs' && list;
  const order = latestAudit ? 'data->createdAt->>value.desc,document_path.desc' : 'document_path.asc';
  const cap = latestAudit ? 50 : 5001;
  const response = await smsStoreRequest(`operational_records?${owner === '@all' ? '' : `owner_id=eq.${encodeURIComponent(owner)}&`}document_path=${list ? 'like' : 'eq'}.${encodeURIComponent(list ? `${path}/*` : path)}&select=document_path,owner_id,data,revision&order=${order}&limit=${cap}`);
  if (!response.ok) throw new OperationalError('Records unavailable');
  const rows = await response.json() as OperationalRecord[];
  if (rows.length > 5000) throw new OperationalError('Collection limit exceeded');
  return rows;
}
async function readGuardedRecords(owner: string, path: string, list: boolean, requireProfile: boolean) {
  const records: OperationalRecord[] = [];
  for (let offset = 0; ; offset += 500) {
    const response = await smsStoreRequest('rpc/operational_read_records', { method: 'POST', body: JSON.stringify({ p_owner_id: owner, p_path: path, p_list: list, p_offset: offset, p_require_profile: requireProfile }) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new OperationalError(error.code === '55000' ? 'Migration data is not ready. Keep the current database mode until import and cutover are verified.' : 'Records unavailable', error.code === '22023' ? 400 : error.code === '42501' ? 403 : 503);
    }
    const rows = await response.json() as OperationalRecord[];
    records.push(...rows);
    if (!list || rows.length < 500) return records;
    if (records.length > 5000) throw new OperationalError('Record page limit exceeded');
  }
}
export async function readClientRecords(identity: Identity, path: string, list: boolean) {
  if (typeof path !== 'string' || path.split('/').length % 2 !== (list ? 1 : 0)) throw new OperationalError('Invalid record path', 400);
  const owner = await accessRecord(identity, path);
  const special = owner.startsWith('@') || path.split('/')[0] === 'deleteRequests';
  let rows: OperationalRecord[];
  if (special) {
    if (['@system', '@all'].includes(owner)) await assertOperationalFoundation();
    else await assertOperationalReady(owner);
    rows = await fetchSpecial(owner, path, list);
  } else rows = await readGuardedRecords(owner, path, list, path !== `users/${identity.uid}`);
  return Promise.all(rows.filter(row => !list || !row.document_path.slice(path.length + 1).includes('/')).map(async row => ({ path: row.document_path, revision: row.revision, data: await refreshPhotos(row.rawData ?? row.data, row.owner_id, `${row.document_path}:${row.revision}`) })));
}
function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function materialize(value: unknown, previous: unknown, now: string): unknown {
  if (Array.isArray(value)) return value.map(v => materialize(v, undefined, now));
  if (!plain(value)) return value;
  if (value.__op === 'timestamp') return { __firestoreType: 'timestamp', value: now, seconds: Math.floor(Date.parse(now) / 1000), nanoseconds: Date.parse(now) % 1000 * 1000000 };
  if (value.__op === 'arrayUnion') {
    if (!Array.isArray(value.values)) throw new OperationalError('Invalid array operation', 400);
    const result = Array.isArray(previous) ? [...previous] : [];
    for (const entry of value.values) if (!result.some(v => JSON.stringify(v) === JSON.stringify(entry))) result.push(entry);
    return result;
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, materialize(v, plain(previous) ? previous[k] : undefined, now)]));
}
function mergeData(old: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  const changes = Object.entries(data).map(([key, value]) => [key, plain(value) && plain(old[key]) && !value.__firestoreType ? mergeData(old[key] as Record<string, unknown>, value) : value]);
  return { ...old, ...Object.fromEntries(changes) };
}
export async function writeClientRecords(identity: Identity, writes: RecordWrite[]) {
  if (!Array.isArray(writes) || !writes.length || writes.length > 100) throw new OperationalError('Invalid write batch', 400);
  if (writes.some(w => !w || typeof w.path !== 'string' || w.path.split('/').length % 2)) throw new OperationalError('Invalid record path', 400);
  const owners = await Promise.all(writes.map(w => accessRecord(identity, w.path, true)));
  await assertOperationalFoundation();
  if (new Set(owners).size !== 1) throw new OperationalError('Mixed owner batch', 403);
  let owner = owners[0];
  if (owner === '@all') {
    const row = (await fetchSpecial(owner, writes[0].path))[0];
    owner = row?.owner_id ?? String(writes[0].data?.userId ?? '');
  }
  if (writes.every(w => w.path === `users/${identity.uid}`)) await assertOperationalFoundation();
  else if (owner !== '@system') await assertOperationalReady(owner);
  return retryOperational(async () => {
    const changes: OperationalChange[] = [];
    for (const write of writes) {
      if (write.path === `users/${identity.uid}` && write.action === 'delete') throw new OperationalError('Use the approved account deletion flow', 403);
      if (!['set', 'update', 'delete'].includes(write.action) || write.action !== 'delete' && !plain(write.data)) throw new OperationalError('Invalid write', 400);
      const row = owner === '@system' || write.path.startsWith('deleteRequests/') ? (await fetchSpecial(owner, write.path))[0] ?? null : await readOperationalRecord(owner, write.path);
      if (write.revision !== undefined && write.revision !== (row?.revision ?? 0)) throw new OperationalError('Transaction changed. Retry.', 409, 'CLIENT_CONFLICT');
      if (write.action === 'update' && !row) throw new OperationalError('Record not found', 404);
      if (write.path.startsWith('deleteRequests/')) {
        if (write.action === 'delete' || identity.admin !== true && (row || write.data?.userId !== identity.uid || write.data.status !== 'pending')) throw new OperationalError('Forbidden', 403);
      }
      if (write.path === `users/${identity.uid}` && write.data && Object.keys(write.data).some(key => ['fcmTokens', 'role', 'admin', 'deletionStatus', 'deletionRequestedAt', 'deletionStartedAt', 'deletionError'].includes(key.split('.')[0]))) throw new OperationalError('Use the dedicated token endpoint', 403);
      if (write.action === 'delete') changes.push({ action: 'delete', document_path: write.path, expected_revision: row?.revision ?? 0 });
      else {
        const data = storePhotoPointers(materialize(write.data, row?.rawData ?? row?.data, new Date().toISOString()) as Record<string, unknown>, owner);
        const next = write.merge || write.action === 'update' ? mergeData(row?.rawData ?? row?.data ?? {}, data) : data;
        if (write.path === `users/${identity.uid}`) {
          for (const field of ['fcmTokens', 'role', 'admin', 'deletionStatus', 'deletionRequestedAt', 'deletionStartedAt', 'deletionError']) {
            if (row?.data && field in row.data) next[field] = row.rawData?.[field] ?? row.data[field];
          }
        }
        changes.push(setOperational(write.path, row, next));
      }
    }
    if (owner === '@system') {
      const response = await smsStoreRequest('rpc/operational_commit', { method: 'POST', body: JSON.stringify({ p_owner_id: owner, p_changes: changes }) });
      if (!response.ok) throw new OperationalError('Admin write failed', 503);
    } else await commitOperational(owner, changes);
  });
}
