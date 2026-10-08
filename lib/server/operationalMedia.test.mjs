import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { copyPhotos, planPhotos } from '../../scripts/operational-media-import.mjs';
import { importManifest } from '../../scripts/operational-import.mjs';
import { manifestDigest } from '../utils/operationalImport.mjs';
const require = createRequire(import.meta.url);
class OperationalError extends Error { constructor(message, status = 503) { super(message); this.status = status; } }
function fixture() {
  const calls = [], cache = new Map(); let fail = false;
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const loadedModule = { exports: {} }; cache.set(file, loadedModule.exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: loadedModule, exports: loadedModule.exports, require: name => {
        if (name.includes('operationalStore')) return { OperationalError, rfidPrimaryEnabled: () => true, assertOperationalReady: async () => {} };
        if (name.includes('firebase-admin')) return { getAdminAuth: () => ({ verifyIdToken: async token => { if (token !== 'owner') throw new Error('Unauthorized'); return { uid: 'owner' }; } }) };
        if (name.includes('operationalMedia')) return load('lib/server/operationalMedia.ts');
        return require(name);
      }, process: { env: { SUPABASE_URL: 'https://storage.example', SUPABASE_SECRET_KEY: 'test-secret' } },
      fetch: async (url, init) => { calls.push({ url, init }); if (fail) return new Response(null, { status: 500 }); return Response.json(url.includes('/object/sign/') ? { signedURL: '/object/sign/littersense-media/users/owner/cats/cat/photo.jpg?token=temporary' } : {}); }, Buffer, Response, Request, AbortSignal, URL,
    });
    return loadedModule.exports;
  }
  return { load, calls, fail: () => { fail = true; } };
}
const bytes = Buffer.from('ffd8ffe000104a46494600', 'hex'), photo = 'users/owner/cats/cat/photo.jpg';

