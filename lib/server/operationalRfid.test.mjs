import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const root = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'));
const token = 'cfg_abcdefghijklmnop', uid = 'owner', deviceId = 'reader';
const timestamp = { __firestoreType: 'timestamp', value: '2026-10-06T00:00:00.123Z', seconds: 1791244800, nanoseconds: 123456789 };
const row = (document_path, data, owner_id = uid) => ({ document_path, owner_id, data, source_update_at: '2026-10-06T00:00:00Z' });
async function fixture(t, imported = true, realNotifications = false) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(readFileSync(path.join(root, 'docs/sms-storage.sql'), 'utf8'));
  for (const schema of ['sms-outbox.sql', 'sms-delivery.sql', 'sms-profile-number.sql', 'push-alerts.sql']) await db.exec(readFileSync(path.join(root, 'docs', schema), 'utf8'));
  await db.exec(readFileSync(path.join(root, 'docs/sensor-snapshot.sql'), 'utf8'));
  await db.exec(readFileSync(path.join(root, 'supabase/migrations/20261006121032_operational_foundation.sql'), 'utf8'));
  await db.exec(readFileSync(path.join(root, 'supabase/migrations/20261006160000_operational_app_records.sql'), 'utf8'));
  await db.exec(readFileSync(path.join(root, 'supabase/migrations/20261006162000_operational_account_deletion.sql'), 'utf8'));
  await db.exec(readFileSync(path.join(root, 'supabase/migrations/20261006220000_operational_push_tokens.sql'), 'utf8'));
  await db.exec(readFileSync(path.join(root, 'supabase/migrations/20261006221000_scoped_alert_claims.sql'), 'utf8'));
  const initial = [row('users/owner', {}), row('users/other', {}, 'other'), row(`deviceConfigs/${token}`, { ownerId: uid }), row('users/owner/deviceConfig/default', { configToken: token }), row('users/owner/deviceState/current', { deviceId, online: true, sessionActive: false, updatedAt: new Date().toISOString() }), row('users/owner/cats/cat', { name: 'Pusa', createdAt: timestamp }), row('users/owner/catDetails/cat', { rfidTag: 'AABB', birthDate: timestamp })];
  if (imported) await db.query('select public.operational_import($1::jsonb,true)', [JSON.stringify(initial)]);
  if (imported) await db.exec('update public.operational_migration_state set runtime_primary=true,cutover_at=clock_timestamp()');
  await db.query('select public.remember_sensor_device($1,$2)', [uid, require('node:crypto').createHash('sha256').update(token).digest('hex')]);
  let cats = [], failAlerts = false, mirrorRows = null, failCommit = null;
  const background = [], calls = [], smsCalls = [], outbox = new Map();
  const store = async (url, init = {}) => {
    calls.push(url); const parsed = new URL(url, 'https://test/'), params = parsed.searchParams;
    try {
      if (url.startsWith('rpc/operational_commit')) {
        if (failCommit) { const error = failCommit; failCommit = null; throw error; }
        const body = JSON.parse(init.body);
        return Response.json((await db.query('select public.operational_commit($1,$2::jsonb) as result', [body.p_owner_id, JSON.stringify(body.p_changes)])).rows[0].result);
      }
      if (url.startsWith('rpc/operational_project_push_tokens')) {
        await db.query('select public.operational_project_push_tokens($1)', [JSON.parse(init.body).p_owner_id]); return new Response(null, { status: 204 });
      }
      if (url.startsWith('rpc/operational_register_push_token')) {
        const b = JSON.parse(init.body); await db.query('select public.operational_register_push_token($1,$2,$3)', [b.p_owner_id,b.p_token,b.p_remove]); return new Response(null, { status: 204 });
      }
      if (url.startsWith('rpc/sync_sms_account')) {
        const b = JSON.parse(init.body);
        cats = b.p_cats;
        await db.query('select public.sync_sms_account($1,$2,$3::jsonb,$4::jsonb,$5)', [b.p_owner_id,b.p_phone_number,JSON.stringify(b.p_notifications),JSON.stringify(b.p_cats),b.p_token_hash]);
        return new Response(null, { status: 204 });
      }
      if (url.startsWith('rpc/read_sensor_mirrors')) return Response.json(mirrorRows ?? (await db.query('select public.read_sensor_mirrors($1) result', [JSON.parse(init.body).p_owner_id])).rows[0].result);
      if (url.startsWith('sensor_snapshots?')) return Response.json((await db.query('select source,data,received_at from public.sensor_snapshots join public.sms_devices using(token_hash) where token_hash=$1 and owner_id=$2', [params.get('token_hash').slice(3), params.get('sms_devices.owner_id').slice(3)])).rows);
      if (url.startsWith('rpc/remember_sensor_device')) {
        const body = JSON.parse(init.body);
        await db.query('select public.remember_sensor_device($1,$2)', [body.p_owner_id, body.p_token_hash]);
        return new Response(null, { status: 204 });
      }
      if (url.startsWith('rpc/save_sensor_mirror')) {
        const body = JSON.parse(init.body);
        return Response.json((await db.query('select public.save_sensor_mirror($1,$2,$3::jsonb,$4) result', [body.p_token_hash, body.p_source, JSON.stringify(body.p_data), body.p_received_at])).rows[0].result);
      }
      if (url.startsWith('operational_migration_state?')) return Response.json((await db.query('select imported_at,runtime_primary,cutover_at from public.operational_migration_state')).rows);
      if (url.startsWith('operational_records?')) {
        const op = params.get('document_path'), owner = params.get('owner_id')?.slice(3) ?? null;
        const value = op.slice(op.startsWith('like.') ? 5 : 3).replace(/\*/g, '%');
        return Response.json((await db.query(`select document_path,owner_id,data,revision from public.operational_records where ($1::text is null or owner_id=$1) and document_path ${op.startsWith('like.') ? 'like' : '='} $2 order by document_path limit $3 offset $4`, [owner, value, Number(params.get('limit') || 500), Number(params.get('offset') || 0)])).rows);
      }
      if (url.startsWith('sms_devices?')) {
        const hash = params.get('token_hash')?.slice(3);
        if (init.method === 'DELETE') { await db.query('delete from public.sms_devices where owner_id=$1 and token_hash=$2', [params.get('owner_id').slice(3), hash]); return new Response(null, { status: 204 }); }
        const rows = (await db.query('select owner_id from public.sms_devices where token_hash=$1', [hash])).rows;
        return Response.json(rows.map(row => ({ ...row, sms_accounts: { owner_id: row.owner_id, cats, notifications: { rfidVisitAlerts: true, perCat: [] } } })));
      }
      if (url.startsWith('sms_accounts?')) { if (init.method === 'PATCH') cats = JSON.parse(init.body).cats; return Response.json([{ owner_id: uid, cats }]); }
      if (url.startsWith('sms_outbox?')) {
        const row = JSON.parse(init.body), duplicate = outbox.has(row.event_key);
        if (!duplicate) outbox.set(row.event_key, row);
        return Response.json(duplicate ? [] : [row]);
      }
      throw new Error(`Unhandled request ${parsed.pathname}`);
    } catch (error) { return Response.json({ code: error.code || 'XX000' }, { status: 409 }); }
  };
  const firestore = () => { throw new Error('Operational Firestore call is forbidden in this test'); };
  class QuotaError extends Error { status = 429; }
  const accountModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path.join(root, 'lib/utils/smsAccountSync.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: accountModule, exports: accountModule.exports, require, console: { warn() {} } });
  const overrides = {
    'lib/utils/smsAccountSync.ts': { ...accountModule.exports, smsStoreRequest: store, saveSmsAccountBackup: async backup => { const result = await store('rpc/sync_sms_account', { method: 'POST', body: JSON.stringify(backup) }); if (!result.ok) throw new Error('Projection failed'); } },
    'lib/configs/firebase-admin.ts': { getAdminFirestore: firestore, getAdminAuth: () => ({ verifyIdToken: async auth => { if (!['owner', 'other'].includes(auth)) throw new Error('Unauthorized'); return { uid: auth }; } }) },
    'lib/utils/firestoreRest.ts': { getFirestoreRestClient: () => ({ getDocument: async p => { if (p.endsWith('/gasUltrasonic')) throw new QuotaError('Gas remains on the existing quota fallback in Task 3'); return firestore(); } }), FirestoreRestError: QuotaError },
    'lib/utils/rfidNotifications.ts': { queueRfidNotifications: async () => { if (failAlerts) throw new Error('queue down'); return { queued: 1 }; } },
    'lib/utils/sensorSms.ts': { queueSensorSms: async (...args) => { smsCalls.push(args); return { queued: 1 }; } },
    'lib/utils/smsDelivery.ts': { processSmsOutbox: async () => ({}) },
    'lib/utils/pushDelivery.ts': { processPushOutbox: async () => ({}) },
  };
  if (realNotifications) delete overrides['lib/utils/rfidNotifications.ts'];
  const cache = new Map();
  function load(file) {
    file = path.resolve(file); const relative = path.relative(root, file).replaceAll('\\', '/');
    if (overrides[relative]) return overrides[relative];
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} }; cache.set(file, loaded);
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: loaded, exports: loaded.exports, require: name => {
        if (name === 'next/server') return { after: work => background.push(work) };
        if (name === 'firebase/app') return { getApps: firestore, getApp: firestore, initializeApp: firestore };
        if (name === 'firebase/firestore/lite') return { getFirestore: firestore, getDoc: firestore, doc: firestore };
        if (name.startsWith('@/') || name.startsWith('.')) {
          const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
          return base.endsWith('.mjs') ? require(base) : load(base.endsWith('.ts') ? base : `${base}.ts`);
        }
        return require(name);
      }, process: { env: { ...process.env, SUPABASE_RFID_PRIMARY_ENABLED: 'true', CAMERA_RELAY_URL: 'https://relay.example', CAMERA_RELAY_SECRET: 'test-only-secret-with-at-least-32-characters', CAMERA_APP_ORIGIN: 'https://app.example' } }, console: { ...console, info() {}, warn() {} }, Date, Buffer, Response, Request, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
    }, { filename: file });
    return loaded.exports;
  }
  const storeModule = load(path.join(root, 'lib/server/operationalStore.ts'));
  const rfid = load(path.join(root, 'lib/server/operationalRfid.ts'));
  const catalog = load(path.join(root, 'lib/server/operationalCats.ts'));
  const normalize = load(path.join(root, 'lib/utils/sensorSync.ts')).normalizeSensorSyncRequest;
  const get = p => storeModule.readOperationalRecord(uid, p);
  const put = async (p, data) => storeModule.commitOperational(uid, [storeModule.setOperational(p, await get(p), data)]);
  const sync = (payload, credential = token) => rfid.syncOperationalRfid({ deviceId, ...payload }, credential, normalize({ ...payload, configToken: credential }), new Date());
  const event = (eventId = 'boot_100_200', status = 'NORMAL') => ({ eventId, status, rfidHex: 'AABB', durationSecs: 42, startedAt: '2026-10-06T04:00:00Z', endedAt: '2026-10-06T04:00:42Z' });
  return { db, get, put, rfid, catalog, sync, event, calls, smsCalls, background, outbox, load: p => load(path.join(root, p)), storeModule, alerts: value => { failAlerts = value; }, mirrors: value => { mirrorRows = value; }, conflictOnce: () => { failCommit = Object.assign(new Error('Revision'), { code: '40001' }); } };
}

