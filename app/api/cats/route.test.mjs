import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(imports) {
  imports = { '@/lib/server/operationalStore': { rfidPrimaryEnabled: () => false }, '@/lib/server/operationalCats': {}, '@/lib/server/operationalRfid': {}, ...imports };
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports, require: name => imports[name], Response });
  return loaded.exports;
}
test('callerCannotChooseOwner; unavailable primary rejects edits and pending mirror keeps a confirmed save', async () => {
  let unavailable = false, backupPending = false;
  const calls = [];
  const route = load({
    '@/lib/configs/firebase-admin': { getAdminAuth: () => ({ verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); if (token !== 'good') throw new Error(); return { uid: 'owner-a' }; } }) },
    '@/lib/utils/catCatalogSync': {
      captureCatalog: async owner => { calls.push(owner); if (unavailable) throw new Error(); return { complete: true, profiles: [], revision: 1, sourceReadAt: '2026-10-04T00:00:00Z' }; },
      validateCatMutation: body => { if (body.ownerId || !body.catId || !['create', 'update', 'delete'].includes(body.action)) throw new Error('Invalid mutation'); return body; },
      mutateCatProfile: async (owner, body) => { calls.push({ owner, body }); if (unavailable) throw new Error(); return { revision: 1, backupPending }; },
    },
    '@/lib/utils/catHistoryStore': { saveCatalogBackup: async () => {} },
    '@/lib/utils/catHistoryReads': { readCatCatalog: async owner => { calls.push(`read:${owner}`); return unavailable ? { catalog: { complete: false, revision: 0, profiles: [], sourceReadAt: '' }, source: 'supabase', backupPending: true } : { catalog: { complete: true, revision: 1, profiles: [], sourceReadAt: '2026-10-04T00:00:00Z' }, source: 'firebase', backupPending }; } },
  });
  const request = (token, body) => new Request('https://test/api/cats', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const mutation = { action: 'create', catId: 'cat-a', cat: { name: 'Cat' } };
  assert.equal((await route.POST(request('bad', mutation))).status, 401);
  assert.equal((await route.POST(request('good', { ...mutation, ownerId: 'owner-b' }))).status, 400);
  assert.equal(calls.length, 0);
  backupPending = true;
  const response = await route.POST(request('good', mutation));
  assert.equal(response.status, 200); assert.equal((await response.json()).backupPending, true);
  assert.equal(calls[0].owner, 'owner-a');
  unavailable = true;
  const failed = await route.POST(request('good', mutation));
  assert.equal(failed.status, 503); assert.equal((await failed.json()).saved, undefined);
  const fallback = await route.GET(new Request('https://test/api/cats', { headers: { Authorization: 'Bearer good' } }));
  assert.equal(fallback.status, 200); assert.equal((await fallback.json()).complete, false);
  assert.ok(calls.includes('read:owner-a'));
});
test('only four client profile mutations switch to confirmed requests; photo cleanup remains after deletion', () => {
  const source = readFileSync(new URL('../../../lib/contexts/CatContext.tsx', import.meta.url), 'utf8');
  const mutations = source.slice(source.indexOf('  const addCat ='), source.indexOf('  const addHealthLog ='));
  assert.equal(/await (setDoc|updateDoc|deleteDoc)\(/.test(mutations), false);
  assert.match(mutations, /await deleteCatPhoto\(user.uid, id\)/);
  assert.match(source, /fetch\("\/api\/cats"/);
  assert.match(source, /Authorization: `Bearer \$\{await user.getIdToken\(\)\}`/);
  assert.match(source, /backupPending/);
  assert.ok(mutations.indexOf('await saveProfile') < mutations.indexOf('await deleteCatPhoto'));
});

test('real client profile methods require confirmed responses, show pending backup and preserve photos on rejected deletion', async () => {
  let mode = 'success';
  const calls = [], photoDeletes = [], stateChanges = [], applied = [];
  const react = { createContext: () => ({ Provider: 'provider' }), useEffect: () => {}, useMemo: fn => fn(), useCallback: fn => fn, useRef: initial => ({ current: initial }), useState: initial => [initial, value => stateChanges.push(value)], createElement: (type, props) => ({ type, props }) };
  const loaded = { exports: {} };
  const imports = {
    react: { default: react, ...react },
    'next/navigation': { usePathname: () => '/dashboard/cats' },
    'firebase/firestore': { setDoc: () => { throw new Error('Client profile writes forbidden'); } },
    '@/lib/configs/firebase': { db: {} },
    '@/lib/contexts/AuthContext': { useAuth: () => ({ user: { uid: 'owner-a', getIdToken: async () => 'good' }, loading: false }) },
    '@/lib/hooks/useCatBackup': { useCatBackup: () => ({ snapshot: null, error: null, refresh: () => {}, applyProfile: (mutation, revision) => applied.push({ mutation, revision }) }) },
    '@/lib/utils/catPhoto': { deleteCatPhoto: async (...args) => photoDeletes.push(args) },
    '@/lib/utils/sessionDate': { getLocalDateKey: () => '2026-10-04' },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../../lib/contexts/CatContext.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, { module: loaded, exports: loaded.exports, require: name => imports[name] ?? {}, Date, fetch: async (url, init) => {
    calls.push({ url, ...init });
    if (mode === 'network') throw new Error('Connection lost');
    return { ok: mode !== 'unavailable', status: mode === 'unavailable' ? 503 : 200, json: async () => mode === 'unavailable' ? { error: 'Database unavailable' } : { saved: true, revision: 2, backupPending: mode === 'pending' } };
  } });
  const context = loaded.exports.CatProvider({ children: null }).props.value;
  await context.addCat({ id: 'cat-a', name: 'Cat', status: 'normal', avatar: null, isOnline: false });
  assert.equal(calls[0].headers.Authorization, 'Bearer good');
  assert.equal(JSON.parse(calls[0].body).catId, 'cat-a');
  assert.equal(applied[0].mutation.action, 'create'); assert.equal(applied[0].revision, 2);
  mode = 'pending'; await context.updateDetails('cat-a', { breed: 'Mixed' });
  assert.ok(stateChanges.includes('owner-a'));
  mode = 'unavailable';
  await assert.rejects(context.removeCat('cat-a'), { name: 'CatProfileSaveError' });
  assert.equal(photoDeletes.length, 0);
  mode = 'network';
  await assert.rejects(context.updateCat('cat-a', { name: 'Updated' }), { name: 'CatProfileSaveError' });
  assert.equal(applied.length, 2, 'Failed saves must never add or modify visible cats');
  mode = 'success'; await context.removeCat('cat-a');
  assert.equal(JSON.parse(calls.at(-1).body).today, '2026-10-04');
  assert.deepEqual(photoDeletes, [['owner-a', 'cat-a']]);
});
