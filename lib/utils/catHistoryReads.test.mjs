import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

function fixture() {
  const source = readFileSync(new URL('./catHistoryReads.ts', import.meta.url), 'utf8');
  const rows = new Map(), backups = new Map(), cats = new Map([['owner-a', [{ catId: 'cat-a', cat: { name: 'Cat' }, details: {} }]], ['owner-b', []]]);
  let primaryFailure = null, backupFailure = false, catalogComplete = true;
  const normalized = (id, data, state = 'primary_saved') => ({ sessionId: id, catId: data.catId, data, digest: crypto.createHash('sha256').update(JSON.stringify([data.catId, data.durationSecs, data.startedAt ?? '', data.endedAt ?? '', data.date, data.sessionStatus ?? '', data.mq135Delta ?? 0, data.mq136Delta ?? 0])).digest('hex'), tokenHash: null, state });
  const db = { collection: path => ({ path, orderBy() { return this; }, where() { return this; }, startAfter(...args) { this.after = args; return this; }, limit(n) { this.count = n; return this; }, async get() { if (primaryFailure) throw Object.assign(new Error('Private failure'), { code: primaryFailure }); const owner = path.split('/')[1], ordered = [...(rows.get(owner)?.entries() ?? [])].map(([id, data]) => ({ id, data: () => data })).sort((a,b) => (a.data().date + a.id).localeCompare(b.data().date + b.id)); const visible = ordered.filter(row => !this.after || row.data().date + row.id > this.after[0] + this.after[1]); return { docs: visible.slice(0, this.count) }; } }), doc: path => ({ get: async () => { if (primaryFailure) throw Object.assign(new Error('Private failure'), { code: primaryFailure }); const [,owner,,id] = path.split('/'); const data = rows.get(owner)?.get(id); return { exists: Boolean(data), data: () => data }; } }) };
  const catalog = owner => ({ revision: 1, profiles: cats.get(owner) ?? [], sourceReadAt: '2026-10-04T00:00:00Z', complete: catalogComplete });
  const imports = {
    'node:crypto': crypto,
    'firebase-admin/firestore': { FieldPath: { documentId: () => '__name__' } },
    '@/lib/configs/firebase-admin': { getAdminFirestore: () => db },
    './catCatalogSync': { captureCatalog: async owner => { if (primaryFailure) throw Object.assign(new Error('Primary unavailable'), { code: primaryFailure }); return catalog(owner); } },
    './catHistoryStore': { saveCatalogBackup: async () => {}, readCatalogBackup: async owner => { if (backupFailure) throw new Error('Backup unavailable'); return catalog(owner); }, readVisitBackups: async (owner, query) => { if (backupFailure) throw new Error('Backup unavailable'); const all = [...(backups.get(owner)?.values() ?? [])].filter(row => row.state !== 'cancelled' && row.state !== 'conflict' && row.data.date >= query.startDate && row.data.date <= query.endDate && (!query.catId || row.catId === query.catId)).sort((a,b) => (a.data.date+a.sessionId).localeCompare(b.data.date+b.sessionId)); let after = null; if (query.cursor) { const parsed = JSON.parse(query.cursor); assert.equal(parsed.owner, owner); after = parsed.date + parsed.id; } const visible = all.filter(row => !after || (query.sort === 'asc' ? row.data.date+row.sessionId > after : row.data.date+row.sessionId < after)); if (query.sort === 'desc') visible.reverse(); return { rows: visible.slice(0, query.limit), nextCursor: visible.length > query.limit ? 'more' : null, source: 'supabase', complete: catalogComplete, backedUpAt: '2026-10-04T00:00:00Z', pendingCount: all.filter(row => row.state === 'pending').length }; } },
    './catHistoryNormalization': { buildVisitBackup: normalized, validateBackupDate: value => { if (!/^2026-10-\d\d$/.test(value)) throw new Error('Invalid date'); }, validateBackupId: value => { if (!value || value.includes('/')) throw new Error('Invalid ID'); } },
    './catVisitRecovery': { primaryVisitFailureStatus: error => error.code === 8 ? 429 : error.code === 14 ? 503 : error.code === 7 ? 403 : null },
    './sessionDate': {},
    './sessionNormalization': { normalizeSessionDocument: (id, data) => ({ id, ...data }) },
    '@/lib/presentation/sessionHistory': { filterAndSortHistorySessions: (sessions, filters, catIds) => sessions.filter(row => row.date >= filters.startDate && row.date <= filters.endDate && (filters.catId === 'all' || filters.catId === 'unattributed' ? filters.catId !== 'unattributed' || !catIds.has(row.catId) : row.catId === filters.catId)) },
    '@/lib/presentation/behaviorStates': { BEHAVIOR_STATES: [{ id: 'normal' }, { id: 'insufficient' }] },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require: name => { if (!(name in imports)) throw new Error(name); return imports[name]; }, Buffer, Date, console });
  const query = { startDate: '2026-10-01', endDate: '2026-10-31', sort: 'asc', states: ['normal', 'insufficient'], limit: 20, catId: 'all' };
  const row = (id, day = '2026-10-04') => normalized(id, { catId: 'cat-a', date: day, durationSecs: 32, startedAt: `${day}T08:00:00Z`, endedAt: `${day}T08:00:32Z`, sessionStatus: 'NORMAL' });
  return { ...loaded.exports, rows, backups, query, row, setPrimary: value => { primaryFailure = value; }, setBackup: value => { backupFailure = value; }, setComplete: value => { catalogComplete = value; } };
}

