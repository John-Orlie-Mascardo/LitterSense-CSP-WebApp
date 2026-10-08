const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const fs = require('firebase/firestore');
const { initializeApp } = require('firebase/app');
const db = fs.getFirestore(initializeApp({ projectId: 'primary-adapter-test', apiKey: 'test', appId: 'test' }, 'primary-adapter-test'));
function fixture(primary = true) {
  const rows = new Map(), calls = [], timers = [], errors = [], events = new Map();
  let releaseRead;
  const auth = { currentUser: { uid: 'owner', getIdToken: async () => 'test-owner-token' } };
  let failMode = false, conflict = false;
  const actual = { ...fs };
  for (const name of ['getDoc','getDocs','setDoc','updateDoc','deleteDoc','runTransaction','onSnapshot']) actual[name] = () => { throw new Error('Unexpected Firebase I/O'); };
  actual.writeBatch = () => ({ set() {}, update() {}, delete() {}, commit() { throw new Error('Unexpected Firebase I/O'); } });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/utils/operationalClient.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: { exports }, exports, require: name => name === 'firebase/firestore' ? actual : name.includes('configs/firebase') ? { auth } : { operationalPrimary: async () => { if (failMode) throw new Error('Mode unavailable'); return primary; } },
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      if (releaseRead && body.action !== 'write') await new Promise(resolve => { releaseRead = resolve; });
      if (body.action === 'read') return Response.json({ rows: rows.has(body.path) ? [{ path: body.path, ...rows.get(body.path) }] : [] });
      if (body.action === 'list') return Response.json({ rows: [...rows].filter(([p]) => p.startsWith(body.path + '/')).map(([path, row]) => ({ path, ...row })) });
      if (conflict) { conflict = false; return Response.json({ error: 'Retry', code: 'CLIENT_CONFLICT' }, { status: 409 }); }
      return Response.json({ ok: true });
    }, Response, AbortSignal, Date, document: { hidden: false, addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); } }, setTimeout: (work, delay) => { work.delay = delay; timers.push(work); return timers.length; }, clearTimeout() {}, console,
  });
  return { api: exports, rows, calls, timers, errors, auth, events, pause: () => { releaseRead = () => {}; }, release: () => { const fn = releaseRead; releaseRead = null; fn(); }, unavailable: () => { failMode = true; }, conflict: () => { conflict = true; } };
}
test('primary adapter preserves timestamp nanos, filters/sorts and normalizes canonical notification dates without Firebase I/O', async () => {
  const f = fixture(), path = 'users/owner/notifications';
  f.rows.set(path + '/a', { revision: 1, data: { createdAt: '2026-10-06T10:00:00Z', isRead: false } });
  f.rows.set(path + '/b', { revision: 2, data: { createdAt: { __firestoreType: 'timestamp', seconds: 1791280801, nanoseconds: 123456789, value: '2026-10-06T10:00:01.123Z' }, isRead: true } });
  const q = f.api.query(fs.collection(db, path), f.api.orderBy('createdAt', 'desc'));
  const result = await f.api.getDocs(q);
  assert.equal(result.docs[0].id, 'b'); assert.equal(result.docs[0].data().createdAt.nanoseconds, 123456789);
  assert.ok(result.docs[1].data().createdAt instanceof fs.Timestamp);
  const filtered = await f.api.getDocs(f.api.query(fs.collection(db, path), f.api.where('isRead', '==', false)));
  assert.equal(filtered.size, 1);
});
test('failed mode check stops reads/writes; transaction retries carry revisions and encoded field operations', async () => {
  const f = fixture(), ref = fs.doc(db, 'users/owner/notifications/one');
  f.rows.set(ref.path, { revision: 4, data: { isRead: false } }); f.conflict();
  let work = 0;
  await f.api.runTransaction(db, async tx => { work++; await tx.get(ref); tx.update(ref, { isRead: true, updatedAt: f.api.serverTimestamp() }); });
  assert.equal(work, 2); assert.equal(f.calls.at(-1).writes[0].revision, 4); assert.equal(f.calls.at(-1).writes[0].data.updatedAt.__op, 'timestamp');
  f.unavailable(); const before = f.calls.length;
  await assert.rejects(f.api.getDoc(ref), /Mode unavailable/); await assert.rejects(f.api.setDoc(ref, {}), /Mode unavailable/);
  assert.equal(f.calls.length, before);
});
test('primary listener stops on unsubscribe or account change instead of exposing previous owner records', async () => {
  const f = fixture(), seen = [], ref = fs.collection(db, 'users/owner/reports');
  const stop = f.api.onSnapshot(ref, value => seen.push(value));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(seen.length, 1);
  stop(); await f.timers.shift()(); assert.equal(f.calls.length, 1);
  f.api.onSnapshot(ref, value => seen.push(value)); f.auth.currentUser = { uid: 'other' };
  await new Promise(resolve => setImmediate(resolve)); assert.equal(seen.length, 1);
});

test('visible primary subscriptions refresh within five seconds', async () => {
  const f = fixture();
  const stop = f.api.onSnapshot(fs.collection(db, 'users/owner/sessions'), () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.timers[0].delay, 5000);
  stop();
});

test('tab return refreshes immediately and removes its handler on unsubscribe', async () => {
  const f = fixture();
  const stop = f.api.onSnapshot(fs.collection(db, 'users/owner/sessions'), () => {});
  await new Promise(resolve => setImmediate(resolve));
  await f.events.get('visibilitychange')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 2);
  stop(); assert.equal(f.events.size, 0);
});
test('write refresh waits for an outstanding read instead of overlapping it', async () => {
  const f = fixture(); f.pause();
  const stop = f.api.onSnapshot(fs.collection(db, 'users/owner/notifications'), () => {});
  await new Promise(resolve => setImmediate(resolve));
  await f.api.updateDoc(fs.doc(db, 'users/owner/notifications/one'), { isRead: true });
  assert.equal(f.calls.filter(c => c.action === 'list').length, 1);
  f.release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.timers.at(-1).delay, 0);
  await f.timers.at(-1)();
  assert.equal(f.calls.filter(c => c.action === 'list').length, 2);
  stop();
});

test('live notification invalidation refreshes only notification listeners and cleanup removes them', async () => {
  const f = fixture();
  const stopNotifications = f.api.onSnapshot(fs.collection(db, 'users/owner/notifications'), () => {});
  const stopCats = f.api.onSnapshot(fs.collection(db, 'users/owner/cats'), () => {});
  await new Promise(resolve => setImmediate(resolve));
  const before = f.calls.length;
  f.api.refreshNotificationRecords();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, before + 1);
  assert.equal(f.calls.at(-1).path, 'users/owner/notifications');
  stopNotifications(); stopCats();
  f.api.refreshNotificationRecords();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, before + 1);
});