test('archived report photos are copied and renewed from owned pointers; nested previews cannot be imported', async () => {
  const f = fixture(), media = f.load('lib/server/operationalMedia.ts');
  const data = { report: { cats: [{ avatar: `https://storage.example/storage/v1/object/sign/littersense-media/${photo}?token=expired` }] } };
  const renewed = await media.refreshPhotos(data, 'owner');
  assert.match(renewed.report.cats[0].avatar, /token=temporary/);
  assert.match(data.report.cats[0].avatar, /token=expired/);
  const rows = [{ document_path: 'users/owner', owner_id: 'owner', data: {}, source_update_at: '2026-10-06T00:00:00Z' }, { document_path: 'users/owner/reports/old', owner_id: 'owner', data: { report: { cats: [{ avatar: `https://firebasestorage.googleapis.com/v0/b/source-bucket/o/${encodeURIComponent(photo)}?alt=media` }] } }, source_update_at: '2026-10-06T00:00:00Z' }];
  const manifest = { version: 1, complete: true, exportedAt: '2026-10-06T00:00:00Z', records: rows, digest: manifestDigest(rows) };
  assert.equal(planPhotos(manifest, 'source-bucket').length, 1);
  const preview = await copyPhotos(manifest, 'source-bucket', { file: () => ({ getMetadata: async () => [{ size: bytes.length, contentType: 'image/jpeg' }], download: async () => [bytes] }) }, () => { throw new Error('Unexpected upload'); }, false);
  await assert.rejects(importManifest(preview, true, () => { throw new Error('Unexpected import'); }), /Photo copy must/);
});
test('primary photos validate owner, MIME and bytes before uploading; refresh only known owned storage URLs', async () => {
  const f = fixture(), media = f.load('lib/server/operationalMedia.ts');
  await assert.rejects(media.uploadOperationalPhoto('other', photo, bytes, 'image/jpeg'), e => e.status === 403);
  await assert.rejects(media.uploadOperationalPhoto('owner', photo, Buffer.from('not an image'), 'image/jpeg'), e => e.status === 400);
  assert.equal(f.calls.length, 0);
  const url = await media.uploadOperationalPhoto('owner', photo, bytes, 'image/jpeg'); assert.match(url, /object\/sign/);
  assert.equal(f.calls[0].init.headers.apikey, 'test-secret');
  await media.refreshPhotos({ avatar: `supabase://littersense-media/${photo}` }, 'owner');
  const before = f.calls.length;
  const external = 'https://elsewhere.example/image.jpg'; assert.equal((await media.refreshPhotos({ avatar: external }, 'owner')).avatar, external);
  await media.refreshPhotos({ avatar: `supabase://littersense-media/${photo}` }, 'other'); assert.equal(f.calls.length, before);
  f.fail(); await assert.rejects(media.uploadOperationalPhoto('owner', photo, bytes, 'image/jpeg'), e => e.status === 503);
});
test('media endpoint rejects bad auth, cross-owner paths and oversized chunked bodies', async () => {
  const f = fixture(), route = f.load('app/api/operational/media/route.ts');
  const request = (path, body = bytes, auth = 'owner') => new Request('https://test/api/operational/media', { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'x-photo-path': path, 'Content-Type': 'image/jpeg' }, body });
  assert.equal((await route.POST(request(photo, bytes, 'invalid'))).status, 401);
  assert.equal((await route.POST(request('users/other/cats/cat/photo.jpg'))).status, 403);
  assert.equal((await route.POST(request(photo, Buffer.alloc(2097153)))).status, 413);
  assert.equal(f.calls.length, 0);
  assert.equal((await route.POST(request(photo))).status, 200);
});
test('private media migration blocks broad anonymous storage policy and caps prepared images', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(bucket_id text); alter table storage.objects enable row level security; grant usage on schema storage to anon; grant select on storage.objects to anon; create policy existing_public on storage.objects for select to anon using(true);');
  await db.exec(readFileSync('supabase/migrations/20261006161000_operational_media.sql', 'utf8'));
  await db.exec("insert into storage.objects values('littersense-media'),('other-bucket');");
  const bucket = (await db.query('select * from storage.buckets')).rows[0]; assert.equal(bucket.public, false); assert.equal(bucket.file_size_limit, 2097152);
  await db.exec('set role anon'); assert.deepEqual((await db.query('select bucket_id from storage.objects')).rows, [{ bucket_id: 'other-bucket' }]);
});
test('asset copy verifies byte hashes, preserves source, refuses conflicts and blocks importing dry-run photo pointers', async () => {
  const row = { document_path: 'users/owner', owner_id: 'owner', source_update_at: '2026-10-06T00:00:00Z', data: { photoURL: `https://firebasestorage.googleapis.com/v0/b/source-bucket/o/${encodeURIComponent(photo)}?alt=media&token=old` } };
  const manifest = { version: 1, complete: true, exportedAt: '2026-10-06T00:00:00Z', records: [row], digest: manifestDigest([row]) };
  const source = JSON.stringify(manifest), objects = new Map(), calls = [];
  const bucket = { file: () => ({ getMetadata: async () => [{ size: bytes.length, contentType: 'image/jpeg' }], download: async () => [bytes] }) };
  const storage = async (path, init) => { calls.push(path); if (init.method === 'POST') { objects.set(photo, init.body); return Response.json({}); } return objects.has(photo) ? new Response(objects.get(photo)) : new Response(null, { status: 404 }); };
  const preview = await copyPhotos(manifest, 'source-bucket', bucket, storage, false); assert.equal(calls.length, 0);
  await assert.rejects(importManifest(preview, true, () => { throw new Error('Unexpected import'); }), /Photo copy must/);
  const copied = await copyPhotos(manifest, 'source-bucket', bucket, storage, true); assert.equal(copied.mediaCopy.verified, true); assert.equal(JSON.stringify(manifest), source);
  await copyPhotos(manifest, 'source-bucket', bucket, storage, true); assert.equal(calls.filter(path => !path.includes('/authenticated/')).length, 1);
  objects.set(photo, Buffer.from('conflicting')); await assert.rejects(copyPhotos(manifest, 'source-bucket', bucket, storage, true), /Photo copy conflict/);
  const foreign = structuredClone(manifest); foreign.records[0].owner_id = 'other'; foreign.records[0].document_path = 'users/other'; foreign.digest = manifestDigest(foreign.records);
  assert.throws(() => planPhotos(foreign, 'source-bucket'), /ownership mismatch/);
});

