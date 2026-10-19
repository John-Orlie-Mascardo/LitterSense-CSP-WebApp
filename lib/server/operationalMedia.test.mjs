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
function fixture({ deletionDuringUpload = false } = {}) {
  let profileReads = 0;
  const calls = [], cache = new Map(); let fail = false;
  let now = Date.parse('2026-10-19T00:00:00Z'), pauseNextSign = false, releaseSign;
  class Clock extends Date { static now() { return now; } }
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const loadedModule = { exports: {} }; cache.set(file, loadedModule.exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: loadedModule, exports: loadedModule.exports, require: name => {
        if (name.includes('operationalStore')) return { OperationalError, rfidPrimaryEnabled: () => true, assertOperationalReady: async () => {}, readOperationalRecord: async () => ({ data: { deletionStatus: deletionDuringUpload && ++profileReads > 1 ? 'processing' : 'pending' } }) };
        if (name.includes('firebase-admin')) return { getAdminAuth: () => ({ verifyIdToken: async token => { if (token !== 'owner') throw new Error('Unauthorized'); return { uid: 'owner' }; } }) };
        if (name.includes('operationalMedia')) return load('lib/server/operationalMedia.ts');
        return require(name);
      }, process: { env: { SUPABASE_URL: 'https://storage.example', SUPABASE_SECRET_KEY: 'test-secret' } },
      fetch: async (url, init) => {
        calls.push({ url, init }); const sequence = calls.length;
        if (fail) return new Response(null, { status: 500 });
        if (url.includes('/object/sign/') && pauseNextSign) { pauseNextSign = false; await new Promise(resolve => { releaseSign = resolve; }); }
        return Response.json(url.includes('/object/sign/') ? { signedURL: new URL(url).pathname.replace('/storage/v1', '') + '?token=temporary-' + sequence } : {});
      }, Buffer, Response, Request, AbortSignal, URL, Date: Clock,
    });
    return loadedModule.exports;
  }
  return { load, calls, fail: () => { fail = true; }, recover: () => { fail = false; }, advance: ms => { now += ms; }, pauseSign: () => { pauseNextSign = true; }, releaseSign: () => releaseSign() };
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



test('deletion starting during an upload removes the late media object', async () => {
 const f=fixture({deletionDuringUpload:true}),route=f.load('app/api/operational/media/route.ts');
 const response=await route.POST(new Request('https://test',{method:'POST',headers:{Authorization:'Bearer owner','x-photo-path':photo,'Content-Type':'image/jpeg'},body:bytes}));
 assert.equal(response.status,409); assert.ok(f.calls.some(c=>c.init?.method==='DELETE'));
});

test('unchanged owned photos share concurrent signing and reuse the valid result', async () => {
  const f = fixture(), media = f.load('lib/server/operationalMedia.ts');
  const source = { avatar: `supabase://littersense-media/${photo}` };
  const [first, second] = await Promise.all([media.refreshPhotos(source, 'owner'), media.refreshPhotos(source, 'owner')]);
  const third = await media.refreshPhotos(source, 'owner');
  assert.equal(first.avatar, second.avatar); assert.equal(second.avatar, third.avatar);
  assert.equal(f.calls.length, 1, 'one signing request serves all three reads');
  assert.equal(source.avatar, `supabase://littersense-media/${photo}`);
});

test('signed photo reuse expires before the issued twenty-four-hour URL expires', async () => {
  const f = fixture(), media = f.load('lib/server/operationalMedia.ts');
  const first = await media.signPhoto(photo);
  f.advance(22 * 60 * 60 * 1000); assert.equal(await media.signPhoto(photo), first);
  f.advance(60 * 60 * 1000 + 1); const renewed = await media.signPhoto(photo);
  assert.notEqual(renewed, first); assert.equal(f.calls.length, 2);
});

test('a new saved record revision bypasses a signature cached by another server instance', async () => {
  const f = fixture(), media = f.load('lib/server/operationalMedia.ts');
  const source = { avatar: `supabase://littersense-media/${photo}` };
  const first = await media.refreshPhotos(source, 'owner', 1);
  assert.equal((await media.refreshPhotos(source, 'owner', 1)).avatar, first.avatar);
  const updated = await media.refreshPhotos(source, 'owner', 2);
  assert.notEqual(updated.avatar, first.avatar);
  assert.equal(f.calls.length, 2, 'the changed revision signs again without local upload invalidation');
});

test('photo replacement and deletion invalidate reused signing results', async () => {
  const f = fixture(), media = f.load('lib/server/operationalMedia.ts');
  const first = await media.signPhoto(photo);
  const uploaded = await media.uploadOperationalPhoto('owner', photo, bytes, 'image/jpeg');
  assert.notEqual(uploaded, first); assert.equal(await media.signPhoto(photo), uploaded);
  assert.equal(f.calls.filter(call => call.url.includes('/object/sign/')).length, 2);
  await media.deleteOperationalPhoto('owner', photo);
  assert.notEqual(await media.signPhoto(photo), uploaded);
  assert.equal(f.calls.filter(call => call.url.includes('/object/sign/')).length, 3);
});

test('failed signing is retried and a late pre-upload signature cannot replace the fresh result', async () => {
  const f = fixture(), media = f.load('lib/server/operationalMedia.ts');
  f.fail(); await assert.rejects(media.signPhoto(photo)); f.recover();
  f.pauseSign(); const pending = media.signPhoto(photo);
  await new Promise(resolve => setImmediate(resolve));
  const uploaded = await media.uploadOperationalPhoto('owner', photo, bytes, 'image/jpeg');
  f.releaseSign(); const old = await pending;
  assert.notEqual(old, uploaded); assert.equal(await media.signPhoto(photo), uploaded);
  assert.equal(f.calls.filter(call => call.url.includes('/object/sign/')).length, 3);
});

test('signed photo reuse has bounded memory and never signs another owner photo', async () => {
  const f = fixture(), media = f.load('lib/server/operationalMedia.ts');
  const original = await media.signPhoto(photo);
  for (let i = 0; i < 256; i++) await media.signPhoto(`users/owner/cats/cat-${i}/photo.jpg`);
  assert.notEqual(await media.signPhoto(photo), original, 'oldest entries are evicted once the cache is full');
  const before = f.calls.length;
  const source = { avatar: `supabase://littersense-media/${photo}` };
  assert.equal((await media.refreshPhotos(source, 'other')).avatar, source.avatar);
  assert.equal(f.calls.length, before);
});
