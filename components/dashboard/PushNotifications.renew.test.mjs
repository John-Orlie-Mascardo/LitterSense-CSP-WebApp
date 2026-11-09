import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./PushNotifications.tsx', import.meta.url), 'utf8');

test('the device push address is re-sent when the app becomes visible again (Android home-screen apps)', () => {
  assert.match(source, /document\.addEventListener\('visibilitychange', onVisible\)/);
  assert.match(source, /const onVisible = \(\) => \{ if \(document\.visibilityState === 'visible'\) renew\(\); \};/);
  assert.match(source, /document\.removeEventListener\('visibilitychange', onVisible\)/);
});

test('the existing focus and online re-registration stays in place', () => {
  assert.match(source, /window\.addEventListener\('focus', renew\)/);
  assert.match(source, /window\.addEventListener\('online', renew\)/);
});
