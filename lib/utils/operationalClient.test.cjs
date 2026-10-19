const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const fs = require('firebase/firestore');
const { initializeApp } = require('firebase/app');
const db = fs.getFirestore(initializeApp({ projectId: 'primary-adapter-test', apiKey: 'test', appId: 'test' }, 'primary-adapter-test'));
function fixture(primary = true, legacySnapshot) {
  const rows = new Map(), calls = [], timers = [], errors = [], events = new Map();
  const pendingTimers = new Map(), eventListeners = new Map();
  let now = 0, timerId = 0;
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const document = {
    hidden: false,
    addEventListener(name, fn) {
      if (!eventListeners.has(name)) eventListeners.set(name, new Set());
      const listeners = eventListeners.get(name); listeners.add(fn);
      events.set(name, () => listeners.forEach(listener => listener()));
    },
    removeEventListener(name, fn) {
      const listeners = eventListeners.get(name); listeners?.delete(fn);
      if (!listeners?.size) { eventListeners.delete(name); events.delete(name); }
    },
  };
  let releaseRead;
  const auth = { currentUser: { uid: 'owner', getIdToken: async () => 'test-owner-token' } };
  let failMode = false, conflict = false;
  const actual = { ...fs };
  for (const name of ['getDoc','getDocs','setDoc','updateDoc','deleteDoc','runTransaction','onSnapshot']) actual[name] = () => { throw new Error('Unexpected Firebase I/O'); };
  if (legacySnapshot) actual.onSnapshot = legacySnapshot;
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
    }, Response, AbortSignal, Date, document,
    setTimeout: (work, delay) => { work.delay = delay; timers.push(work); const id = ++timerId; pendingTimers.set(id, { work, at: now + delay }); return id; },
    clearTimeout: id => pendingTimers.delete(id), console,
  });
  return { api: exports, rows, calls, timers, errors, auth, events, pendingTimers,
    hidden: async value => { document.hidden = value; events.get('visibilitychange')?.(); await flush(); },
    advance: async ms => {
      const end = now + ms;
      for (;;) {
        const next = [...pendingTimers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        pendingTimers.delete(next[0]); now = next[1].at; next[1].work(); await flush();
      }
      now = end; await flush();
    },
    pause: () => { releaseRead = () => {}; }, release: () => { const fn = releaseRead; releaseRead = null; fn(); },
    unavailable: () => { failMode = true; }, available: () => { failMode = false; }, conflict: () => { conflict = true; } };
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

test('legacy listeners forward metadata-only confirmations so missing offline settings can finish loading', async () => {
  let cleanup = 0;
  const f = fixture(false, (_ref, ...args) => {
    const next = args.find(value => typeof value === 'function');
    next({ exists: () => false, metadata: { fromCache: true } });
    if (args[0]?.includeMetadataChanges) next({ exists: () => false, metadata: { fromCache: false } });
    return () => { cleanup++; };
  });
  const seen = [];
  const stop = f.api.onSnapshot(fs.doc(db, 'users/owner/settings/notifications'), { includeMetadataChanges: true }, value => seen.push(value.metadata.fromCache));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, [true, false]);
  assert.equal(f.calls.length, 0);
  stop(); assert.equal(cleanup, 1);
});

