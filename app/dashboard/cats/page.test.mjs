import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('My Cats form blocks saving without a scanned tag and retains duplicate-tag validation', () => {
  const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const validateForm =');
  const end = source.indexOf('const handleSave =', start);
  assert.ok(start >= 0 && end > start);
  const formData = { name: 'New cat', breed: 'Puspin', gender: 'male', dob: '2025-01', rfidTag: '' };
  const sandbox = { formData, cats: [{ id: 'existing', name: 'Existing cat' }], contextCatDetails: { existing: { rfidTag: 'AABB' } }, setErrors: errors => { sandbox.errors = errors; } };
  vm.runInNewContext(ts.transpileModule(`${source.slice(start, end)}; globalThis.validate = validateForm;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  assert.equal(sandbox.validate(), false); assert.match(sandbox.errors.rfidTag, /Scan and verify/);
  formData.rfidTag = 'aabb'; assert.equal(sandbox.validate(), false); assert.match(sandbox.errors.rfidTag, /Existing cat/);
  formData.rfidTag = 'CCDD'; assert.equal(sandbox.validate(), true);
});
