const assert = require('node:assert/strict');
const test = require('node:test');
const { sensorPresenceDeviceId, sensorPresenceTicket, SENSOR_PRESENCE_TTL_SECONDS } = require('./devicePresence.ts');

test('presence IDs are stable per credential and distinct per board', () => {
  const rfid = sensorPresenceDeviceId('cfg_test_token_123456', 'rfid');
  assert.match(rfid, /^sen_[a-f0-9]{32}$/);
  assert.equal(sensorPresenceDeviceId('cfg_test_token_123456', 'rfid'), rfid);
  assert.notEqual(sensorPresenceDeviceId('cfg_test_token_123456', 'gas-ultrasonic'), rfid);
  assert.notEqual(sensorPresenceDeviceId('cfg_another_token_123456', 'rfid'), rfid);
});

test('presence tickets are role-scoped and expire after the configured TTL', () => {
  const now = Date.parse('2026-10-13T00:00:00Z');
  const ticket = sensorPresenceTicket('sen_0123456789abcdef0123456789abcdef', 'gas-ultrasonic', 'presence-publish', 'a-secret-that-is-long-enough', now);
  const [payload, signature] = ticket.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.role, 'gas-ultrasonic');
  assert.equal(claims.scope, 'presence-publish');
  assert.equal(claims.exp, Math.floor(now / 1000) + SENSOR_PRESENCE_TTL_SECONDS);
  assert.match(signature, /^[A-Za-z0-9_-]+$/);
});