test('live-first primary subscriptions use a 30-second fallback refresh', async () => {
  const f = fixture();
  const stop = f.api.onSnapshot(fs.collection(db, 'users/owner/sessions'), () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.timers[0].delay, 30000);
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

test('hidden record subscriptions stop background reads and reconcile once on return while writes remain available', async () => {
  const f = fixture();
  const paths = ['cats', 'catDetails', 'sessions', 'healthLogs', 'catSessionLog'];
  const stops = paths.map(path => f.api.onSnapshot(fs.collection(db, `users/owner/${path}`), () => {}));
  await new Promise(resolve => setImmediate(resolve));
  const readCount = () => f.calls.filter(call => call.action === 'list').length;
  assert.equal(readCount(), 5);
  await f.hidden(true);
  await f.advance(300000);
  assert.equal(readCount(), 5, 'five hidden minutes must not keep fallback reads running');
  for (let i = 0; i < 3; i++) await f.api.updateDoc(fs.doc(db, 'users/owner/cats/one'), { name: `Mochi ${i}` });
  assert.equal(f.calls.filter(call => call.action === 'write').length, 3);
  assert.equal(readCount(), 5, 'hidden write invalidations wait for visibility');
  await f.hidden(false);
  assert.equal(readCount(), 10, 'one reconciliation per subscription on return');
  await f.advance(30000);
  assert.equal(readCount(), 15, 'the visible thirty-second cadence resumes');
  stops.forEach(stop => stop());
  await f.advance(60000);
  assert.equal(readCount(), 15, 'cleanup removes every scheduled refresh');
});

test('a read finishing while hidden publishes its snapshot without restarting fallback polling', async () => {
  const f = fixture(), seen = [];
  const stop = f.api.onSnapshot(fs.collection(db, 'users/owner/sessions'), value => seen.push(value));
  await new Promise(resolve => setImmediate(resolve));
  f.pause(); await f.advance(30000);
  assert.equal(f.calls.length, 2);
  await f.hidden(true); f.release(); await new Promise(resolve => setImmediate(resolve));
  await f.advance(120000);
  assert.equal(f.calls.length, 2);
  await f.hidden(false);
  assert.equal(f.calls.length, 3, 'one immediate read follows the in-flight hidden completion');
  assert.equal(seen.length, 1, 'unchanged snapshots do not cause extra renders');
  stop();
});

test('hidden mounting and transient initial failure still hydrate a first successful record snapshot', async () => {
  const f = fixture(), seen = [];
  await f.hidden(true); f.unavailable();
  const stop = f.api.onSnapshot(fs.collection(db, 'users/owner/cats'), value => seen.push(value), error => f.errors.push(error));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.errors.length, 1);
  f.available(); await f.advance(60000);
  assert.equal(seen.length, 1, 'initial hydration retries even in a hidden tab');
  assert.equal(f.calls.length, 1);
  await f.advance(120000);
  assert.equal(f.calls.length, 1, 'ordinary background reads pause after successful hydration');
  stop();
});

test('notification settings and notification subscriptions retain background refreshes', async () => {
  for (const path of ['users/owner/settings/notifications', 'users/owner/notifications']) {
    const f = fixture(); await f.hidden(true);
    const ref = path.includes('/settings/') ? fs.doc(db, path) : fs.collection(db, path);
    const stop = f.api.onSnapshot(ref, () => {});
    await new Promise(resolve => setImmediate(resolve));
    await f.advance(60000);
    assert.equal(f.calls.length, 3, `${path} keeps its background fallback`);
    f.api.refreshNotificationRecords(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.length, 4, 'live notification invalidations still refresh while hidden');
    stop();
  }
});

test('hidden legacy subscriptions continue receiving events and metadata without primary reads', async () => {
  let notify, cleanup = 0;
  const f = fixture(false, (_ref, ...args) => { notify = args.find(value => typeof value === 'function'); return () => { cleanup++; }; });
  await f.hidden(true);
  const seen = [];
  const stop = f.api.onSnapshot(fs.collection(db, 'users/owner/cats'), { includeMetadataChanges: true }, value => seen.push(value));
  await new Promise(resolve => setImmediate(resolve));
  notify({ metadata: { fromCache: true } }); notify({ metadata: { fromCache: false } });
  await f.advance(60000);
  assert.deepEqual(seen.map(value => value.metadata.fromCache), [true, false]);
  assert.equal(f.calls.length, 0);
  stop(); assert.equal(cleanup, 1);
});

test('a hidden subscription cannot refresh or publish data after the account changes', async () => {
  const f = fixture(), seen = [];
  const stop = f.api.onSnapshot(fs.collection(db, 'users/owner/cats'), value => seen.push(value));
  await new Promise(resolve => setImmediate(resolve));
  await f.hidden(true); f.auth.currentUser = { uid: 'other', getIdToken: async () => 'other-token' };
  await f.hidden(false); await f.advance(60000);
  assert.equal(f.calls.length, 1);
  assert.equal(seen.length, 1);
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


test('primary admin deletion queue supports status membership filters', async () => {
  const f = fixture();
  for (const [id,status] of [['a','pending'],['b','processing'],['c','failed'],['d','none']]) f.rows.set('users/'+id, { revision: 1, data: { deletionStatus: status } });
  const result = await f.api.getDocs(f.api.query(fs.collection(db, 'users'), f.api.where('deletionStatus', 'in', ['pending','processing','failed'])));
  assert.deepEqual(result.docs.map(d => d.id), ['a','b','c']);
});

test('marking one notification read refreshes its collection without rereading six unrelated dashboard collections', async () => {
  const f = fixture();
  const paths = ['notifications', 'cats', 'catDetails', 'sessions', 'healthLogs', 'catSessionLog', 'dailyCatStats/2026-10-15/cats'];
  const stops = paths.map(path => f.api.onSnapshot(fs.collection(db, `users/owner/${path}`), () => {}));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(call => call.action === 'list').length, 7);
  const before = f.calls.length;
  await f.api.updateDoc(fs.doc(db, 'users/owner/notifications/one'), { isRead: true });
  await new Promise(resolve => setImmediate(resolve));
  const reads = f.calls.slice(before).filter(call => call.action !== 'write');
  assert.equal(reads.length, 1, 'one write must not fan out into seven dashboard reads');
  assert.equal(reads[0].path, 'users/owner/notifications');
  stops.forEach(stop => stop());
});

test('batch writes refresh all related paths once and respect document path boundaries', async () => {
  const f = fixture();
  const watched = ['users/owner/cats', 'users/owner/catDetails', 'users/owner/catSessionLog', 'users/owner/cats/one', 'users/owner/cats/one/logs', 'users/owner/cats/one-more'];
  const stops = watched.map((path, index) => f.api.onSnapshot(index < 3 || index === 4 ? fs.collection(db, path) : fs.doc(db, path), () => {}));
  await new Promise(resolve => setImmediate(resolve));
  const before = f.calls.length;
  const batch = f.api.writeBatch(db);
  batch.update(fs.doc(db, 'users/owner/cats/one'), { name: 'Mochi' });
  batch.update(fs.doc(db, 'users/owner/catDetails/one'), { age: 2 });
  batch.update(fs.doc(db, 'users/owner/cats/two'), { name: 'Another cat' });
  await batch.commit();
  await new Promise(resolve => setImmediate(resolve));
  const reads = f.calls.slice(before).filter(call => call.action !== 'write').map(call => call.path).sort();
  assert.deepEqual(reads, ['users/owner/catDetails', 'users/owner/cats', 'users/owner/cats/one', 'users/owner/cats/one/logs'].sort());
  stops.forEach(stop => stop());
});

test('rejected writes do not refresh records and unsubscribed listeners stay removed after a write', async () => {
  const f = fixture();
  const ref = fs.doc(db, 'users/owner/notifications/one');
  const stop = f.api.onSnapshot(fs.collection(db, 'users/owner/notifications'), () => {});
  await new Promise(resolve => setImmediate(resolve));
  f.conflict();
  await assert.rejects(f.api.updateDoc(ref, { isRead: true }), /Retry/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(call => call.action === 'list').length, 1);
  await f.api.deleteDoc(ref);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(call => call.action === 'list').length, 2, 'confirmed deletes refresh the related collection');
  stop();
  await f.api.setDoc(ref, { isRead: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(call => call.action === 'list').length, 2, 'cleanup removes the write listener');
});

test('identical subscriptions share reads and retain the exact thirty-second cadence', async () => {
  const f = fixture(), first = [], second = [], path = 'users/owner/cats';
  f.rows.set(path + '/one', { revision: 1, data: { name: 'Mochi' } });
  const stopFirst = f.api.onSnapshot(fs.collection(db, path), value => first.push(value));
  const stopSecond = f.api.onSnapshot(fs.collection(db, path), value => second.push(value));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 1, 'one upstream read serves both subscribers');
  assert.equal(first.length, 1); assert.equal(second.length, 1);
  await f.advance(29999); assert.equal(f.calls.length, 1);
  f.rows.set(path + '/one', { revision: 2, data: { name: 'Mochi updated' } });
  stopFirst(); await f.advance(1);
  assert.equal(f.calls.length, 2); assert.equal(first.length, 1); assert.equal(second.length, 2);
  stopSecond(); await f.advance(60000);
  assert.equal(f.calls.length, 2); assert.equal(f.events.size, 0);
});

test('a later subscriber receives the current snapshot without resetting refresh timing', async () => {
  const f = fixture(), seen = [], ref = fs.doc(db, 'users/owner/settings/notifications');
  f.rows.set(ref.path, { revision: 1, data: { rfidEntryAlerts: true } });
  const stopFirst = f.api.onSnapshot(ref, () => {});
  await new Promise(resolve => setImmediate(resolve)); await f.advance(15000);
  const stopSecond = f.api.onSnapshot(fs.doc(db, ref.path), value => seen.push(value.data()));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 1); assert.equal(seen.length, 1); assert.equal(seen[0].rfidEntryAlerts, true);
  await f.advance(14999); assert.equal(f.calls.length, 1);
  await f.advance(1); assert.equal(f.calls.length, 2);
  stopFirst(); stopSecond();
});