test('sameSessionInBothStoresShowsAndCountsOnce; pendingRowsRemainVisibleAfterPrimaryRecovers', async () => {
  const f = fixture(); f.rows.set('owner-a', new Map([['same', f.row('same').data]])); f.backups.set('owner-a', new Map([['same', f.row('same')], ['pending', { ...f.row('pending'), state: 'pending' }]]));
  const page = await f.readCatHistory('owner-a', f.query);
  assert.deepEqual(Array.from(page.rows, row => row.sessionId), ['pending', 'same']);
  assert.equal(page.rows.filter(row => row.sessionId === 'same').length, 1);
  f.rows.get('owner-a').set('pending', f.row('pending').data);
  assert.equal((await f.readCatHistory('owner-a', f.query)).rows.filter(row => row.sessionId === 'pending').length, 1);
});

test('sourceChangeRestartsCursorSafely; accountSwitchCannotLeakRows', async () => {
  const f = fixture(); for (let i=0;i<23;i++) f.rows.set('owner-a', new Map([...(f.rows.get('owner-a') ?? []), [`s${String(i).padStart(2,'0')}`, f.row(`s${i}`).data]]));
  const first = await f.readCatHistory('owner-a', f.query); assert.equal(first.rows.length, 20); assert.ok(first.nextCursor);
  f.setPrimary(8); await assert.rejects(f.readCatHistory('owner-a', { ...f.query, cursor: first.nextCursor }), error => error.status === 409 && error.resetRequired);
  await assert.rejects(f.readCatHistory('owner-b', { ...f.query, cursor: first.nextCursor }), error => error.status === 403);
  const other = await f.readCatHistory('owner-b', f.query); assert.equal(other.rows.length, 0);
});

test('incompleteBackupIsNotEmptyHistory; bothStoresUnavailableIsCloudError; permission errors stay closed', async () => {
  const f = fixture(); f.setPrimary(8); f.setComplete(false);
  const catalog = await f.readCatCatalog('owner-a'); assert.equal(catalog.catalog.complete, false); assert.equal(catalog.source, 'supabase');
  const page = await f.readCatHistory('owner-a', f.query); assert.equal(page.complete, false);
  f.setBackup(true); await assert.rejects(f.readCatHistory('owner-a', f.query));
  f.setBackup(false); f.setPrimary(7); await assert.rejects(f.readCatCatalog('owner-a')); await assert.rejects(f.readCatHistory('owner-a', f.query));
});

test('a completed copy cannot claim outage history is complete after a later mirror failure', async () => {
  const f = fixture(); f.setPrimary(8);
  const page = await f.readCatHistory('owner-a', f.query);
  assert.equal(page.source, 'supabase');
  assert.equal(page.complete, false);
});

test('backup-only duplicate pages advance until a later pending visit is visible', async () => {
  const f = fixture();
  const many = new Map();
  for (let index = 0; index < 205; index++) {
    const id = `saved-${String(index).padStart(3, '0')}`;
    many.set(id, f.row(id));
  }
  many.set('z-pending', { ...f.row('z-pending'), state: 'pending' });
  f.backups.set('owner-a', many);
  const page = await f.readCatHistory('owner-a', f.query);
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].sessionId, 'z-pending');
});