test('app records preserve timestamps, ownership, notification dedupe and existing admin policy', async t => {
  const f = await fixture(t), records = f.load('lib/server/operationalRecords.ts');
  const actor = { uid, email: 'owner@example.com' }, admin = { uid, email: records.MASTER_ADMIN_EMAIL };
  await assert.rejects(records.readClientRecords(actor, 'users/other', false), e => e.status === 403);
  await assert.rejects(records.readClientRecords(actor, 'admins', true), e => e.status === 403);
  await assert.rejects(records.writeClientRecords(actor, [{ path: 'users/owner/catDetails/cat', action: 'update', data: { rfidTag: 'BAD' } }]), e => e.status === 403);
  await records.writeClientRecords(actor, [{ path: 'users/owner', action: 'set', merge: true, data: { fullName: 'Owner', updatedAt: { __op: 'timestamp' } } }]);
  assert.equal((await records.readClientRecords(actor, 'users/owner', false))[0].data.updatedAt.__firestoreType, 'timestamp');
  const notification = 'users/owner/notifications/one';
  await records.writeClientRecords(actor, [{ path: notification, action: 'set', data: { title: 'Alert', createdAt: { __op: 'timestamp' }, isRead: false }, revision: 0 }]);
  await assert.rejects(records.writeClientRecords(actor, [{ path: notification, action: 'set', data: {}, revision: 0 }]), e => e.code === 'CLIENT_CONFLICT');
  await records.writeClientRecords(actor, [{ path: notification, action: 'update', data: { isRead: true } }]);
  assert.equal((await records.readClientRecords(actor, 'users/owner/notifications', true))[0].data.isRead, true);
  await records.writeClientRecords(admin, [{ path: 'admins/helper@example.com', action: 'set', data: { name: 'Helper' } }]);
  assert.equal(await records.isOperationalAdmin('helper@example.com'), true);
  assert.equal((await records.readClientRecords(admin, 'users', true)).length, 2);
});

