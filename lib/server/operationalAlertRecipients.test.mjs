import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('canonical recipients are repaired before claim filters; failed owners are never claimed', async () => {
  const calls = [], ready = new Set(), exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/server/operationalAlertRecipients.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: { exports }, exports, console: { warn() {} }, require: name => name.includes('operationalRecords') ? { projectOperationalAccount: async uid => { calls.push(`project:${uid}`); if (uid === 'unavailable') throw new Error('Outage'); ready.add(uid); } } : { smsStoreRequest: async (path, init = {}) => {
      calls.push(path);
      if (path.startsWith('sms_outbox?')) return Response.json([{ owner_id: 'unavailable' }, { owner_id: 'stale-mirror' }]);
      const body = JSON.parse(init.body); assert.equal(body.p_owner_id, 'stale-mirror'); assert.ok(ready.has(body.p_owner_id));
      return Response.json([{ id: 'alert', owner_id: body.p_owner_id }]);
    } },
  });
  for (const channel of ['sms', 'push']) {
    ready.clear(); calls.length = 0;
    assert.equal((await exports.claimOperationalAlerts(channel)).length, 1);
    assert.ok(calls.indexOf('project:stale-mirror') < calls.indexOf(`rpc/claim_${channel}_outbox`));
  }
});
