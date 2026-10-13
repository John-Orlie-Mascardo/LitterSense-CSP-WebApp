const assert = require('node:assert/strict');
const test = require('node:test');
const { parseSensorPresenceMessage } = require('./devicePresenceClient.ts');

test('accepts only a valid presence message for the expected board', () => {
  const message = JSON.stringify({ type: 'presence', role: 'gas-ultrasonic', online: true, updatedAt: '2026-10-13T00:00:00.000Z' });
  assert.deepEqual(parseSensorPresenceMessage(message, 'gas-ultrasonic'), {
    role: 'gas-ultrasonic', online: true, updatedAt: '2026-10-13T00:00:00.000Z',
  });
  assert.equal(parseSensorPresenceMessage(message, 'rfid'), null);
});

test('rejects malformed, unknown-role, and invalid presence messages', () => {
  assert.equal(parseSensorPresenceMessage('{', 'rfid'), null);
  assert.equal(parseSensorPresenceMessage(JSON.stringify({ type: 'presence', role: 'other', online: true, updatedAt: null }), 'rfid'), null);
  assert.equal(parseSensorPresenceMessage(JSON.stringify({ type: 'presence', role: 'rfid', online: 'yes', updatedAt: null }), 'rfid'), null);
  assert.equal(parseSensorPresenceMessage(JSON.stringify({ type: 'status', role: 'rfid', online: false, updatedAt: null }), 'rfid'), null);
});
