import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportValue, manifestDigest, mergeVisitBackups, mapSourceRecords, validateManifest } from '../lib/utils/operationalImport.mjs';
import { photoFields } from '../lib/utils/operationalPhotoFields.mjs';

export async function exportFirestore(db, onProgress = () => {}, onVerifiedSource = async () => {}) {
  let records = [];
  const lanes = Array.from({ length: 8 }, () => Promise.resolve());
  let nextLane = 0, pass = 0;
  const read = operation => {
    const slot = nextLane++ % lanes.length, result = lanes[slot].then(operation);
    lanes[slot] = result.catch(() => {});
    return result;
  };
  async function visit(ref) {
    const snap = await read(() => ref.get());
    if (snap.exists) {
      const data = exportValue(snap.data());
      records.push({ document_path: ref.path, data, source_update_at: snap.updateTime.toDate().toISOString() });
      if (records.length > 5000) throw new Error('Export exceeds the atomic import limit');
      if (records.length % 100 === 0) onProgress({ pass, records: records.length, complete: false });
    }
    for (const collection of await read(() => ref.listCollections())) await Promise.all((await read(() => collection.listDocuments())).map(visit));
  }
  async function scan() {
    records = [];
    pass++;
    const roots = await read(() => db.listCollections());
    if (roots.some(root => !['users', 'deviceConfigs', 'cameraDevices', 'admins', 'deleteRequests', 'deviceState', 'predictiveHealthLimits'].includes(root.id))) throw new Error('Unmapped root collection; inventory before exporting');
    for (const root of roots) await Promise.all((await read(() => root.listDocuments())).map(visit));
    onProgress({ pass, records: records.length, complete: true });
    return manifestDigest(records);
  }
  const firstDigest = await scan();
  if (firstDigest !== await scan()) throw new Error('Source changed during export; pause writers before retrying');
  await onVerifiedSource({ version: 1, sourceVerified: true, exportedAt: new Date().toISOString(), digest: firstDigest, sourceRecords: structuredClone(records) });
  records = mapSourceRecords(records);
  const manifest = { version: 1, complete: true, exportedAt: new Date().toISOString(), records, digest: manifestDigest(records) };
  validateManifest(manifest);
  return manifest;
}
export async function importManifest(manifest, apply, request) {
  if (manifest.records?.some(row => photoFields(row.data).some(({ target, key }) => typeof target[key] === 'string' && target[key].startsWith('supabase://littersense-media/'))) && manifest.mediaCopy?.verified !== true) throw new Error('Photo copy must be applied and verified before importing photo pointers');
  const summary = validateManifest(manifest);
  const response = await request('rpc/operational_import', { method: 'POST', body: JSON.stringify({ p_records: manifest.records, p_apply: apply }) });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const error = new Error(`Import storage returned HTTP ${response.status}; no overwrite performed`);
    error.report = { ...summary, applied: false, status: response.status, code: /^[A-Z0-9]{5}$/.test(failure.code ?? '') ? failure.code : 'unknown', conflicts: failure.code === '23505' ? 'detected; transaction aborted' : 'not evaluated' };
    throw error;
  }
  const result = await response.json();
  return { ...summary, ...result, mode: apply ? 'apply' : 'dry-run' };
}
export async function readVisitBackups(request) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const response = await request(`cat_visit_backups?select=owner_id,session_id,cat_id,data,digest,token_hash,state,conflict_detected,backed_up_at&order=owner_id.asc,session_id.asc&limit=500&offset=${offset}`);
    if (!response.ok) throw new Error('Cannot read existing Supabase visits');
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('Invalid visit backup response');
    rows.push(...page);
    if (rows.length > 5000) throw new Error('Visit backup exceeds atomic import limit');
    if (page.length < 500) return rows;
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || !['--export', '--dry-run', '--apply'].includes(args[0]) || args.length > 2) throw new Error('Usage: node --env-file=.env.local scripts/operational-import.mjs --export|--dry-run|--apply <private-export.json>');
  const file = resolve(args[1]);
  if (args[0] === '--export') {
    const { cert, getApps, initializeApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!encoded) throw new Error('Firebase server configuration missing');
    const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))) });
    const source = getFirestore(app);
    // Local gRPC stalled while the same authenticated REST read succeeded.
    // This affects only export transport; document/type/ownership checks stay identical.
    source.settings({ preferRest: true });
    const { smsStoreRequest } = await import('../lib/utils/smsAccountSync.ts');
    const { buildVisitBackup } = await import('../lib/utils/catHistoryNormalization.ts');
    const firstBackups = await readVisitBackups(smsStoreRequest);
    let manifest = await exportFirestore(source, progress => console.log(JSON.stringify({ mode: 'source-scan', ...progress })), checkpoint => writeFile(`${file}.source.json`, JSON.stringify(checkpoint), { flag: 'wx', mode: 0o600 }));
    const finalBackups = await readVisitBackups(smsStoreRequest);
    if (JSON.stringify(firstBackups) !== JSON.stringify(finalBackups)) throw new Error('Visit backups changed; pause writers before export');
    manifest = mergeVisitBackups(manifest, finalBackups, buildVisitBackup);
    await writeFile(file, JSON.stringify(manifest), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ mode: 'export', ...validateManifest(manifest), digest: manifest.digest, visitBackupSummary: manifest.visitBackupSummary }));
  } else {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    // Reuse the existing server-only Supabase transport, not a separate client or credential setup.
    const { smsStoreRequest } = await import('../lib/utils/smsAccountSync.ts');
    console.log(JSON.stringify(await importManifest(manifest, args[0] === '--apply', smsStoreRequest)));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  if (error.report) console.error(JSON.stringify(error.report));
  console.error(JSON.stringify({ sourceChanged: /changed during|backups changed/.test(error.message), duplicateTokens: /Ambiguous push/.test(error.message), orphanOwner: /no profile/.test(error.message), orphanCat: /matching profile/.test(error.message), cameraOwnership: /Camera pairing/.test(error.message), legacyOwnership: /snapshot ownership/.test(error.message), code: typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : null }));
  console.error('Migration stopped. Export/read, validation, or storage failed; no source data was deleted. Check configuration, quota and the private export.'); process.exitCode = 1;
});
