import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = new URL('../../', import.meta.url);
function load(file, { failMedia = false, denied = false, transitionStatus = 0 } = {}) {
  const operations = [];
  class OperationalError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const userRef = { listCollections: async () => [], delete: async () => operations.push('legacy-profile') };
  const db = { doc: path => path.startsWith('users/') ? userRef : { delete: async () => {} }, collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }) };
  const modules = {
    'next/server': { NextResponse: Response },
    'firebase-admin/firestore': { FieldValue: {} },
    '@/lib/server/operationalStore': { rfidPrimaryEnabled: () => true, OperationalError },
    '@/lib/server/operationalAdmin': { operationalAdminTransition: async input => { operations.push(input.action); if (transitionStatus && input.action === 'start') throw new OperationalError('Not actionable', transitionStatus); return { profile: { email: 'owner@example.test' }, auditId: 'audit' }; } },
    '@/lib/server/operationalDeletion': { deleteOwnerMedia: async () => { operations.push('media'); if (failMedia) throw Error('Unavailable'); } },
    '@/lib/server/adminAuth': { authorizeAdminRequest: async () => denied ? { ok: false, response: Response.json({}, { status: 403 }) } : { ok: true, admin: { uid: 'admin', email: 'admin@example.test' } } },
    '@/lib/server/ownerAuth': { authorizeOwnerRequest: async () => ({ ok: true, owner: { uid: 'owner', email: 'owner@example.test' } }) },
    '@/lib/server/auditLog': { writeAuditLog: async () => {}, buildAuditLogRecord: value => value },
    '@/lib/configs/firebase-admin': { getAdminFirestore: () => db, getAdminAuth: () => ({ revokeRefreshTokens: async () => operations.push('revoke'), deleteUser: async () => operations.push('auth') }), getAdminStorageBucket: () => ({ deleteFiles: async () => operations.push('legacy-media') }) },
    '@/lib/utils/smsAccountSync': {},
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, root),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => { if (!(name in modules)) throw Error('Unknown import '+name); return modules[name]; }, Response, Request, console: { error() {} }, process: { env: {} } });
  const request = body => new Request('https://example.test/api', { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { operations, route: exports, request };
}
test('primary owner requests and admin rejection use canonical state transitions', async () => {
  for (const [file, action, body] of [['app/api/account/deletion-request/route.ts','request',{ reason:'Privacy' }],['app/api/admin/deletion-request/reject/route.ts','reject',{ userId:'owner' }]]) {
    const f = load(file); const response = await f.route.POST(f.request(body)); assert.equal(response.status,200); assert.deepEqual(f.operations,[action]);
  }
});
test('primary approval revokes sessions and cleans both stores before Auth and final audit', async () => {
  const f = load('app/api/admin/delete-user/route.ts'); const response = await f.route.POST(f.request({ userId:'owner' }));
  assert.equal(response.status,200); assert.deepEqual(f.operations,['start','revoke','media','legacy-media','legacy-profile','auth','finish']);
});
test('primary cleanup failure records failed state and never removes Auth', async () => {
  const f = load('app/api/admin/delete-user/route.ts',{ failMedia:true }); const response = await f.route.POST(f.request({ userId:'owner' }));
  assert.equal(response.status,500); assert.deepEqual(f.operations,['start','revoke','media','fail']);
});
test('already processing requests and unauthorized actors cannot run destructive cleanup', async () => {
  const duplicate = load('app/api/admin/delete-user/route.ts',{ transitionStatus:409 }); assert.equal((await duplicate.route.POST(duplicate.request({ userId:'owner' }))).status,409); assert.deepEqual(duplicate.operations,['start']);
  const denied = load('app/api/admin/delete-user/route.ts',{ denied:true }); assert.equal((await denied.route.POST(denied.request({ userId:'owner' }))).status,403); assert.deepEqual(denied.operations,[]);
});