test('owners can read only their deletion requests, including the collection used by the app', async t => {
  const f = await fixture(t), records = f.load('lib/server/operationalRecords.ts');
  await f.db.query('insert into public.operational_records(document_path,owner_id,data) values($1,$2,$3),($4,$5,$6)', ['deleteRequests/mine', uid, { userId: uid, status: 'pending' }, 'deleteRequests/theirs', 'other', { userId: 'other', status: 'pending' }]);
  assert.deepEqual(Array.from(await records.readClientRecords({ uid }, 'deleteRequests', true), r => r.path), ['deleteRequests/mine']);
  assert.equal((await records.readClientRecords({ uid }, 'deleteRequests/mine', false))[0].data.status, 'pending');
  assert.equal((await records.readClientRecords({ uid }, 'deleteRequests/theirs', false)).length, 0);
});

test('primary device setup rotates credentials atomically, isolates owners and keeps Wi-Fi contract', async t => {
  const f = await fixture(t), route = f.load('app/api/device-provisioning/route.ts');
  const request = (auth, body) => new Request('https://test/api/device-provisioning', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await route.GET(request('bad'))).status, 401);
  assert.equal((await route.GET(request('other'))).status, 200);
  const next = 'cfg_new_abcdefghijklmnop', body = { configToken: next, previousToken: token, deviceName: 'Box', wifiSsid: 'Home', wifiPassword: ' password ', ownerId: 'other' };
  assert.equal((await route.POST(request(uid, { ...body, wifiSsid: 'x'.repeat(33) }))).status, 400);
  assert.equal((await route.POST(request('other', body))).status, 409);
  assert.equal((await route.POST(request(uid, body))).status, 200);
  assert.equal((await f.get(`deviceConfigs/${next}`)).data.ownerId, uid);
  assert.equal(await f.get(`deviceConfigs/${token}`), null);
  assert.equal(await f.catalog.resolveOperationalDevice(next), uid);
  await assert.rejects(f.catalog.resolveOperationalDevice(token), error => error.status === 403);
  assert.equal((await route.POST(request(uid, body))).status, 409);
  const publicConfig = f.load('lib/server/operationalDevices.ts');
  const data = await publicConfig.readPublicOperationalConfig(next);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), { configToken: next, deviceName: 'Box', wifiSsid: 'Home', wifiPassword: ' password ', updatedAt: data.updatedAt });
  assert.equal((await f.db.query('select count(*)::int n from public.sms_devices')).rows[0].n, 1);
  const publicRoute = f.load('app/api/device-config/[configToken]/route.ts');
  assert.equal((await publicRoute.GET(new Request('https://test'), { params: Promise.resolve({ configToken: next }) })).status, 200);
  assert.equal((await publicRoute.GET(new Request('https://test'), { params: Promise.resolve({ configToken: token }) })).status, 403);
  await f.put('users/owner/deviceConfig/default', { configToken: 'cfg_foreign_abcdefghijkl' });
  await assert.rejects(publicConfig.readOperationalDeviceConfig(uid), error => error.status === 403);
});

test('primary gas snapshots use existing SQL, keep active-low readings and never call Firestore', async t => {
  const f = await fixture(t), route = f.load('app/api/sensors/route.ts');
  const send = (values, credential = token) => route.POST(new Request('https://test/api/sensors', { method: 'POST', headers: { 'x-device-config-token': credential, 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'gas-ultrasonic', deviceId: 'gas', gasUltrasonicOnline: true, mq135Raw: 0, mq136Raw: 1, distanceCm: 10, ...values }) }));
  assert.equal((await send({ mq135Raw: 7 })).status, 400);
  assert.equal((await send({}, 'cfg_unknown_abcdefghijkl')).status, 403);
  const response = await send({}); assert.equal(response.status, 200); assert.equal(response.headers.get('x-litersense-ack'), 'gas-ultrasonic');
  assert.equal(f.smsCalls.length, 1); assert.equal(f.smsCalls[0][0].mq135Raw, 0); assert.equal(f.smsCalls[0][0].mq136Raw, 1); assert.equal(f.smsCalls[0][2].events.length, 0);
  const read = auth => route.GET(new Request('https://test/api/sensors', { headers: { Authorization: `Bearer ${auth}` } }));
  const state = await (await read(uid)).json(); assert.equal(state.gasUltrasonicDataSource, 'supabase'); assert.equal(state.gasUltrasonicOnline, true); assert.equal(state.mq135Raw, 0); assert.equal(state.mq136Raw, 1);
  assert.equal((await (await read('other')).json()).gasUltrasonicOnline, false);
  const snapshots = f.load('lib/utils/sensorSnapshotStore.ts');
  await snapshots.saveSensorMirror(token, 'gas-ultrasonic', { mq135Raw: 1 }, new Date(Date.now() - 180001).toISOString());
  assert.equal((await snapshots.readSensorMirrors(uid))[0].data.mq135Raw, 0);
  await assert.rejects(snapshots.saveSensorMirror(token, 'gas-ultrasonic', {}, new Date(Date.now() + 10000).toISOString()), /Invalid sensor receipt/);
  await f.db.query("update public.sensor_snapshots set received_at=now()-interval '4 minutes'");
  assert.equal((await (await read(uid)).json()).gasUltrasonicState, 'stale');
  assert.equal((await route.GET(new Request('https://test/api/sensors'))).status, 401);
  await f.db.exec('drop table public.sensor_snapshots cascade');
  const failed = await send({}); assert.equal(failed.status, 503); assert.equal(failed.headers.get('x-litersense-ack'), null);
  assert.equal((await read(uid)).status, 503); assert.equal(f.smsCalls.length, 1);
});

