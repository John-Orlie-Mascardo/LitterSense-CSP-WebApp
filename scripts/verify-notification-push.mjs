import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
nextEnv.loadEnvConfig(process.cwd());
// Run only after the account holder authorizes one labeled push. Never log tokens.
const email = process.argv[2];
assert.ok(email, 'Account email required');
initializeApp({ credential: cert(JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'))) });
const auth = getAuth(), uid = (await auth.getUserByEmail(email)).uid;
const customToken = await auth.createCustomToken(uid);
const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }), signal: AbortSignal.timeout(15000),
});
assert.ok(signIn.ok, 'Test account authentication failed');
const { idToken } = await signIn.json();
const origin = 'https://litter-sense-csp-web-app.vercel.app';
const controller = new AbortController();
const live = await fetch(`${origin}/api/notifications/live`, { headers: { Authorization: `Bearer ${idToken}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
assert.equal(live.status, 200, 'Authenticated live endpoint unavailable');
const reader = live.body.getReader();
await reader.read(); // Initial subscription reconciliation must arrive before the test write.
let id = `notification-qa-${randomUUID()}`;
const headers = { apikey: process.env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' };
const base = `${process.env.SUPABASE_URL}/rest/v1`;
const liveOnly = process.argv.includes('--live-only');
let data = { source: 'system', type: 'system', title: 'LitterSense notification test', message: 'Authorized test: PC and phone notification delivery. No SMS was sent.', createdAt: new Date().toISOString(), isRead: false, route: '/dashboard/notifications' };
if (liveOnly) {
  const response = await fetch(`${base}/operational_records?owner_id=eq.${encodeURIComponent(uid)}&document_path=like.${encodeURIComponent(`users/${uid}/notifications/notification-qa-%`)}&select=document_path,data&order=updated_at.desc&limit=1`, { headers });
  assert.ok(response.ok, 'Existing test lookup failed');
  const row = (await response.json())[0]; assert.ok(row, 'No authorized test record exists');
  id = row.document_path.split('/').at(-1); data = { ...row.data, qaTimingAt: new Date().toISOString() };
}
const started = performance.now();
const invalidation = reader.read().then(result => { assert.ok(!result.done, 'Live stream ended before update'); return Math.round(performance.now() - started); });
const inserted = await fetch(`${base}/operational_records${liveOnly ? `?document_path=eq.${encodeURIComponent(`users/${uid}/notifications/${id}`)}` : ''}`, { method: liveOnly ? 'PATCH' : 'POST', headers, body: JSON.stringify(liveOnly ? { data } : { owner_id: uid, document_path: `users/${uid}/notifications/${id}`, data }), signal: AbortSignal.timeout(10000) });
assert.ok(inserted.ok, 'Test notification could not be saved');
const writeAcknowledgedMs = Math.round(performance.now() - started);
if (liveOnly) { console.log(JSON.stringify({ authenticatedLiveInvalidationMs: await invalidation, writeAcknowledgedMs, anotherPushSent: false })); controller.abort(); process.exit(0); }
const dispatch = await fetch(`${origin}/api/push/dispatch`, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId: id }), signal: AbortSignal.timeout(20000) });
assert.ok(dispatch.ok, 'Test push dispatch failed');
assert.equal((await dispatch.json()).queued, true, 'Test push was not queued');
console.log(JSON.stringify({ authenticatedLiveInvalidationMs: await invalidation }));
controller.abort();
for (let attempt = 0; attempt < 20; attempt++) {
  const response = await fetch(`${base}/sms_outbox?event_key=eq.${encodeURIComponent(`push:${uid}:${id}`)}&select=status,push_status,context`, { headers, signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, 'Delivery verification unavailable');
  const row = (await response.json())[0];
  if (row && ['sent', 'failed', 'cancelled', 'unknown'].includes(row.push_status)) {
    console.log(JSON.stringify({ smsStatus: row.status, pushStatus: row.push_status, deliveryTiming: row.context.deliveryTiming ?? null }));
    assert.equal(row.status, 'cancelled', 'SMS must stay disabled for this test');
    assert.equal(row.push_status, 'sent', 'Provider did not accept the push');
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
throw new Error('Push remains queued; do not resend the test');
