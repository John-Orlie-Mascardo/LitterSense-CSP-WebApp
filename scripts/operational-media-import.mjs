// Explicit, additive asset copy. Source objects and the original export are retained.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest, manifestDigest } from '../lib/utils/operationalImport.mjs';
import { photoFields } from '../lib/utils/operationalPhotoFields.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function planPhotos(manifest, bucket) {
  validateManifest(manifest);
  const assets = [];
  for (const record of manifest.records) for (const [field, { target, key }] of photoFields(record.data).entries()) {
    const value = target[key];
    if (typeof value !== 'string' || !value.includes('firebasestorage.googleapis.com')) continue;
    const url = new URL(value), prefix = `/v0/b/${bucket}/o/`;
    if (url.origin !== 'https://firebasestorage.googleapis.com' || !url.pathname.startsWith(prefix)) throw new Error('Unmapped photo source');
    const objectPath = decodeURIComponent(url.pathname.slice(prefix.length)), parts = objectPath.split('/');
    if (parts[0] !== 'users' || parts[1] !== record.owner_id || parts.some(p => !/^[A-Za-z0-9_.-]+$/.test(p) || ['.', '..'].includes(p)) ||
      !((parts.length === 5 && parts[2] === 'cats' && parts[4] === 'photo.jpg') || (parts.length === 4 && parts[2] === 'profile' && parts[3].endsWith('.jpg')))) throw new Error('Photo ownership mismatch');
    assets.push({ documentPath: record.document_path, field, path: objectPath });
  }
  return assets;
}
export async function copyPhotos(manifest, bucketName, sourceBucket, storage, apply) {
  const assets = planPhotos(manifest, bucketName), next = structuredClone(manifest), verified = new Set();
  for (const asset of assets) {
    if (!verified.has(asset.path)) {
      const file = sourceBucket.file(asset.path), [metadata] = await file.getMetadata();
      if (Number(metadata.size) > 2097152 || !['image/jpeg','image/png','image/webp','image/gif'].includes(metadata.contentType)) throw new Error('Source photo exceeds supported prepared-image limits');
      const [bytes] = await file.download();
      if (apply) {
        const key = asset.path.split('/').map(encodeURIComponent).join('/');
        // Do not overwrite destination objects; retries verify their bytes.
        const existing = await storage(`object/authenticated/littersense-media/${key}`, { method: 'GET' }, true);
        if (existing.ok) { if (hash(Buffer.from(await existing.arrayBuffer())) !== hash(bytes)) throw new Error('Photo copy conflict'); }
        else if (existing.status === 404 || existing.status === 400) {
          const uploaded = await storage(`object/littersense-media/${key}`, { method: 'POST', headers: { 'Content-Type': metadata.contentType, 'x-upsert': 'false' }, body: bytes });
          if (!uploaded.ok) throw new Error('Photo copy failed');
          const check = await storage(`object/authenticated/littersense-media/${key}`, { method: 'GET' });
          if (!check.ok || hash(Buffer.from(await check.arrayBuffer())) !== hash(bytes)) throw new Error('Photo verification failed');
        } else throw new Error('Photo destination unavailable');
      }
      verified.add(asset.path);
    }
    const { target, key } = photoFields(next.records.find(row => row.document_path === asset.documentPath).data)[asset.field];
    target[key] = `supabase://littersense-media/${asset.path}`;
  }
  next.digest = manifestDigest(next.records);
  next.mediaCopy = { verified: apply, files: verified.size };
  validateManifest(next);
  return next;
}
async function main() {
  const [mode, input, output, ...rest] = process.argv.slice(2);
  if (!['--dry-run','--apply'].includes(mode) || !input || !output || rest.length) throw new Error('Usage: --dry-run|--apply <source-export.json> <new-export.json>');
  const manifest = JSON.parse(await readFile(resolve(input), 'utf8'));
  const { cert, getApps, initializeApp } = await import('firebase-admin/app');
  const { getStorage } = await import('firebase-admin/storage');
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName || !process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) throw new Error('Source storage configuration missing');
  const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString())) });
  const { smsStoreRequest } = await import('../lib/utils/smsAccountSync.ts');
  const state = await smsStoreRequest('operational_migration_state?singleton=eq.true&select=runtime_primary');
  if (!state.ok || (await state.json())[0]?.runtime_primary !== false) throw new Error('Keep primary mode off during import');
  const storage = (path, init = {}) => {
    const key = process.env.SUPABASE_SECRET_KEY, url = process.env.SUPABASE_URL;
    if (!key || !url) throw new Error('Destination configuration missing');
    return fetch(`${url.replace(/\/$/, '')}/storage/v1/${path}`, { ...init, headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), ...init.headers }, signal: AbortSignal.timeout(30000) });
  };
  const result = await copyPhotos(manifest, bucketName, getStorage(app).bucket(bucketName), storage, mode === '--apply');
  await writeFile(resolve(output), JSON.stringify(result), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ mode, files: result.mediaCopy.files, copiedAndVerified: result.mediaCopy.verified, records: result.records.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error('Photo migration stopped. Source and original export retained; inspect configuration and conflicts.'); process.exitCode = 1; });
