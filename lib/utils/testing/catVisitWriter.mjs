import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

function load(file, imports) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loadedModule, exports: loadedModule.exports, require: name => imports[name], Date, Buffer, process, console });
  return loadedModule.exports;
}

// Real production writer, with only network/SDK transport replaced for route integration tests.
export function loadVisitWriter(client, token, sync, ingestion, normalization) {
  const db = { doc: path => ({ path }), runTransaction: async callback => {
    const writes = []; let writing = false;
    const result = await callback({ get: async ref => {
      assert.equal(writing, false);
      let doc;
      if (ref.path === 'users/owner-a') doc = { data: {} };
      else if (ref.path === 'users/owner-a/deviceConfig/default') doc = { data: { configToken: token } };
      else if (ref.path.includes('/cats/')) doc = (await client.listDocuments('users/owner-a/cats')).find(row => ref.path.endsWith(`/${row.id}`));
      else doc = await client.getDocument(ref.path);
      return { exists: Boolean(doc), data: () => doc?.data };
    }, create: (ref, data) => { writing = true; writes.push(client.createSetWrite(ref.path, data, { exists: false })); },
    set: (ref, data) => { writing = true; const { visits, totalDurationSecs, ...fields } = data; writes.push(client.createIncrementWrite(ref.path, fields, { visits: visits.increment, totalDurationSecs: totalDurationSecs.increment })); },
    });
    if (writes.length) await client.commit(writes);
    return result;
  } };
  return load('../catVisitRecovery.ts', { 'node:crypto': crypto, 'firebase-admin/firestore': { FieldValue: { increment: value => ({ increment: value }) } }, '@/lib/configs/firebase-admin': { getAdminFirestore: () => db, getAdminAuth: () => ({ getUser: async () => ({ disabled: false }) }) }, './catHistoryNormalization': normalization, './catVisitIngestion': ingestion, './catHistoryStore': {}, './catCatalogSync': {}, './catHistoryBackfill': {}, './sensorSync': sync, './sessionDate': load('../sessionDate.ts', {}) });
}
