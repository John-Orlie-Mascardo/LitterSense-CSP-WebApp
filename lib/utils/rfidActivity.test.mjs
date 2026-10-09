import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { buildRfidActivityVisits, mergeRfidActivityVisits } = createRequire(import.meta.url)('./rfidActivity.ts');
const build = sensor => buildRfidActivityVisits(sensor, [cat], () => ({ rfidTag: 'A123' })).map(visit => visit.session);
const merge = (stored, live) => mergeRfidActivityVisits(stored, () => cat, live.map(session => ({ cat, session }))).map(visit => visit.session);

const cat = { id: 'cat-a', name: 'Zeno' };
const receipt = Date.parse('2026-10-09T08:00:30Z');
const active = { online: true, sessionActive: true, activeRfidHex: 'A123', activeRfidCard: '', rfidHex: 'A123', rfidCard: '', activeSessionStartMs: receipt - 30_000, activeSessionDurationMs: 30_000, rfidUpdatedAt: new Date(receipt).toISOString() };
const row = overrides => ({ id: 'stored', catId: cat.id, date: '2026-10-09', time: '', durationSecs: 10, mq135Delta: 0, mq136Delta: 0, anomaly: false, anomalyType: null, ...overrides });

test('uptime entry timestamps are projected into the receipt date with a stable identity', () => {
  const first = build({ ...active, activeSessionStartMs: 123_456 })[0];
  assert.equal(first.startedAt, new Date(receipt - 30_000).toISOString());
  const next = build({ ...active, activeSessionStartMs: 123_456, rfidUpdatedAt: new Date(receipt + 10_000).toISOString(), activeSessionDurationMs: 40_000 })[0];
  assert.equal(next.id, first.id);
  assert.equal(next.startedAt, first.startedAt);
});

test('daily summaries and earlier incomplete rows cannot hide the current entry', () => {
  const live = build(active);
  for (const stored of [row({ sessionStatus: 'DAILY_SUMMARY' }), row({ sessionStatus: 'NORMAL' })]) {
    assert.equal(merge([stored], live).length, 2);
  }
});

test('a recently finished visit does not suppress a new entry for the same cat', () => {
  const live = build(active);
  const previous = row({ startedAt: new Date(receipt - 35_000).toISOString(), endedAt: new Date(receipt - 31_000).toISOString(), sessionStatus: 'SHORT_SESSION' });
  assert.equal(merge([previous], live).length, 2);
});

test('reported exit is displayed immediately while stored history is pending and deduplicates on arrival', () => {
  const sensor = { ...active, sessionActive: false, activeSessionStartMs: null, lastSessionStatus: 'NORMAL', lastSessionEndMs: receipt, lastSessionDurationMs: 30_000 };
  const projected = build(sensor);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].endedAt, new Date(receipt).toISOString());
  assert.equal(projected[0].sessionStatus, 'NORMAL');
  const stored = row({ ...projected[0], id: 'confirmed-record' });
  assert.equal(merge([stored], projected).length, 1);
  assert.equal(merge([stored], projected)[0].id, stored.id);
});

test('timeouts remain unconfirmed and a following entry retains the previous exit', () => {
  const projected = build({ ...active, lastSessionStatus: 'NO_EXIT_TIMEOUT', lastSessionEndMs: receipt - 60_000, lastSessionDurationMs: 20_000 });
  assert.equal(projected.length, 2);
  assert.equal(projected.find(session => session.endedAt)?.sessionStatus, 'NO_EXIT_TIMEOUT');
});

test('a stale connection preserves the confirmed entry and marks its live status as pending', () => {
  const visits = buildRfidActivityVisits({ ...active, online: false }, [cat], () => ({ rfidTag: 'A123' }));
  assert.equal(visits.length, 1);
  assert.equal(visits[0].session.startedAt, new Date(receipt - 30_000).toISOString());
  assert.equal(visits[0].liveUpdatePending, true);
  assert.equal(buildRfidActivityVisits(null, [cat], () => ({ rfidTag: 'A123' })).length, 0);
});

test('same visit matches stored precision but distinct cat and exit evidence remain separate', () => {
  const projected = build({ ...active, sessionActive: false, lastSessionStatus: 'NORMAL', lastSessionEndMs: receipt, lastSessionDurationMs: 30_000 });
  const near = row({ ...projected[0], id: 'stored', startedAt: new Date(receipt - 30_500).toISOString(), endedAt: new Date(receipt - 500).toISOString() });
  assert.equal(merge([near], projected).length, 1);
  assert.equal(merge([{ ...near, endedAt: new Date(receipt - 5000).toISOString() }], projected).length, 2);
  assert.equal(merge([{ ...near, catId: 'other-cat' }], projected).length, 2);
});
