import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
test('FCM notification payload displays real text and informs foreground clients', async () => {
  const handlers = {}; const shown = []; const messages = [];
  const clients = { matchAll: async () => [{ visibilityState: 'visible', postMessage: value => messages.push(value) }] };
  vm.runInNewContext(readFileSync(new URL('./sw.js', import.meta.url), 'utf8'), { URL, clients, location: { origin: 'https://test' }, addEventListener: (name, fn) => { handlers[name] = fn; }, registration: { showNotification: async (...args) => shown.push(args) } });
  let pending;
  handlers.push({ data: { json: () => ({ notification: { title: 'Zeno alert', body: 'Check Zeno' }, data: { eventKey: 'event-1', url: '/dashboard' } }) }, waitUntil: value => { pending = value; } });
  await pending;
  assert.equal(shown[0][0], 'Zeno alert'); assert.equal(shown[0][1].body, 'Check Zeno');
  assert.equal(shown[0][1].tag, 'event-1'); assert.equal(messages[0].type, 'littersense-push');
});
