import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const { acceptEnrollmentScan, isEnrollmentActive } = createRequire(import.meta.url)('./rfidEnrollment.ts');
const tag = '300833B2DDD9014000000001';
const initial = () => ({ id: 'scan', deviceId: 'reader', status: 'ready', count: 0, tag: '', lastScanId: -1, error: '', expiresAt: 200000 });
const proof = (holdMs, present = true) => ({ version: 2, holdMs, present });
test('one confirmed five-second hold verifies, shorter or legacy scans never verify', () => {
  let state = initial();
  for (let sequence = 1; sequence <= 3; sequence++) state = acceptEnrollmentScan(state, sequence, tag, [], undefined, 1000);
  assert.notEqual(state.status, 'verified');
  state = acceptEnrollmentScan(state, 4, tag, [], proof(4999), 1000);
  assert.equal(state.holdMs, 4999);
  assert.equal(state.status, 'holding');
  state = acceptEnrollmentScan(state, 5, tag, [], proof(5000), 1001);
  assert.equal(state.status, 'verified');
  assert.equal(state.count, 1);
  assert.equal(state.tag, tag);
  assert.deepEqual(acceptEnrollmentScan(state, 6, '', [], proof(0, false), 1002), state);
});
test('removal resets and delayed packets do not restore old progress', () => {
  let state = acceptEnrollmentScan(initial(), 1, tag, [], proof(3000), 1000);
  state = acceptEnrollmentScan(state, 2, '', [], proof(0, false), 1100);
  assert.equal(state.holdMs, 0);
  assert.equal(state.tag, '');
  assert.match(state.error, /5 seconds/);
  assert.deepEqual(acceptEnrollmentScan(state, 1, tag, [], proof(5000), 1200), state);
  state = acceptEnrollmentScan(state, 3, 'ABCD', [], proof(0), 1300);
  assert.equal(state.tag, 'ABCD');
  assert.equal(state.holdMs, 0);
});
test('registered tags identify their cat; expired, malformed and absent proofs fail closed', () => {
  assert.match(acceptEnrollmentScan(initial(), 1, tag, [{ tag, name: 'Zeno' }], proof(5000), 1000).error, /Zeno/);
  for (const invalid of [proof(5000, false), proof(-1), proof(6000), { version: 1, holdMs: 5000, present: true }]) {
    assert.notEqual(acceptEnrollmentScan(initial(), 1, tag, [], invalid, 1000).status, 'verified');
  }
  assert.deepEqual(acceptEnrollmentScan(initial(), 1, tag, [], proof(5000), 200001), initial());
  assert.equal(isEnrollmentActive({ ...initial(), status: 'holding' }, 1000), true);
});
