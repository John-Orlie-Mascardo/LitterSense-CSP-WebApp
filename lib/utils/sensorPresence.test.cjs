const test = require('node:test');
const assert = require('node:assert/strict');
const { applySensorPresence, GAS_SENSOR_DISPLAY_TIMEOUT_MS } = require('./sensorPresence.ts');
const { GAS_ULTRASONIC_STALE_AFTER_MS } = require('./gasUltrasonic.ts');

test('gas UI and server agree on the freshness window', () => {
  assert.equal(GAS_SENSOR_DISPLAY_TIMEOUT_MS, GAS_ULTRASONIC_STALE_AFTER_MS);
});

test('gas stays active across normal upload gaps while RFID expires independently', () => {
  const now = Date.parse('2026-10-09T08:00:00Z');
  const data = { online: true, gasUltrasonicOnline: true, sessionActive: true, rfidState: 'online', gasUltrasonicState: 'online', rfidUpdatedAt: new Date(now).toISOString(), gasUltrasonicUpdatedAt: new Date(now - 5000).toISOString(), mq135Raw: 0 };
  assert.equal(applySensorPresence(data, now + 10000).gasUltrasonicOnline, true);
  const gasActive = applySensorPresence(data, now + 94000);
  assert.equal(gasActive.online, false);
  assert.equal(gasActive.gasUltrasonicOnline, true);
  assert.equal(gasActive.gasUltrasonicState, 'online');
  assert.equal(gasActive.mq135Raw, 0);
  assert.equal(applySensorPresence(data, now + 15000).online, true);
  const expired = applySensorPresence(data, now + 15001);
  assert.equal(expired.online, false);
  assert.equal(expired.sessionActive, true, 'heartbeat freshness cannot erase the last reported entry');
  assert.equal(expired.rfidState, 'stale');
  assert.equal(expired.gasUltrasonicOnline, true);
  assert.equal(applySensorPresence(data, now + 115000).gasUltrasonicOnline, true);
  assert.equal(applySensorPresence(data, now + 115001).gasUltrasonicOnline, false);
  assert.equal(data.online, true, 'never mutates the stored snapshot');
});

test('a confirmed RFID exit clears activity without depending on reader presence', () => {
  const receipt = '2026-10-09T08:00:00Z';
  const active = { online: true, sessionActive: true, rfidUpdatedAt: receipt };
  assert.equal(applySensorPresence(active, Date.parse(receipt) + 90001).sessionActive, true);
  assert.equal(applySensorPresence({ ...active, sessionActive: false }, Date.parse(receipt) + 90001).sessionActive, false);
});

test('missing, invalid and future heartbeats cannot create an online device', () => {
  for (const rfidUpdatedAt of ['', 'bad', new Date(Date.now() + 60000).toISOString()]) {
    assert.equal(applySensorPresence({ online: true, rfidUpdatedAt }).online, false);
    assert.equal(applySensorPresence({ online: false, gasUltrasonicOnline: true, gasUltrasonicUpdatedAt: rfidUpdatedAt }).gasUltrasonicOnline, false);
  }
});