test('primary readiness, owner identity, stale/busy reader and cancellation fail safely', async t => {
  const f = await fixture(t, false);
  await assert.rejects(f.rfid.startOperationalEnrollment(uid), /not ready/);
  await assert.rejects(f.storeModule.listOperationalRecords(uid, 'users/other/cats/'), /Invalid record prefix/);
  await f.db.query('select public.operational_import($1::jsonb,true)', [JSON.stringify([row('users/owner', {}), row('users/owner/deviceState/current', { deviceId, online: true, sessionActive: true, updatedAt: new Date().toISOString() })])]);
  await f.db.exec('update public.operational_migration_state set runtime_primary=true,cutover_at=clock_timestamp()');
  await assert.rejects(f.rfid.startOperationalEnrollment(uid), /online and idle/);
  await f.put('users/owner/deviceState/current', { deviceId, online: true, updatedAt: new Date(Date.now() - 181000).toISOString() });
  await assert.rejects(f.rfid.startOperationalEnrollment(uid), /online and idle/);
  f.mirrors([{ source: 'rfid', received_at: new Date().toISOString(), data: { online: true, sessionActive: false } }]);
  const a = await f.rfid.startOperationalEnrollment(uid), b = await f.rfid.startOperationalEnrollment(uid);
  await f.rfid.cancelOperationalEnrollment(uid, a.id);
  assert.equal((await f.rfid.readOperationalEnrollment(uid)).id, b.id);
  await f.rfid.cancelOperationalEnrollment(uid, b.id);
  assert.equal((await f.rfid.readOperationalEnrollment(uid)).status, 'cancelled');
});

test('sensor config reads verify ownership once without repeating the public config lookup', async t => {
  const f = await fixture(t), devices = f.load('lib/server/operationalDevices.ts');
  f.calls.length = 0;
  const config = await devices.readOperationalDeviceConfig(uid);
  assert.equal(config.configToken, token);
  assert.equal(f.calls.filter(url => url.startsWith('operational_migration_state?')).length, 1);
  assert.equal(f.calls.filter(url => decodeURIComponent(url).includes(`document_path=eq.deviceConfigs/${token}`)).length, 1);
  assert.equal(f.calls.length, 4, 'foundation, account, pointer and owned credential only');
});

test('five-second proof, removal reset, expired proof, duplicate tag and atomic registration', async t => {
  const f = await fixture(t), scan = await f.rfid.startOperationalEnrollment(uid);
  const proof = (sequence, holdMs, present = true, tag = 'CCDD') => f.sync({ enrollmentReadyId: scan.id, enrollmentScan: { id: scan.id, sequence, tag, version: 2, holdMs, present } });
  await proof(0, 4999); assert.equal((await f.rfid.readOperationalEnrollment(uid)).status, 'holding');
  await assert.rejects(f.catalog.mutateOperationalCat(uid, { action: 'create', catId: 'new', cat: { name: 'New' }, details: { rfidTag: 'CCDD' } }), /five seconds/);
  await proof(1, 0, false); assert.match((await f.rfid.readOperationalEnrollment(uid)).error, /Keep the tag/);
  assert.equal((await f.rfid.readOperationalEnrollment(uid)).holdMs, 0);
  await proof(2, 5000, true, 'AABB'); assert.match((await f.rfid.readOperationalEnrollment(uid)).error, /Pusa/);
  await proof(3, 5000); assert.equal((await f.rfid.readOperationalEnrollment(uid)).status, 'verified');
  const attempts = await Promise.allSettled(['new', 'race'].map(catId => f.catalog.mutateOperationalCat(uid, { action: 'create', catId, cat: { name: catId }, details: { rfidTag: 'CCDD' } })));
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.db.query("select count(*)::int n from public.operational_tag_claims where tag='CCDD'")).rows[0].n, 1);
  assert.equal((await f.rfid.readOperationalEnrollment(uid)).status, 'cancelled');
  const catalog = await f.catalog.readOperationalCatalog(uid); assert.equal(catalog.profiles.length, 2);
  await assert.rejects(f.catalog.mutateOperationalCat(uid, { action: 'create', catId: 'duplicate', cat: { name: 'Duplicate' }, details: { rfidTag: 'AABB' } }), /Pusa/);
  const expired = await f.rfid.startOperationalEnrollment(uid);
  await f.put('users/owner/deviceState/rfidEnrollment', { ...expired, expiresAt: Date.now() - 1 });
  await f.sync({ enrollmentScan: { id: expired.id, sequence: 0, tag: 'EEFF', version: 2, holdMs: 5000, present: true } });
  assert.equal((await f.rfid.readOperationalEnrollment(uid)).status, 'waiting');
  await assert.rejects(f.sync({ deviceId: 'wrong' }), /identity/);
  await assert.rejects(f.sync({}, 'cfg_unknown0123456789'), /Unknown device/);
});

