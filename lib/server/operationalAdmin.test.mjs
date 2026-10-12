import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../../', import.meta.url));
function fixture(options = {}) {
  const calls = [], cache = new Map();
  const store = async (url, init = {}) => {
    calls.push({ url, body: init.body && JSON.parse(init.body) });
    if (url.startsWith('operational_migration_state?')) return Response.json([{ imported_at:'2026-10-12T00:00:00Z',runtime_primary: options.ready !== false,cutover_at:'2026-10-12T00:00:00Z' }]);
    if (options.networkFailure) throw new Error('fetch failed');
    if (options.code) return Response.json({ code:options.code }, { status:options.httpStatus || 400 });
    if (options.badJson) return new Response('not json');
    if (url==='rpc/operational_admin_transition') return Response.json({ profile:{ email:'owner@example.com',deletionStatus:'pending',deletionRequestedAt:{__firestoreType:'timestamp',value:'2026-10-12T00:00:00Z'} },auditId:'audit-id' });
    if (url==='rpc/operational_write_audit') return Response.json('audit-id');
    throw new Error(`Unhandled ${url}`);
  };
  function load(file) {
    const full = path.join(root,file); assert.ok(existsSync(full),'Operational admin helper is required');
    if (cache.has(full)) return cache.get(full).exports;
    const loaded = { exports:{} }; cache.set(full,loaded);
    vm.runInNewContext(ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
      module:loaded,exports:loaded.exports,process,Response,require:name => name==='@/lib/utils/smsAccountSync' ? {smsStoreRequest:store} : name.startsWith('.') ? load(path.relative(root,path.resolve(path.dirname(full),`${name}.ts`))) : require(name)
    }); return loaded.exports;
  }
  return { helper:load('lib/server/operationalAdmin.ts'),calls };
}
const input = { userId:'owner',action:'request',actorUid:'owner',actorEmail:'owner@example.com',reason:'Leaving' };
test('transition passes verified identity to atomic RPC and decodes profile timestamps',async () => {
  const f = fixture(), result = await f.helper.operationalAdminTransition(input);
  assert.equal(result.profile.deletionStatus,'pending'); assert.equal(result.profile.deletionRequestedAt,'2026-10-12T00:00:00Z'); assert.equal(result.auditId,'audit-id');
  assert.equal(f.calls.length,2); assert.equal(f.calls[1].url,'rpc/operational_admin_transition'); assert.deepEqual(f.calls[1].body,{p_input:input});
});
test('unverified cutover prevents transition and audit RPC writes',async () => {
  const f = fixture({ready:false});
  await assert.rejects(f.helper.operationalAdminTransition(input),e=>e.status===503);
  await assert.rejects(f.helper.writeOperationalAudit({action:'admin_login',actorUid:'admin'}),e=>e.status===503);
  assert.ok(f.calls.every(c=>c.url.startsWith('operational_migration_state?')));
});
test('transition maps missing, conflicting, invalid and unavailable storage to API statuses',async () => {
  for (const [code,status] of [['P0002',404],['55000',409],['40001',409],['42501',403],['22023',400],['XX000',503]]) {
    const f = fixture({code}); await assert.rejects(f.helper.operationalAdminTransition(input),e=>e.status===status && e.code===code);
  }
  for (const options of [{networkFailure:true},{badJson:true}]) await assert.rejects(fixture(options).helper.operationalAdminTransition(input),e=>e.status===503);
});
test('standalone audit uses service RPC and returns persisted identifier',async () => {
  const f = fixture(); const audit = {action:'admin_granted',actorUid:'admin',targetEmail:'new@example.com',details:{result:'granted'}};
  assert.equal(await f.helper.writeOperationalAudit(audit),'audit-id'); assert.equal(f.calls[1].url,'rpc/operational_write_audit'); assert.deepEqual(f.calls[1].body,{p_input:audit});
});
