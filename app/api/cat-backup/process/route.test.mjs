import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

test('workerRejectsMissingOrWrongSecret and default disabled gate; only aggregates returned', async () => {
  const env = {}, loadedModule = { exports: {} }; let calls = 0, fails = false;
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loadedModule, exports: loadedModule.exports, require: name => name === 'node:crypto' ? crypto : { processCatHistoryRecovery: async () => { calls++; if (fails) throw new Error('private token'); return { restored: 1, duplicates: 0, conflicts: 0, cancelled: 0, retried: 0, repairedRows: 100 }; } }, process: { env }, Response, Buffer });
  const request = value => new Request('https://test/api/cat-backup/process', { method: 'POST', headers: { Authorization: `Bearer ${value}` } });
  assert.equal((await loadedModule.exports.POST(request('secret'))).status, 401);
  env.CAT_HISTORY_PROCESS_SECRET = 'secret';
  assert.equal((await loadedModule.exports.POST(request('wrong'))).status, 401);
  assert.equal((await loadedModule.exports.POST(request('secret'))).status, 200); assert.equal(calls, 0);
  env.CAT_HISTORY_RECOVERY_ENABLED = 'true';
  const response = await loadedModule.exports.POST(request('secret')); assert.equal((await response.json()).restored, 1); assert.equal(calls, 1);
  fails = true; const failure = await loadedModule.exports.POST(request('secret')); assert.equal(failure.status, 503); assert.equal((await failure.text()).includes('private token'), false);
});
