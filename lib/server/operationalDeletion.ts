import { OperationalError } from './operationalStore';
import { mediaRequest, MEDIA_BUCKET } from './operationalMedia';
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
