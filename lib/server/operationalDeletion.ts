import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
import { assertOperationalFoundation, OperationalError } from './operationalStore';
import { mediaRequest, MEDIA_BUCKET } from './operationalMedia';
export async function beginOperationalDeletion(uid: string, requestId: string) {
  if (typeof uid !== 'string' || typeof requestId !== 'string' || !/^[^/\u0000-\u001f]{1,128}$/.test(uid) || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new OperationalError('Invalid deletion request', 400);
  await assertOperationalFoundation();
  const response = await smsStoreRequest('rpc/operational_delete_account', { method: 'POST', body: JSON.stringify({ p_owner_id: uid, p_request_id: requestId }) });
  if (!response.ok) throw new OperationalError('Approved account deletion could not start', response.status === 403 ? 403 : 503);
}
export async function deleteOwnerMedia(uid: string) {
  // List exact owner prefixes recursively. Always restart page zero after deletion.
  async function clear(prefix: string) {
    for (let pages = 0; pages < 100; pages++) {
      const response = await mediaRequest(`object/list/${MEDIA_BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } }) });
      const rows = await response.json() as Array<{ name: string; id: string | null }>;
      if (!rows.length) return;
      const files: string[] = [];
      for (const row of rows) {
        if (!/^[A-Za-z0-9_.-]+$/.test(row.name) || ['.', '..'].includes(row.name)) throw new OperationalError('Invalid storage listing');
        const path = `${prefix}/${row.name}`;
        if (row.id === null) await clear(path); else files.push(path);
      }
      if (files.length) await mediaRequest(`object/${MEDIA_BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: files }) });
    }
    throw new OperationalError('Photo cleanup exceeds safety limit');
  }
  await clear(`users/${uid}`);
}
export async function finishOperationalDeletion(uid: string, requestId: string) {
  const response = await smsStoreRequest('rpc/operational_finish_deletion', { method: 'POST', body: JSON.stringify({ p_owner_id: uid, p_request_id: requestId }) });
  if (!response.ok) throw new OperationalError('Deletion completion pending');
}