test('visits and counters commit once; interruption, unknown tag and identity conflicts are safe', async t => {
  const f = await fixture(t), event = f.event();
  f.conflictOnce();
  const first = await f.sync({ events: [event] }); assert.equal(first.recorded.length, 1); assert.equal(first.acknowledged, event.eventId);
  const replay = await f.sync({ events: [event] }); assert.equal(replay.duplicates.length, 1);
  assert.equal((await f.get('users/owner/deviceState/current')).data.completedSessionCount, 1);
  const summary = (await f.db.query("select data from public.operational_records where document_path like 'users/owner/catStats/%'")).rows[0].data;
  assert.equal(summary.visits, 1); assert.equal(summary.totalDurationSecs, 42);
  await f.sync({ events: [f.event('timeout', 'NO_EXIT_TIMEOUT')] });
  assert.equal((await f.get('users/owner/deviceState/current')).data.completedSessionCount, 2);
  assert.equal((await f.get('users/owner/deviceState/current')).data.noExitTimeoutCount, 1);
  assert.deepEqual((await f.db.query("select data from public.operational_records where document_path='users/owner/cats/cat'")).rows[0].data.createdAt, timestamp);
  await assert.rejects(f.sync({ events: [{ ...event, durationSecs: 50 }] }), /identity conflicts/);
  await f.sync({ events: [f.event('reboot_100_200', 'SESSION_INTERRUPTED')] });
  assert.equal((await f.get('users/owner/deviceState/current')).data.completedSessionCount, 2);
  const unknown = await f.sync({ events: [{ ...f.event('unknown'), rfidHex: 'FFFF' }] });
  assert.equal(unknown.acknowledged, ''); assert.equal(unknown.unmatched.length, 1);
  assert.equal((await f.db.query("select count(*)::int n from public.operational_records where document_path like 'users/owner/sessions/%'")).rows[0].n, 3);
  await f.catalog.mutateOperationalCat(uid, { action: 'update', catId: 'cat', cat: { name: 'Renamed' } });
  assert.deepEqual((await f.db.query("select data from public.operational_records where document_path='users/owner/cats/cat'")).rows[0].data.createdAt, timestamp);
});

