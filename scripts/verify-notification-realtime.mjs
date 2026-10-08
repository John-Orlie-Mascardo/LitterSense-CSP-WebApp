import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());
const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
assert.ok(base && key, 'Server Supabase configuration required');
const uid = `notification-probe-${randomUUID()}`;
const path = `users/${uid}/notifications/probe`;
const url = new URL('/realtime/v1/websocket', base);
url.protocol = 'wss:'; url.searchParams.set('apikey', key); url.searchParams.set('vsn', '1.0.0');
const socket = new WebSocket(url);
const headers = { apikey: key, 'Content-Type': 'application/json' };
let started, inserted = false;
let resolveEvent, rejectEvent;
const observed = new Promise((resolve, reject) => { resolveEvent = resolve; rejectEvent = reject; });
const timeout = setTimeout(() => rejectEvent(new Error('Realtime probe timed out')), 20000);
socket.onopen = () => socket.send(JSON.stringify({ topic: 'realtime:probe', event: 'phx_join', ref: '1', payload: { access_token: key, config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'operational_records', filter: `owner_id=eq.${uid}` }] } } }));
socket.onerror = () => rejectEvent(new Error('Realtime connection failed'));
socket.onmessage = async event => {
  try {
    const message = JSON.parse(String(event.data));
    if (message.event === 'system' && message.payload?.status === 'error') throw new Error('Realtime subscription rejected');
    if (message.event === 'system' && message.payload?.status === 'ok' && !inserted) {
      inserted = true; started = performance.now();
      const response = await fetch(`${base}/rest/v1/operational_records`, { method: 'POST', headers, body: JSON.stringify({ document_path: path, owner_id: uid, data: { type: 'system', title: 'Isolated realtime probe', isRead: false, createdAt: new Date().toISOString() } }), signal: AbortSignal.timeout(10000) });
      assert.equal(response.ok, true, 'Probe insert failed');
    }
    if (message.event === 'postgres_changes' && message.payload?.data?.record?.document_path === path) resolveEvent(Math.round(performance.now() - started));
  } catch (error) { rejectEvent(error); }
};
try {
  const elapsed = await observed;
  console.log(JSON.stringify({ databaseWriteRequestToRealtimeEventMs: elapsed, realUserNotificationsCreated: 0, smsSent: 0, pushSent: 0 }));
} finally {
  clearTimeout(timeout); socket.close();
  const response = await fetch(`${base}/rest/v1/operational_records?document_path=eq.${encodeURIComponent(path)}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(10000) });
  assert.equal(response.ok, true, 'Probe cleanup failed');
}
