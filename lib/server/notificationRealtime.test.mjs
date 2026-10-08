import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

test('realtime filters notification invalidations by authenticated owner and never forwards records', () => {
  let changed = 0, catalogChanged = 0, visitsChanged = 0, failures = 0, cleared = false;
  class Socket {
    static OPEN = 1; static instances = [];
    readyState = 1; sent = [];
    constructor() { Socket.instances.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.onclose?.(); }
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/server/notificationRealtime.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: { exports }, exports, URL, WebSocket: Socket,
    process: { env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'server-only' } },
    setInterval: () => 1, clearInterval: () => { cleared = true; },
  });
  const stop = exports.watchNotificationChanges('owner-a', kind => { if (kind === 'cats') catalogChanged++; else if (kind === 'visits') visitsChanged++; else changed++; }, () => failures++);
  const socket = Socket.instances[0];
  socket.onopen();
  assert.equal(socket.sent[0].payload.config.postgres_changes[0].filter, 'owner_id=eq.owner-a');
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
  stop(); assert.equal(cleared, true); assert.equal(failures, 0);
});
