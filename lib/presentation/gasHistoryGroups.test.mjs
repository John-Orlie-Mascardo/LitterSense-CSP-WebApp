import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const loaded = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./gasHistoryGroups.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: loaded, exports: loaded.exports });
const { groupGasReadings } = loaded.exports;

const reading = (id, minute, urine = 1, stool = 1, capturedAt = `2026-11-09T12:${String(minute).padStart(2, '0')}:00Z`) =>
  ({ id, capturedAt, receivedAt: capturedAt ?? '2026-11-09T12:59:00Z', mq135Raw: urine, mq136Raw: stool });

test('consecutive readings with the same urine and stool status become one row', () => {
  const rows = groupGasReadings([reading('a', 17), reading('b', 16), reading('c', 15)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 3);
  assert.equal(rows[0].newest.id, 'a');
  assert.equal(rows[0].oldest.id, 'c');
  assert.equal(rows[0].urineDetected, false);
  assert.equal(rows[0].stoolDetected, false);
});

test('a status change starts a new row, so detections stand out', () => {
  const rows = groupGasReadings([
    reading('clear-1', 23), reading('clear-2', 22),
    reading('urine-1', 20, 0, 1), reading('urine-2', 19, 0, 1),
    reading('both', 18, 0, 0),
    reading('clear-3', 17),
  ]);
  assert.equal(rows.map((row) => row.count).join(','), '2,2,1,1');
  assert.equal(rows[1].urineDetected, true);
  assert.equal(rows[1].stoolDetected, false);
  assert.equal(rows[2].stoolDetected, true);
});

test('the same status separated by a different one stays as separate rows', () => {
  const rows = groupGasReadings([reading('a', 10), reading('b', 9, 0, 1), reading('c', 8)]);
  assert.equal(rows.length, 3);
});

test('each row keeps a stable key and no readings are lost', () => {
  const input = [reading('a', 5), reading('b', 4, 0, 0), reading('c', 3, 0, 0), reading('d', 2)];
  const rows = groupGasReadings(input);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), input.length);
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
});

test('an empty list gives no rows', () => {
  assert.equal(groupGasReadings([]).length, 0);
});
