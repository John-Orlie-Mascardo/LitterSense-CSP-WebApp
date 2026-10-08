import { createHash } from 'node:crypto';

const id = value => typeof value === 'string' && /^[^/\u0000-\u001f]{1,128}$/.test(value);
export const normalizeTag = value => typeof value === 'string' ? value.replace(/[^a-f0-9]/gi, '').toUpperCase() : '';
export function recordOwner(path, data) {
  const parts = path.split('/');
  if (parts[0] === 'users' && parts.length % 2 === 0 && id(parts[1])) return parts[1];
  if (parts.length !== 2 || !id(parts[1])) throw new Error('Unsupported document path');
  if (parts[0] === 'admins') return '@system';
  const owner = parts[0] === 'deleteRequests' ? data.userId : ['deviceConfigs', 'cameraDevices'].includes(parts[0]) ? data.ownerId : null;
  if (!id(owner) || owner === '@system') throw new Error('Missing document owner');
  return owner;
}
// Preserve old unscoped snapshots separately; never overwrite the authoritative owner snapshot.
export function mapSourceRecords(records) {
  const byPath = new Map(records.map(record => [record.document_path, record]));
  return records.map(record => {
    const [root, docId, ...children] = record.document_path.split('/');
    let destination = record.document_path;
    if (root === 'predictiveHealthLimits') {
      if (!id(docId) || children.length) throw new Error('Unsupported analysis lease path');
      destination = `users/${docId}/internal/predictiveHealthLimit`;
    } else if (root === 'deviceState') {
      const token = record.data.configToken;
      const owner = typeof token === 'string' && id(token) ? byPath.get(`deviceConfigs/${token}`)?.data.ownerId : null;
      if (!id(owner) || !id(docId) || children.length || !byPath.has(`users/${owner}`)) throw new Error('Legacy device snapshot ownership cannot be verified');
      destination = `users/${owner}/internal/legacyDeviceState_${docId}`;
    }
    return { ...record, document_path: destination, owner_id: recordOwner(destination, record.data), ...(destination !== record.document_path ? { source_document_path: record.document_path } : {}) };
  });
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function manifestDigest(records) {
  return createHash('sha256').update(JSON.stringify(canonical([...records].sort((a, b) => a.document_path.localeCompare(b.document_path))))).digest('hex');
}
export function validateManifest(manifest) {
  if (!manifest || manifest.version !== 1 || !manifest.complete || !Array.isArray(manifest.records) || !Number.isFinite(Date.parse(manifest.exportedAt))) throw new Error('A complete version-1 export is required');
  if (manifest.records.length > 5000 || Buffer.byteLength(JSON.stringify(manifest)) > 20 * 1024 * 1024) throw new Error('Export exceeds the atomic import limit; prepare a separately verified scoped export');
  const paths = new Set(), tags = new Map(), pushOwners = new Map();
  const counts = {};
  for (const record of manifest.records) {
    if (!record || typeof record.document_path !== 'string' || !record.data || Array.isArray(record.data) || typeof record.data !== 'object') throw new Error('Invalid record');
    if (recordOwner(record.document_path, record.data) !== record.owner_id || paths.has(record.document_path)) throw new Error('Invalid owner or duplicate document');
    if (!Number.isFinite(Date.parse(record.source_update_at))) throw new Error('Invalid source timestamp');
    paths.add(record.document_path);
    if (record.document_path === `users/${record.owner_id}` && Array.isArray(record.data.fcmTokens)) {
      for (const token of record.data.fcmTokens) {
        if (typeof token !== 'string' || token.length < 20) continue;
        if (pushOwners.has(token) && pushOwners.get(token) !== record.owner_id) throw new Error('Ambiguous push token ownership; review the source accounts before cutover');
        pushOwners.set(token, record.owner_id);
      }
    }
    const top = record.document_path.split('/')[0];
    counts[top] = (counts[top] ?? 0) + 1;
    if (/^users\/[^/]+\/catDetails\/[^/]+$/.test(record.document_path)) {
      const tag = normalizeTag(record.data.rfidTag);
      if (tag && !/^[A-F0-9]{4,124}$/.test(tag)) throw new Error('Invalid RFID tag');
      const key = `${record.owner_id}/${tag}`;
      if (tag && tags.has(key)) throw new Error('Duplicate RFID tag in source export');
      if (tag) tags.set(key, record.document_path);
    }
  }
  for (const record of manifest.records) {
    const match = /^users\/([^/]+)\/catDetails\/([^/]+)$/.exec(record.document_path);
    const deletionAudit = /^deleteRequests\/[^/]+$/.test(record.document_path) && record.data.status === 'deleted';
    if (record.owner_id !== '@system' && !paths.has(`users/${record.owner_id}`) && !deletionAudit) throw new Error('Document owner has no profile in export');
    if (match && !paths.has(`users/${match[1]}/cats/${match[2]}`)) throw new Error('Cat details have no matching profile');
    if (record.document_path.endsWith('/deviceState/camera') && typeof record.data.deviceId === 'string') {
      const camera = manifest.records.find(row => row.document_path === `cameraDevices/${record.data.deviceId}`);
      if (!camera || camera.owner_id !== record.owner_id || !/^[a-f0-9]{64}$/.test(camera.data.keyHash ?? '')) throw new Error('Camera pairing has no matching credential record');
    }
  }
  if (manifest.digest !== manifestDigest(manifest.records)) throw new Error('Export digest mismatch');
  return { records: manifest.records.length, owners: new Set(manifest.records.map(row => row.owner_id).filter(owner => owner !== '@system')).size, counts };
}
// Preserve non-JSON Firestore types explicitly; downstream readers must decode these markers.
export function exportValue(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return { __firestoreType: 'number', value: String(value) };
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return { __firestoreType: 'timestamp', value: value.toDate().toISOString(), ...(Number.isInteger(value.seconds) ? { seconds: value.seconds, nanoseconds: value.nanoseconds } : {}) };
  if (value instanceof Date) return { __firestoreType: 'timestamp', value: value.toISOString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { __firestoreType: 'bytes', value: Buffer.from(value).toString('base64') };
  if (typeof value.path === 'string' && typeof value.get === 'function') return { __firestoreType: 'reference', value: value.path };
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') return { __firestoreType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (Array.isArray(value)) return value.map(exportValue);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, exportValue(entry)]));
}

export function mergeVisitBackups(manifest, rows, normalizeVisit, approvedConflicts = []) {
  validateManifest(manifest);
  const records = [...manifest.records], byPath = new Map(records.map(record => [record.document_path, record]));
  let added = 0, duplicates = 0, cancelled = 0, preservedConflicts = 0;
  for (const backup of rows) {
    if (backup.state === 'cancelled') { cancelled++; continue; }
    if (!['primary_saved', 'pending', 'claimed'].includes(backup.state)) throw new Error('Unresolved visit backup conflict');
    if (!id(backup.owner_id) || !id(backup.session_id) || !id(backup.cat_id)) throw new Error('Invalid backed-up visit identity');
    const clean = normalizeVisit(backup.session_id, backup.data, backup.token_hash, backup.state);
    if (clean.digest !== backup.digest || clean.catId !== backup.cat_id) throw new Error('Backed-up visit digest mismatch');
    const path = `users/${backup.owner_id}/sessions/${backup.session_id}`;
    const existing = byPath.get(path);
    const approved = approvedConflicts.some(decision => decision.document_path === path && decision.source_digest === manifestDigest([existing].filter(Boolean)) && decision.backup_digest === manifestDigest([{ document_path: path, data: backup }]));
    if (backup.conflict_detected && !approved) throw new Error('Unresolved visit backup conflict');
    if (existing) {
      const source = Object.fromEntries(Object.entries(existing.data).map(([key, value]) => [key, value?.__firestoreType === 'timestamp' ? value.value : value]));
      if (normalizeVisit(backup.session_id, source, backup.token_hash, backup.state).digest !== clean.digest) {
        if (!approved) throw new Error('Visit differs between Firestore and Supabase');
        const archivePath = `users/${backup.owner_id}/internal/visitBackupConflict_${createHash('sha256').update(path).digest('hex')}`;
        if (byPath.has(archivePath)) throw new Error('Conflict archive already exists');
        const archive = { document_path: archivePath, owner_id: backup.owner_id, data: { resolution: 'keep-newer-firebase-source', sourceDocumentPath: path, sourceDigest: manifestDigest([existing]), backup: structuredClone(backup) }, source_update_at: backup.backed_up_at };
        records.push(archive); byPath.set(archivePath, archive); preservedConflicts++; continue;
      }
      duplicates++; continue;
    }
    if (!byPath.has(`users/${backup.owner_id}/cats/${backup.cat_id}`)) throw new Error('Pending visit has no current cat; review deletion before restoring');
    const record = { document_path: path, owner_id: backup.owner_id, data: clean.data, source_update_at: backup.backed_up_at };
    records.push(record); byPath.set(path, record); added++;
  }
  const result = { ...manifest, records, visitBackupSummary: { added, duplicates, cancelled, preservedConflicts }, digest: manifestDigest(records) };
  validateManifest(result);
  return result;
}
