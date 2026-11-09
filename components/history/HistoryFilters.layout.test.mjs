import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./HistoryFilters.tsx', import.meta.url), 'utf8');

test('the desktop filter box scrolls on its own, within the screen height', () => {
  assert.match(source, /max-h-\[calc\(100vh-6rem\)\] overflow-y-auto overscroll-contain/);
});

test('Reset and Apply filters stay pinned at the bottom of the filter box', () => {
  assert.match(source, /sticky bottom-0 grid grid-cols-2 gap-2/);
});
