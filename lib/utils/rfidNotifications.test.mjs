import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const sensorSync = require('./sensorSync.ts');
function load(store = async () => new Response('[]'), firestore = {}, schedule = work => work()) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./rfidNotifications.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: loadedModule, exports: loadedModule.exports, Date, Response, console,
    require: id => ({ '@/lib/server/operationalStore': { rfidPrimaryEnabled: () => false }, 'next/server': { after: schedule }, 'node:crypto': crypto, './sensorSync': sensorSync, './catHistoryStore': { readVisitBackupsById: async () => [] }, './smsAccountSync': { smsStoreRequest: store }, '@/lib/configs/firebase-admin': { getAdminFirestore: () => firestore } })[id],
  });
  return loadedModule.exports;
}
const now = new Date('2026-10-05T05:00:00Z');
const account = { owner_id: 'owner', cats: [{ id: 'cat', name: 'Zeno', rfidTag: 'AABB' }], notifications: { rfidVisitAlerts: true, perCat: [] } };
const live = { sessionActive: true, activeRfidHex: 'AABB', activeSessionStartMs: now.getTime() - 1000 };
const event = { eventId: 'boot_100_40000', status: 'NORMAL', durationSecs: 40, startedAt: '2026-10-05T04:59:20Z', endedAt: now.toISOString(), rfidHex: 'AABB', rfidCard: '' };
test('server builds entry and exit without a dashboard, using stable device identities', () => {
  const { buildRfidNotifications: build } = load();
  const entry = build(account, live, [], 'device-hash', now);
  assert.equal(entry.length, 1);
  assert.equal(entry[0].title, 'Zeno entered the litter box');
  assert.equal(build(account, { ...live, activeSessionDurationMs: 5000 }, [], 'device-hash', now)[0].id, entry[0].id);
  const exit = build(account, { sessionActive: false }, [event], 'device-hash', now);
  assert.equal(exit[0].title, 'Zeno left the litter box');
  assert.match(exit[0].message, /40s/);
  assert.equal(build(account, {}, [{ ...event, endedAt: '2026-10-05T04:59:59.500Z' }], 'device-hash', now)[0].id, exit[0].id);
  assert.notEqual(build(account, {}, [{ ...event, eventId: 'another-event' }], 'device-hash', now)[0].id, exit[0].id);
});

test('Firebase inbox writes run after durable queueing, so quota retries cannot hold the board response', async () => {
  const background = [], inbox = [];
  const store = async path => path.startsWith('sms_devices?') ? Response.json([{ sms_accounts: account }]) : Response.json([{}]);
  const { queueRfidNotifications: queue } = load(store, { doc: () => ({ create: async data => inbox.push(data) }) }, work => background.push(work));
  assert.equal((await queue(live, 'cfg_abcdefghijklmnop', [], now)).queued, 1);
  assert.equal(inbox.length, 0);
  assert.equal(background.length, 1);
  await background[0]();
  assert.equal(inbox.length, 1);
});
test('server skips disabled, ambiguous, unmatched, gas, stale and unstable events', () => {
  const { buildRfidNotifications: build } = load();
  for (const data of [ { ...account, notifications: { rfidVisitAlerts: false } }, { ...account, notifications: { rfidVisitAlerts: true, perCat: [{ catId: 'cat', visitAlerts: false }] } }, { ...account, cats: [] }, { ...account, cats: [...account.cats, { ...account.cats[0], id: 'other' }] } ]) assert.equal(build(data, live, [event], 'hash', now).length, 0);
  assert.equal(build(account, { ...live, source: 'gas-ultrasonic' }, [event], 'hash', now).length, 0);
  assert.equal(build(account, { ...live, activeSessionStartMs: now.getTime() - 181000 }, [{ ...event, endedAt: '2026-10-04T04:00:00Z' }, { ...event, eventId: '' }], 'hash', now).length, 0);
});
test('atomic outbox deduplication creates one push-only alert and one inbox record on retries', async () => {
  const rows = new Map(), inbox = [];
  const store = async (path, init) => {
    if (path.startsWith('sms_devices?')) return Response.json([{ sms_accounts: account }]);
    const row = JSON.parse(init.body);
    if (rows.has(row.event_key)) return Response.json([]);
    rows.set(row.event_key, row);
    return Response.json([row]);
  };
  const { queueRfidNotifications: queue } = load(store, { doc: path => ({ create: async data => inbox.push({ path, data }) }) });
  await Promise.all([queue(live, 'cfg_abcdefghijklmnop', [], now), queue(live, 'cfg_abcdefghijklmnop', [], now)]);
  assert.equal(rows.size, 1);
  assert.equal(inbox.length, 1);
  assert.equal([...rows.values()][0].status, 'cancelled');
  assert.equal([...rows.values()][0].push_status, 'pending');
  assert.equal(inbox[0].data.source, 'rfid_visit');
  await queue({}, 'cfg_abcdefghijklmnop', [event], now, 'owner', []);
  assert.equal(rows.size, 1, 'an unpersisted exit must not produce a notification');
  await queue({}, 'cfg_abcdefghijklmnop', [event], now, 'owner', [sensorSync.buildSessionDocumentId('cfg_abcdefghijklmnop', event)]);
  assert.equal(rows.size, 2, 'a confirmed exit creates its independent alert');
  await queue(live, 'cfg_abcdefghijklmnop', [], now, 'different-owner');
  assert.equal(rows.size, 2, 'ownership mismatch cannot queue an alert');
});
