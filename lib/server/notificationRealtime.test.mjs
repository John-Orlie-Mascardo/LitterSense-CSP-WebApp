import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

function sharedFixture() {
  const timers = new Set();
  class Socket {
    static OPEN = 1; static instances = [];
    readyState = 1; sent = []; closes = 0;
    constructor() { Socket.instances.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.closes++; this.readyState = 3; this.onclose?.(); }
    emit(event, payload) { this.onmessage?.({ data: JSON.stringify({ event, payload }) }); }
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/server/notificationRealtime.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: { exports }, exports, URL, WebSocket: Socket,
    process: { env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'server-only' } },
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
  });
  return { watch: exports.watchNotificationChanges, Socket, timers };
}

test('two same-owner streams share one socket and a tab renewal does not disconnect the remaining tab', () => {
  const f = sharedFixture(), first = [], second = [], renewed = [];
  const stopFirst = f.watch('owner-a', kind => first.push(kind), () => assert.fail('Unexpected outage'), 'paired');
  const stopSecond = f.watch('owner-a', kind => second.push(kind), () => assert.fail('Unexpected outage'), 'paired');
  assert.equal(f.Socket.instances.length, 1, 'two overlapping tab streams need only one Supabase socket in this instance');
  assert.equal(f.timers.size, 1);
  const socket = f.Socket.instances[0];
  socket.onopen();
  assert.equal(socket.sent.length, 1, 'one channel join per shared socket');
  socket.emit('system', { status: 'ok' });
  socket.emit('system', { status: 'ok' });
  assert.deepEqual(first, [undefined, 'cats', 'visits', 'sensors'], 'two table acknowledgements reconcile once');
  assert.deepEqual(second, first);
  stopFirst();
  const stopRenewed = f.watch('owner-a', kind => renewed.push(kind), () => assert.fail('Unexpected outage'), 'paired');
  assert.equal(f.Socket.instances.length, 1, 'renewal reuses a still-watched socket');
  assert.deepEqual(renewed, [undefined, 'cats', 'visits', 'sensors'], 'a late subscriber reconciles without refreshing the other tab');
  assert.equal(second.length, 4);
  socket.emit('postgres_changes', { data: { record: { document_path: 'users/owner-a/notifications/new' } } });
  assert.equal(first.length, 4, 'unsubscribed stream receives no later events');
  assert.equal(second.length, 5); assert.equal(renewed.length, 5);
  stopSecond(); assert.equal(socket.closes, 0);
  stopRenewed(); stopRenewed();
  assert.equal(socket.closes, 1); assert.equal(f.timers.size, 0);
});

test('different owners and rotated device credentials never share a notification socket', () => {
  const f = sharedFixture();
  const stops = [
    f.watch('owner-a', () => {}, () => {}, 'paired'),
    f.watch('owner-b', () => {}, () => {}, 'paired'),
    f.watch('owner-a', () => {}, () => {}, 'rotated'),
    f.watch('owner-a', () => {}, () => {}),
  ];
  assert.equal(f.Socket.instances.length, 4);
  stops.forEach(stop => stop());
  assert.equal(f.timers.size, 0);
});

test('two table join confirmations reconcile once while subsequent real changes still refresh', () => {
  const f = sharedFixture(), seen = [];
  const stop = f.watch('owner-a', kind => seen.push(kind), () => assert.fail('Unexpected outage'), 'paired');
  const socket = f.Socket.instances[0];
  socket.emit('system', { status: 'ok', extension: 'postgres_changes', channel: 'operational_records' });
  socket.emit('system', { status: 'ok', extension: 'postgres_changes', channel: 'sensor_snapshots' });
  assert.equal(seen.length, 4);
  socket.emit('postgres_changes', { data: { table: 'sensor_snapshots', record: { token_hash: 'paired' } } });
  assert.equal(seen.length, 5);
  assert.equal(seen.at(-1), 'sensors');
  stop();
  socket.emit('postgres_changes', { data: { table: 'sensor_snapshots', record: { token_hash: 'paired' } } });
  assert.equal(seen.length, 5, 'closed sockets do not deliver late frames');
});