test('shared subscribers reconcile a write once and keep background notification delays', async () => {
  const f = fixture(), path = 'users/owner/settings/notifications';
  const stopFirst = f.api.onSnapshot(fs.doc(db, path), () => {});
  const stopSecond = f.api.onSnapshot(fs.doc(db, path), () => {});
  await new Promise(resolve => setImmediate(resolve)); await f.hidden(true);
  await f.advance(60000); assert.equal(f.calls.filter(call => call.action === 'read').length, 3);
  await f.api.updateDoc(fs.doc(db, path), { rfidEntryAlerts: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(call => call.action === 'read').length, 4, 'one invalidation serves both listeners');
  stopFirst(); stopSecond();
});

test('different queries and legacy metadata options retain independent subscriptions', async () => {
  const f = fixture(), path = 'users/owner/cats', names = [];
  f.rows.set(path + '/one', { revision: 1, data: { name: 'Mochi' } });
  f.rows.set(path + '/two', { revision: 1, data: { name: 'Luna' } });
  const stops = ['Mochi', 'Luna'].map(name => f.api.onSnapshot(f.api.query(fs.collection(db, path), f.api.where('name', '==', name)), value => names.push(value.docs[0].data().name)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 2); assert.deepEqual(names.sort(), ['Luna', 'Mochi']);
  stops.forEach(stop => stop());
  let legacyConnections = 0, legacyCleanup = 0;
  const legacy = fixture(false, () => { legacyConnections++; return () => { legacyCleanup++; }; });
  const ref = fs.doc(db, 'users/owner/settings/notifications');
  const plain = legacy.api.onSnapshot(ref, () => {});
  const metadata = legacy.api.onSnapshot(ref, { includeMetadataChanges: true }, () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(legacyConnections, 2); plain(); metadata(); assert.equal(legacyCleanup, 2);
});

test('shared errors retain retry timing and cleanup abandons all pending callbacks', async () => {
  const f = fixture(), seen = [], failures = [], ref = fs.collection(db, 'users/owner/cats');
  f.unavailable();
  const stops = [0, 1].map(() => f.api.onSnapshot(ref, value => seen.push(value), error => failures.push(error)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failures.length, 2); assert.equal(f.pendingTimers.size, 1);
  f.available(); await f.advance(59999); assert.equal(f.calls.length, 0);
  await f.advance(1); assert.equal(f.calls.length, 1); assert.equal(seen.length, 2);
  f.pause(); await f.advance(30000);
  stops.forEach(stop => stop()); f.release(); await new Promise(resolve => setImmediate(resolve));
  await f.advance(60000); assert.equal(seen.length, 2); assert.equal(f.calls.length, 2);
});

test('a new owner never receives the prior owner shared snapshot', async () => {
  const f = fixture(), oldSeen = [], newSeen = [];
  f.rows.set('users/owner/cats/one', { revision: 1, data: { name: 'Mochi' } });
  const stopOld = f.api.onSnapshot(fs.collection(db, 'users/owner/cats'), value => oldSeen.push(value));
  await new Promise(resolve => setImmediate(resolve));
  f.auth.currentUser = { uid: 'other', getIdToken: async () => 'other-token' };
  const stopNew = f.api.onSnapshot(fs.collection(db, 'users/other/cats'), value => newSeen.push(value));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(newSeen.length, 1); assert.equal(newSeen[0].empty, true);
  await f.advance(30000); assert.equal(oldSeen.length, 1);
  stopOld(); stopNew();
});

test('one subscriber throwing cannot prevent another subscriber from receiving updates', async () => {
  const f = fixture(), seen = [], errors = [], path = 'users/owner/cats';
  f.rows.set(path + '/one', { revision: 1, data: { name: 'Mochi' } });
  const stopBroken = f.api.onSnapshot(fs.collection(db, path), () => { throw new Error('Consumer failed'); }, error => errors.push(error));
  const stopHealthy = f.api.onSnapshot(fs.collection(db, path), value => seen.push(value));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(seen.length, 1); assert.equal(errors.length, 1);
  f.rows.set(path + '/one', { revision: 2, data: { name: 'Mochi updated' } });
  await f.advance(30000);
  assert.equal(seen.length, 2); assert.equal(errors.length, 2);
  stopBroken(); stopHealthy();
});

test('queries with different Date boundaries cannot share a snapshot', async () => {
  const f = fixture(), sizes = [], path = 'users/owner/reports';
  for (const day of [2, 3]) {
    const value = `2026-10-0${day}T00:00:00Z`;
    f.rows.set(path + '/' + day, { revision: 1, data: { createdAt: { __firestoreType: 'timestamp', value, seconds: Date.parse(value) / 1000, nanoseconds: 0 } } });
  }
  const stops = [2, 3].map(day => f.api.onSnapshot(f.api.query(fs.collection(db, path), f.api.where('createdAt', '>=', new Date(`2026-10-0${day}T00:00:00Z`))), value => sizes.push(value.size)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 2); assert.deepEqual(sizes, [2, 1]);
  stops.forEach(stop => stop());
});
