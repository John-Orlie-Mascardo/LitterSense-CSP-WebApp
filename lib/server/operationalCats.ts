import type { CatalogBackup } from '@/lib/interfaces/CatHistoryBackup';
import { validateCatMutation, type CatProfileMutation } from '@/lib/utils/catCatalogSync';
import { getLocalDateKey } from '@/lib/utils/sessionDate';
import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
import { assertOperationalReady, commitOperational, listOperationalRecords, OperationalError, readOperationalRecord, readOperationalCredential, retryOperational, setOperational } from './operationalStore';

const direct = (rows: Awaited<ReturnType<typeof listOperationalRecords>>, prefix: string) => rows.filter(row => !row.document_path.slice(prefix.length).includes('/'));
export async function readOperationalCatalog(uid: string): Promise<CatalogBackup> {
  await assertOperationalReady(uid);
  const root = `users/${uid}/`, catPrefix = `${root}cats/`, detailPrefix = `${root}catDetails/`;
  return retryOperational(async () => {
    const before = await readOperationalRecord(uid, `${root}backupState/catalog`);
    const [cats, details] = await Promise.all([listOperationalRecords(uid, catPrefix), listOperationalRecords(uid, detailPrefix)]);
    const version = await readOperationalRecord(uid, `${root}backupState/catalog`);
    if (before?.revision !== version?.revision) throw new OperationalError('Catalog changed during reading', 409, '40001');
    const profiles = direct(cats, catPrefix).map(row => ({ catId: row.document_path.slice(catPrefix.length), cat: row.data, details: details.find(detail => detail.document_path === `${detailPrefix}${row.document_path.slice(catPrefix.length)}`)?.data ?? {} }));
    return { profiles, revision: Number(version?.data.revision ?? 1), complete: true, sourceReadAt: new Date().toISOString() };
  });
}
// Keep existing SMS/push account rows and settings; update only their cat projection.
export async function projectOperationalCats(uid: string) {
  const catalog = await readOperationalCatalog(uid);
  const response = await smsStoreRequest(`sms_accounts?owner_id=eq.${encodeURIComponent(uid)}&select=owner_id,cats`);
  if (!response.ok) throw new OperationalError('Alert account import is not ready');
  const account = (await response.json() as Array<{ cats: unknown }>)[0];
  if (!account) throw new OperationalError('Alert account import is not ready');
  const cats = catalog.profiles.map(profile => ({ id: profile.catId, name: profile.cat.name, rfidTag: String(profile.details.rfidTag ?? '').replace(/[^a-f0-9]/gi, '').toUpperCase(), baseline: profile.details.baseline ?? null }));
  if (JSON.stringify(account.cats) === JSON.stringify(cats)) return;
  const saved = await smsStoreRequest(`sms_accounts?owner_id=eq.${encodeURIComponent(uid)}`, { method: 'PATCH', body: JSON.stringify({ cats }) });
  if (!saved.ok) throw new OperationalError('Alert cat projection is pending');
}
export async function mutateOperationalCat(uid: string, input: CatProfileMutation) {
  const mutation = validateCatMutation(input);
  await assertOperationalReady(uid);
  const root = `users/${uid}/`, catPath = `${root}cats/${mutation.catId}`, detailsPath = `${root}catDetails/${mutation.catId}`, revisionPath = `${root}backupState/catalog`;
  const result = await retryOperational(async () => {
    const [cat, details, version, enrollment] = await Promise.all([readOperationalRecord(uid, catPath), readOperationalRecord(uid, detailsPath), readOperationalRecord(uid, revisionPath), readOperationalRecord(uid, `${root}deviceState/rfidEnrollment`)]);
    if (mutation.action === 'create' && cat) throw new OperationalError('This cat already exists.', 409);
    if (mutation.action === 'update' && !cat) throw new OperationalError('This cat no longer exists.', 404);
    const changes = [];
    if (mutation.action === 'delete') {
      for (const path of [catPath, detailsPath, `${root}catStats/${mutation.catId}`, `${root}dailyCatStats/${mutation.today ?? getLocalDateKey()}/cats/${mutation.catId}`, `${root}catSessionLog/${mutation.catId}`]) {
        const previous = path === catPath ? cat : path === detailsPath ? details : await readOperationalRecord(uid, path);
        if (previous) changes.push({ action: 'delete' as const, document_path: path, expected_revision: previous.revision });
      }
    } else {
      const nextDetails = { ...details?.data, ...mutation.details };
      if (mutation.details?.baseline) nextDetails.baseline = { ...(details?.data.baseline as Record<string, unknown> ?? {}), ...(mutation.details.baseline as Record<string, unknown>) };
      const oldTag = String(details?.data.rfidTag ?? '').replace(/[^a-f0-9]/gi, '').toUpperCase();
      const tag = String(nextDetails.rfidTag ?? '').replace(/[^a-f0-9]/gi, '').toUpperCase();
      if (tag && tag !== oldTag) {
        const catalog = await readOperationalCatalog(uid);
        const duplicate = catalog.profiles.find(profile => profile.catId !== mutation.catId && String(profile.details.rfidTag ?? '').replace(/[^a-f0-9]/gi, '').toUpperCase() === tag);
        if (duplicate) throw new OperationalError(`This tag belongs to ${duplicate.cat.name ?? 'another cat'}. Use a different tag.`, 409);
        if (enrollment?.data.status !== 'verified' || enrollment.data.tag !== tag) throw new OperationalError('Scan and hold this tag for five seconds before saving.', 409);
        changes.push(setOperational(`${root}deviceState/rfidEnrollment`, enrollment, { ...enrollment.data, status: 'cancelled', tag: '', expiresAt: 0 }));
      }
      if (mutation.cat !== undefined) changes.push(setOperational(catPath, cat, { ...cat?.data, ...mutation.cat }));
      if (mutation.details !== undefined) changes.push(setOperational(detailsPath, details, nextDetails));
    }
    const revision = Number(version?.data.revision ?? 0) + 1;
    changes.push(setOperational(revisionPath, version, { revision }));
    await commitOperational(uid, changes);
    return { revision, backupPending: false };
  });
  try { await projectOperationalCats(uid); } catch { console.warn('[supabase:rfid] Cat saved; alert catalog projection pending.'); return { ...result, backupPending: true }; }
  console.info('[supabase:rfid] Cat profile committed.');
  return result;
}
export async function resolveOperationalDevice(token: string) {
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(token)) throw new OperationalError('Invalid device credential', 403);
  const credential = await readOperationalCredential(`deviceConfigs/${token}`);
  const uid = credential?.owner_id;
  if (!uid) throw new OperationalError('Unknown device', 403);
  await assertOperationalReady(uid);
  const [config, ownerConfig] = await Promise.all([readOperationalRecord(uid, `deviceConfigs/${token}`), readOperationalRecord(uid, `users/${uid}/deviceConfig/default`)]);
  if (!config || ownerConfig?.data.configToken !== token) throw new OperationalError('Device credential revoked or not imported', 403);
  return uid;
}