test('shared socket failure notifies every stream once and the next connection is fresh', () => {
  const f = sharedFixture(); let firstFailures = 0, secondFailures = 0;
  const stopFirst = f.watch('owner-a', () => {}, () => firstFailures++, 'paired');
  const stopSecond = f.watch('owner-a', () => {}, () => secondFailures++, 'paired');
  const oldSocket = f.Socket.instances[0];
  oldSocket.onerror(); oldSocket.onclose();
  assert.equal(firstFailures, 1); assert.equal(secondFailures, 1);
  assert.equal(f.timers.size, 0);
  const seen = [];
  const stopNext = f.watch('owner-a', kind => seen.push(kind), () => assert.fail('Old socket affected replacement'), 'paired');
  assert.equal(f.Socket.instances.length, 2);
  oldSocket.emit('system', { status: 'ok' });
  assert.equal(seen.length, 0);
  stopFirst(); stopSecond();
  assert.equal(f.Socket.instances[1].closes, 0);
  f.Socket.instances[1].emit('system', { status: 'ok' });
  assert.equal(seen.length, 4);
  stopNext(); assert.equal(f.timers.size, 0);
});

test('realtime filters notification invalidations by authenticated owner and never forwards records', () => {
  let changed = 0, catalogChanged = 0, visitsChanged = 0, sensorsChanged = 0, failures = 0, cleared = false;
  class Socket {
    static OPEN = 1; static instances = [];
    readyState = 1; sent = [];
    constructor() { Socket.instances.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.onclose?.(); }
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/server/notificationRealtime.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: { exports }, exports, URL, WebSocket: Socket,
    process: { env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'server-only' } },
    setInterval: () => 1, clearInterval: () => { cleared = true; },
  });
  const hash = 'a'.repeat(64);
  const stop = exports.watchNotificationChanges('owner-a', kind => { if (kind === 'cats') catalogChanged++; else if (kind === 'visits') visitsChanged++; else if (kind === 'sensors') sensorsChanged++; else changed++; }, () => failures++, hash);
  const socket = Socket.instances[0];
  socket.onopen();
  assert.equal(socket.sent[0].payload.config.postgres_changes[0].filter, 'owner_id=eq.owner-a');
  assert.equal(socket.sent[0].payload.config.postgres_changes[1].filter, `token_hash=eq.${hash}`);
  for (const token_hash of [hash, 'b'.repeat(64)]) socket.onmessage({ data: JSON.stringify({ event: 'postgres_changes', payload: { data: { table: 'sensor_snapshots', record: { token_hash } } } }) });
  assert.equal(sensorsChanged, 1, 'only the paired device invalidates sensor readings');
  socket.onmessage({ data: JSON.stringify({ event: 'postgres_changes', payload: { data: { record: { document_path: 'users/owner-a/deviceState/current' } } } }) });
  assert.equal(sensorsChanged, 2);
  for (const path of ['users/other/notifications/secret', 'users/other/sessions/private', 'users/owner-a/sessions/visit', 'users/owner-a/cats/cat', 'users/owner-a/notifications/one']) {
    socket.onmessage({ data: JSON.stringify({ event: 'postgres_changes', payload: { data: { record: { document_path: path, data: { private: true } } } } }) });
  }
  assert.equal(changed, 1);
  socket.onmessage({ data: JSON.stringify({ event: 'postgres_changes', payload: { data: { old_record: { document_path: 'users/owner-a/notifications/deleted' } } } }) });
  assert.equal(changed, 2);
  socket.onmessage({ data: JSON.stringify({ event: 'system', payload: { status: 'ok' } }) });
  assert.equal(changed, 3, 'reconnection reconciles missed updates');
  assert.equal(catalogChanged, 2, 'cat changes and reconnect refresh the catalog');
  assert.equal(visitsChanged, 2, 'owner visit changes and reconnect refresh history');
  assert.equal(sensorsChanged, 3, 'reconnect reconciles sensor readings');
  socket.onmessage({ data: JSON.stringify({ event: 'postgres_changes', payload: { data: { record: { document_path: 'users/owner-a/sensorHistory/event' } } } }) });
  assert.equal(sensorsChanged, 4, 'saved history refreshes the gas activity list');
  stop(); assert.equal(cleared, true); assert.equal(failures, 0);
});