test('primary endpoints authenticate, acknowledge only durable visits and read Supabase without Firestore', async t => {
  const f = await fixture(t), route = f.load('app/api/sensors/route.ts'), enrollmentRoute = f.load('app/api/rfid-enrollment/route.ts');
  const request = (auth = uid) => new Request('https://test/api/rfid-enrollment', { method: 'POST', headers: { Authorization: `Bearer ${auth}` } });
  assert.equal((await enrollmentRoute.POST(request('bad'))).status, 401);
  assert.equal((await enrollmentRoute.POST(request())).status, 200);
  const event = f.event();
  const send = () => route.POST(new Request('https://test/api/sensors', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device-config-token': token }, body: JSON.stringify({ deviceId, events: [event] }) }));
  f.alerts(true); const failed = await send(); assert.equal(failed.status, 503); assert.equal(failed.headers.get('x-litersense-ack'), null);
  f.alerts(false); const success = await send(); assert.equal(success.status, 200); assert.equal(success.headers.get('x-litersense-ack'), event.eventId); assert.equal((await success.json()).duplicates, 1);
  assert.equal((await f.get('users/owner/deviceState/current')).data.completedSessionCount, 1);
  const display = await route.GET(new Request('https://test/api/sensors', { headers: { Authorization: 'Bearer owner' } }));
  assert.equal(display.status, 200); const state = await display.json(); assert.equal(state.rfidDataSource, 'supabase'); assert.equal(state.online, true);
  const catsRoute = f.load('app/api/cats/route.ts');
  const cats = await catsRoute.GET(new Request('https://test/api/cats', { headers: { Authorization: 'Bearer owner' } }));
  assert.equal(cats.status, 200); assert.equal((await cats.json()).operationalPrimary, true);
});

test('canonical history paginates and isolates owners, including empty history', async t => {
  const f = await fixture(t);
  await f.sync({ events: [f.event('one'), f.event('two'), f.event('three')] });
  const { readCatHistory } = f.load('lib/utils/catHistoryReads.ts');
  const query = { startDate: '2026-10-01', endDate: '2026-10-31', sort: 'asc', limit: 2, catId: 'all' };
  const first = await readCatHistory(uid, query); assert.equal(first.rows.length, 2); assert.ok(first.nextCursor); assert.equal(first.complete, true);
  const next = await readCatHistory(uid, { ...query, cursor: first.nextCursor }); assert.equal(next.rows.length, 1); assert.equal(next.nextCursor, null);
  assert.equal(new Set([...first.rows, ...next.rows].map(r => r.sessionId)).size, 3);
  await assert.rejects(readCatHistory('other', { ...query, cursor: first.nextCursor }), error => error.status === 403);
  assert.equal((await readCatHistory('other', query)).rows.length, 0);
  const old = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString()); old.source = 'firebase';
  await assert.rejects(readCatHistory(uid, { ...query, cursor: Buffer.from(JSON.stringify(old)).toString('base64url') }), error => error.status === 409 && error.resetRequired);
});

test('real RFID queue keeps one push and repairs notification history on a duplicate retry', async t => {
  const f = await fixture(t, true, true), event = { ...f.event(), endedAt: new Date().toISOString(), startedAt: new Date(Date.now() - 42000).toISOString() };
  const route = f.load('app/api/sensors/route.ts');
  const send = () => route.POST(new Request('https://test/api/sensors', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device-config-token': token }, body: JSON.stringify({ deviceId, events: [event] }) }));
  assert.equal((await send()).status, 200);
  f.background.splice(0); // Simulate interruption after durable queueing but before the inbox write.
  assert.equal((await send()).status, 200);
  for (const work of f.background.splice(0)) await work();
  assert.equal(f.outbox.size, 1);
  assert.equal((await f.db.query("select count(*)::int n from public.operational_records where document_path like 'users/owner/notifications/%'")).rows[0].n, 1);
  assert.equal([...f.outbox.values()][0].push_status, 'pending');
});

test('imported camera credentials reconnect and pair through Supabase with Firestore blocked', async t => {
  const f = await fixture(t), camera = `cam_${'a'.repeat(32)}`, key = 'b'.repeat(64);
  const cloud = f.load('lib/server/cameraCloud.ts');
  await f.put(`cameraDevices/${camera}`, { ownerId: uid, keyHash: cloud.cameraKeyHash(key), revoked: false, createdAt: timestamp });
  await f.put('users/owner/deviceState/camera', { deviceId: camera });
  const ownerRequest = () => new Request('https://app.example/api/camera/session', { headers: { Authorization: 'Bearer owner' } });
  const view = f.load('app/api/camera/session/route.ts');
  assert.equal((await view.GET(ownerRequest())).status, 200);
  assert.equal((await view.GET(new Request('https://app.example/api/camera/session', { headers: { Authorization: 'Bearer other' } }))).status, 404);
  const publisher = f.load('app/api/camera/device-session/route.ts');
  const publish = (id = camera, credential = key) => publisher.POST(new Request('https://app.example/api/camera/device-session', { method: 'POST', headers: { 'x-camera-id': id, Authorization: `Bearer ${credential}` } }));
  assert.equal((await publish()).status, 200);
  assert.deepEqual((await f.db.query('select data from public.operational_records where document_path=$1', [`cameraDevices/${camera}`])).rows[0].data.createdAt, timestamp);
  assert.equal((await publish(camera, 'c'.repeat(64))).status, 401);
  const paired = await f.load('app/api/camera/pair/route.ts').POST(ownerRequest());
  assert.equal(paired.status, 200);
  const code = new URL((await paired.json()).pairingCode);
  const [newCamera, newKey] = code.hash.slice(1).split('.');
  assert.notEqual(newCamera, camera);
  assert.equal((await publish()).status, 401);
  assert.equal((await publish(newCamera, newKey)).status, 200);
  assert.equal((await f.get('users/owner/deviceState/camera')).data.deviceId, newCamera);
});

test('new primary accounts, settings, health logs and reports work without Firestore; rejected paths cannot bypass dedicated flows', async t => {
  const f = await fixture(t), records = f.load('lib/server/operationalRecords.ts');
  const actor = { uid: 'new-owner' };
  assert.equal((await records.readClientRecords(actor, 'users/new-owner', false)).length, 0);
  await records.writeClientRecords(actor, [{ path: 'users/new-owner', action: 'set', data: { email: 'new@example.com', createdAt: { __op: 'timestamp' } } }]);
  await records.writeClientRecords(actor, [
    { path: 'users/new-owner/settings/notifications', action: 'set', data: { ammoniaAlerts: false, quietHours: { enabled: true } } },
    { path: 'users/new-owner/healthLogs/log', action: 'set', data: { catId: 'cat', notes: 'Observation', timestamp: { __op: 'timestamp' } } },
    { path: 'users/new-owner/reports/report', action: 'set', data: { title: 'Report', archived: false } },
  ]);
  assert.equal((await records.readClientRecords(actor, 'users/new-owner/reports', true)).length, 1);
  await records.writeClientRecords(actor, [{ path: 'users/new-owner/reports/report', action: 'update', data: { archived: true } }]);
  assert.equal((await records.readClientRecords(actor, 'users/new-owner/reports/report', false))[0].data.archived, true);
  await assert.rejects(records.writeClientRecords(actor, [{ path: 'users/new-owner', action: 'delete' }]), e => e.status === 403);
  await assert.rejects(records.readClientRecords(actor, 'users/new-owner/notifications', false), e => e.status === 400);
  await assert.rejects(records.writeClientRecords(actor, [{ path: 'users/new-owner/deviceState/anything', action: 'set', data: {} }]), e => e.status === 403);
  await assert.rejects(records.readClientRecords({ uid: 'other' }, 'users/new-owner/reports', true), e => e.status === 403);
});

test('Supabase analysis limiter rejects overlapping work and preserves cooldown and lease ownership', async t => {
  const f = await fixture(t), limiter = f.load('lib/server/operationalAnalysisLimiter.ts').createOperationalAnalysisLimiter(15000);
  const now = Date.now(), first = await limiter.begin(uid, now);
  assert.equal(first.allowed, true);
  assert.equal((await limiter.begin(uid, now + 1000)).reason, 'in_progress');
  await limiter.finish(uid, 'wrong-lease', true, now + 2000);
  assert.equal((await limiter.begin(uid, now + 2000)).reason, 'in_progress');
  await limiter.finish(uid, first.leaseId, false, now + 3000);
  const second = await limiter.begin(uid, now + 3000); assert.equal(second.allowed, true);
  await limiter.finish(uid, second.leaseId, true, now + 4000);
  assert.equal((await limiter.begin(uid, now + 5000)).reason, 'cooldown');
  assert.equal((await limiter.begin(uid, now + 19000)).allowed, true);
  assert.equal((await limiter.begin(uid, now + 64001)).allowed, true);
});

test('approved deletion removes canonical credentials and alert account, preserves audit and other owners, and can retry', async t => {
  const f = await fixture(t);
  await f.db.query('insert into public.operational_records(document_path,owner_id,data) values($1,$2,$3)', ['deleteRequests/request', uid, { userId: uid, status: 'pending', reason: 'Requested by owner' }]);
  const start = () => f.db.query('select public.operational_delete_account($1,$2)', [uid, 'request']);
  await assert.rejects(start(), e => e.code === '42501');
  await f.db.query("update public.operational_records set data=data-'status' where document_path='deleteRequests/request'");
  await assert.rejects(start(), e => e.code === '42501');
  await f.db.query("update public.operational_records set data=jsonb_set(data,'{status}','\"approved\"') where document_path='deleteRequests/request'");
  await start(); await start();
  await assert.rejects(f.put('users/owner', { name: 'Recreated owner' }));
  assert.equal((await f.db.query('select count(*)::int n from public.operational_records where owner_id=$1', [uid])).rows[0].n, 1);
  assert.equal((await f.db.query('select count(*)::int n from public.sms_accounts where owner_id=$1', [uid])).rows[0].n, 0);
  assert.ok(await f.storeModule.readOperationalRecord('other', 'users/other'));
  await f.db.query('select public.operational_finish_deletion($1,$2)', [uid, 'request']);
  const request = await f.get('deleteRequests/request'); assert.equal(request.data.status, 'deleted'); assert.equal(request.data.reason, 'Requested by owner');
  await assert.rejects(f.db.query('select public.operational_delete_account($1,$2)', ['other', 'request']), e => e.code === '42501');
});

test('primary token updates preserve multiple devices and saved-notification dispatch reads canonical records with Firestore blocked', async t => {
  const f = await fixture(t), tokens = f.load('lib/server/operationalPushTokens.ts'), records = f.load('lib/server/operationalRecords.ts');
  await Promise.all([tokens.updateOperationalPushTokens(uid, ['device-one-abcdefghijklmnop'], false), tokens.updateOperationalPushTokens(uid, ['device-two-abcdefghijklmnop'], false)]);
  assert.deepEqual([...(await f.get('users/owner')).data.fcmTokens].sort(), ['device-one-abcdefghijklmnop','device-two-abcdefghijklmnop']);
  await tokens.updateOperationalPushTokens(uid, ['device-one-abcdefghijklmnop'], true);
  assert.deepEqual((await f.get('users/owner')).data.fcmTokens, ['device-two-abcdefghijklmnop']);
  await records.writeClientRecords({ uid }, [{ path: 'users/owner/notifications/saved', action: 'set', data: { source: 'system', title: 'Device notice', message: 'Check device', createdAt: { __op: 'timestamp' } } }]);
  const route = f.load('app/api/push/dispatch/route.ts'), request = () => new Request('https://test/api/push/dispatch', { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId: 'saved' }) });
  assert.equal((await (await route.POST(request())).json()).queued, true);
  assert.equal((await (await route.POST(request())).json()).queued, false);
  assert.equal(f.outbox.size, 1);
  await f.put('users/owner/notifications/saved', { source: 'system', createdAt: new Date(Date.now() - 7200000).toISOString() });
  assert.equal((await (await route.POST(request())).json()).queued, false);
});

test('canonical push tokens repair a missing mirror and move atomically between accounts', async t => {
  const f = await fixture(t), tokens = f.load('lib/server/operationalPushTokens.ts'), records = f.load('lib/server/operationalRecords.ts');
  const token = 'phone-token-abcdefghijklmnop';
  await f.put('users/owner', { fcmTokens: [token] });
  await records.projectOperationalAccount(uid);
  assert.deepEqual((await f.db.query('select fcm_tokens from public.sms_accounts where owner_id=$1', [uid])).rows[0].fcm_tokens, [token]);
  await tokens.updateOperationalPushTokens('other', [token], false);
  assert.deepEqual((await f.get('users/owner')).data.fcmTokens, []);
  await records.projectOperationalAccount(uid);
  assert.deepEqual((await f.db.query('select fcm_tokens from public.sms_accounts where owner_id=$1', ['other'])).rows[0].fcm_tokens, [token]);
  await tokens.updateOperationalPushTokens('other', [token], true);
  assert.deepEqual((await f.db.query('select fcm_tokens from public.sms_accounts where owner_id=$1', ['other'])).rows[0].fcm_tokens, []);
});

test('runtime readiness refuses an imported database before cutover is marked', async t => {
  const f = await fixture(t);
  await f.db.exec('update public.operational_migration_state set runtime_primary=false,cutover_at=null');
  await assert.rejects(f.storeModule.assertOperationalReady(uid), /not ready/);
  await assert.rejects(f.put('users/owner/settings/notifications', {}), /unavailable/);
});

test('scoped alert claims never cancel another owner before their canonical recipient is repaired', async t => {
  const f = await fixture(t);
  await f.db.query("update public.sms_accounts set phone_number='+639171234567' where owner_id=$1", [uid]);
  await f.db.query("insert into public.sms_accounts(owner_id) values('other')");
  await f.db.query("insert into public.sms_outbox(event_key,owner_id,reason,message) values('mine','owner','Ammonia detected','test'),('theirs','other','Ammonia detected','test')");
  assert.equal((await f.db.query("select * from public.claim_sms_outbox('owner',2)")).rows.length, 1);
  assert.equal((await f.db.query("select status from public.sms_outbox where event_key='theirs'")).rows[0].status, 'pending');
});

test('idle RFID heartbeat skips catalog scans but still persists reader state', async t => {
  const f = await fixture(t);
  f.calls.length = 0;
  await f.sync({ online: true, sessionActive: false, events: [] });
  assert.equal(f.calls.some(url => url.includes('document_path=like.')), false, 'no catalog collection reads for an idle heartbeat');
  assert.equal((await f.get('users/owner/deviceState/current')).data.online, true);
});

test('idle reader response does not wait on notification projection or queues', async t => {
  const f = await fixture(t), route = f.load('app/api/sensors/route.ts');
  f.calls.length = 0;
  f.alerts(true);
  const response = await route.POST(new Request('https://test/api/sensors', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device-config-token': token }, body: JSON.stringify({ deviceId, online: true, sessionActive: false, events: [] }) }));
  assert.equal(response.status, 200);
  assert.equal(f.calls.some(url => url.startsWith('rpc/sync_sms_account') || url.startsWith('rpc/operational_project_push_tokens')), false);
  assert.equal(f.smsCalls.length, 0);
});

test('owner startup reads authorize from identity and perform one migration gate', async t => {
  const f = await fixture(t), records = f.load('lib/server/operationalRecords.ts');
  const actor = { uid, email: 'owner@example.com' };
  f.calls.length = 0;
  assert.equal((await records.readClientRecords(actor, `users/${uid}`, false))[0].path, `users/${uid}`);
  assert.equal(f.calls.length, 2, 'profile read requires only migration state and the requested profile');
  assert.equal(f.calls.filter(url => url.startsWith('operational_migration_state?')).length, 1);
  assert.equal(f.calls.some(url => decodeURIComponent(url).includes('admins/')), false);

  f.calls.length = 0;
  assert.equal((await records.readClientRecords(actor, `users/${uid}/cats`, true))[0].path, `users/${uid}/cats/cat`);
  assert.equal(f.calls.length, 3, 'collection read requires migration state, owner readiness and the requested collection');
  assert.equal(f.calls.filter(url => url.startsWith('operational_migration_state?')).length, 1);
  assert.equal(f.calls.some(url => decodeURIComponent(url).includes('admins/')), false);
});

test('self admin startup reads fetch the requested role only once without granting role writes', async t => {
  const f = await fixture(t), records = f.load('lib/server/operationalRecords.ts');
  const actor = { uid, email: 'owner@example.com' };
  f.calls.length = 0;
  assert.equal((await records.readClientRecords(actor, `admins/${actor.email}`, false)).length, 0);
  assert.equal(f.calls.length, 2, 'self role read requires migration state and one role record lookup');
  assert.equal(f.calls.filter(url => decodeURIComponent(url).includes(`admins/${actor.email}`)).length, 1);
  await assert.rejects(records.writeClientRecords(actor, [{ path: `admins/${actor.email}`, action: 'set', data: { name: 'Owner' } }]), error => error.status === 403);
  assert.equal((await f.db.query("select count(*)::int n from public.operational_records where owner_id='@system'")).rows[0].n, 0);
});

test('optimized read authorization still requires a stored admin role for other owners and admin collections', async t => {
  const f = await fixture(t), records = f.load('lib/server/operationalRecords.ts');
  const actor = { uid, email: 'owner@example.com' };
  await assert.rejects(records.readClientRecords(actor, 'users/other', false), error => error.status === 403);
  await assert.rejects(records.readClientRecords(actor, 'users', true), error => error.status === 403);
  await assert.rejects(records.readClientRecords(actor, 'admins', true), error => error.status === 403);
  await assert.rejects(records.readClientRecords(actor, 'admins/else@example.com', false), error => error.status === 403);
  await f.db.query('insert into public.operational_records(document_path,owner_id,data) values($1,$2,$3)', [`admins/${actor.email}`, '@system', { name: 'Helper' }]);
  f.calls.length = 0;
  assert.equal((await records.readClientRecords(actor, 'users/other', false))[0].path, 'users/other');
  assert.equal(f.calls.filter(url => decodeURIComponent(url).includes(`admins/${actor.email}`)).length, 1);
  assert.equal(f.calls.filter(url => url.startsWith('operational_migration_state?')).length, 1);
  assert.equal((await records.readClientRecords(actor, 'users', true)).length, 2);
  assert.equal((await records.readClientRecords(actor, 'admins', true)).length, 1);
  await assert.rejects(records.writeClientRecords(actor, [{ path: 'users/other', action: 'update', data: { fullName: 'Changed' } }]), error => error.status === 403);
});

test('optimized reads preserve malformed path and dedicated mutation protections', async t => {
  const f = await fixture(t), records = f.load('lib/server/operationalRecords.ts');
  const actor = { uid, email: 'owner@example.com' };
  for (const invalid of ['users/../cats/cat', 'users/owner/cats/%', 'users//cats/cat', 'users/owner/cats/*']) {
    f.calls.length = 0;
    await assert.rejects(records.readClientRecords(actor, invalid, false), error => error.status === 400);
    assert.equal(f.calls.length, 0, 'malformed record paths are rejected before database reads');
  }
  await assert.rejects(records.readClientRecords(actor, 'users/owner/secrets', true), error => error.status === 403);
  for (const collection of ['cats', 'catDetails', 'deviceConfig', 'deviceState']) {
    await assert.rejects(records.writeClientRecords(actor, [{ path: `users/owner/${collection}/one`, action: 'set', data: {} }]), error => error.status === 403);
  }
});

test('optimized reads fail closed when migration cutover or owner readiness is missing', async t => {
  const f = await fixture(t), records = f.load('lib/server/operationalRecords.ts');
  const actor = { uid, email: 'owner@example.com' };
  await f.db.exec('update public.operational_migration_state set runtime_primary=false,cutover_at=null');
  for (const [recordPath, list] of [['users/owner', false], ['users/owner/cats', true], [`admins/${actor.email}`, false]]) {
    f.calls.length = 0;
    await assert.rejects(records.readClientRecords(actor, recordPath, list), error => error.status === 503 && /not ready/.test(error.message));
    assert.equal(f.calls.filter(url => url.startsWith('operational_migration_state?')).length, 1);
    assert.equal(f.calls.some(url => decodeURIComponent(url).includes('document_path=like.')), false, 'unready storage must not return collection rows');
  }
  await f.db.exec('update public.operational_migration_state set runtime_primary=true,cutover_at=clock_timestamp()');
  assert.equal((await records.readClientRecords({ uid: 'new-owner', email: 'new@example.com' }, 'users/new-owner', false)).length, 0, 'own profile lookup still supports new account creation');
  await assert.rejects(records.readClientRecords({ uid: 'new-owner' }, 'users/new-owner/cats', true), error => error.status === 503 && /not ready/.test(error.message));
});

test('cross-owner and admin writes fail closed when admin storage is unavailable', async t => {
  const f = await fixture(t), records = f.load('lib/server/operationalRecords.ts');
  await f.db.exec('drop table public.operational_records cascade');
  const actor = { uid, email: 'owner@example.com' };
  await assert.rejects(records.accessRecord(actor, 'users/other'), error => error.status === 503 && /Admin records unavailable/.test(error.message));
  await assert.rejects(records.accessRecord(actor, `admins/${actor.email}`, true), error => error.status === 503 && /Admin records unavailable/.test(error.message));
});
