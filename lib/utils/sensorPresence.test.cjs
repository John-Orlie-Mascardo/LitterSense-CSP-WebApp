const test = require('node:test');
const assert = require('node:assert/strict');
const { applySensorPresence } = require('./sensorPresence.ts');

test('the UI expires each device independently after fifteen seconds without changing readings', () => {
  const now = Date.parse('2026-10-09T08:00:00Z');
  const data = { online: true, gasUltrasonicOnline: true, sessionActive: true, rfidState: 'online', gasUltrasonicState: 'online', rfidUpdatedAt: new Date(now).toISOString(), gasUltrasonicUpdatedAt: new Date(now - 5000).toISOString(), mq135Raw: 0 };
  assert.equal(applySensorPresence(data, now + 10000).gasUltrasonicOnline, true);
  const gasExpired = applySensorPresence(data, now + 10001);
  assert.equal(gasExpired.online, true);
  assert.equal(gasExpired.gasUltrasonicOnline, false);
  assert.equal(gasExpired.gasUltrasonicState, 'stale');
  assert.equal(gasExpired.mq135Raw, 0);
  assert.equal(applySensorPresence(data, now + 15000).online, true);
  const expired = applySensorPresence(data, now + 15001);
  assert.equal(expired.online, false);
  assert.equal(expired.sessionActive, false);
  assert.equal(expired.rfidState, 'stale');
  assert.equal(data.online, true, 'never mutates the stored snapshot');
});

test('missing, invalid and future heartbeats cannot create an online device', () => {
  for (const rfidUpdatedAt of ['', 'bad', new Date(Date.now() + 60000).toISOString()]) {
    assert.equal(applySensorPresence({ online: true, rfidUpdatedAt }).online, false);
  }
});
