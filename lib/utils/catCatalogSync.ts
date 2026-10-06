import { getAdminFirestore } from '@/lib/configs/firebase-admin';
import type { CatalogBackup } from '../interfaces/CatHistoryBackup';
import { sanitizeProfileBackup, validateBackupDate, validateBackupId } from './catHistoryNormalization';
import { saveCatalogBackup } from './catHistoryStore';
import { getLocalDateKey } from './sessionDate';

export type CatProfileMutation = {
  action: 'create' | 'update' | 'delete';
  catId: string;
  cat?: Record<string, unknown>;
  details?: Record<string, unknown>;
  today?: string;
};

export class CatProfileError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function ownerPath(ownerId: string) {
  validateBackupId(ownerId);
  if (ownerId.length > 128) throw new Error('Invalid profile owner');
  return `users/${ownerId}`;
}

export function validateCatMutation(input: unknown): CatProfileMutation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CatProfileError('Invalid cat profile.', 400);
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['action', 'catId', 'cat', 'details', 'today'].includes(key)) || !['create', 'update', 'delete'].includes(value.action as string)) throw new CatProfileError('Invalid cat profile.', 400);
  try {
    validateBackupId(value.catId as string);
    for (const key of ['cat', 'details']) if (value[key] !== undefined && (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key]))) throw new Error('Invalid profile fields');
    const mutation = value as CatProfileMutation;
    const clean = sanitizeProfileBackup({ catId: mutation.catId, cat: mutation.cat ?? {}, details: mutation.details ?? {} });
    // Credentials, IDs and bookkeeping are excluded from backups, but never accepted as edits.
    if (Object.keys(mutation.cat ?? {}).some(key => !(key in clean.cat)) || Object.keys(mutation.details ?? {}).some(key => !(key in clean.details))) throw new Error('Invalid profile fields');
    if (mutation.details?.baseline && Object.keys(mutation.details.baseline as Record<string, unknown>).some(key => !(key in (clean.details.baseline as Record<string, unknown>)))) throw new Error('Invalid baseline fields');
    if (mutation.cat?.name !== undefined && (typeof mutation.cat.name !== 'string' || !mutation.cat.name.trim())) throw new Error('Enter a cat name');
    if (mutation.action === 'create' && !mutation.cat?.name) throw new Error('Enter a cat name');
    if (mutation.action === 'update' && mutation.cat === undefined && mutation.details === undefined) throw new Error('No profile changes');
    if (mutation.action === 'delete' && (mutation.cat !== undefined || mutation.details !== undefined)) throw new Error('Invalid deletion');
    if (mutation.today !== undefined) { validateBackupDate(mutation.today); if (mutation.action !== 'delete') throw new Error('Invalid deletion date'); }
    return mutation;
  } catch { throw new CatProfileError('Invalid cat profile fields.', 400); }
}

function revisionAfter(value: unknown) {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= Number.MAX_SAFE_INTEGER)) throw new Error('Invalid catalog revision');
  return (value as number | undefined ?? 0) + 1;
}

function normalizedCatalog(catalog: CatalogBackup): CatalogBackup {
  return { ...catalog, profiles: catalog.profiles.map(profile => sanitizeProfileBackup({ ...profile, details: backupDetails(profile.details) })) };
}

function backupDetails(source: Record<string, unknown>): Record<string, unknown> {
  const { weightKg, ...details } = source;
  if (details.weight === undefined && weightKg !== undefined) details.weight = weightKg;
  return details;
}

// Collection queries and the revision are read together; a failed read never produces an empty catalog.
export async function captureCatalog(ownerId: string): Promise<CatalogBackup> {
  const root = ownerPath(ownerId);
  const db = getAdminFirestore();
  return db.runTransaction(async tx => {
    const [cats, details, revision] = await Promise.all([
      tx.get(db.collection(`${root}/cats`)), tx.get(db.collection(`${root}/catDetails`)), tx.get(db.doc(`${root}/backupState/catalog`)),
    ]);
    const detailMap = new Map(details.docs.map(doc => [doc.id, doc.data()]));
    const catIds = new Set(cats.docs.map(doc => doc.id));
    if (details.docs.some(doc => !catIds.has(doc.id))) throw new Error('Catalog has unmatched details; backup incomplete');
    const existingRevision = revision.data()?.revision;
    const catalog = normalizedCatalog({ revision: existingRevision === undefined ? 1 : existingRevision, sourceReadAt: new Date().toISOString(), complete: true, profiles: cats.docs.map(doc => ({ catId: doc.id, cat: doc.data(), details: detailMap.get(doc.id) ?? {} })) });
    if (existingRevision === undefined) tx.set(db.doc(`${root}/backupState/catalog`), { revision: catalog.revision });
    return catalog;
  });
}

export async function mutateCatProfile(ownerId: string, input: CatProfileMutation): Promise<{ revision: number; backupPending: boolean }> {
  const mutation = validateCatMutation(input);
  const root = ownerPath(ownerId);
  const db = getAdminFirestore();
  const catalog = await db.runTransaction(async tx => {
    const [cats, details, revisionDoc] = await Promise.all([
      tx.get(db.collection(`${root}/cats`)), tx.get(db.collection(`${root}/catDetails`)), tx.get(db.doc(`${root}/backupState/catalog`)),
    ]);
    const catMap = new Map(cats.docs.map(doc => [doc.id, doc.data()]));
    const detailMap = new Map(details.docs.map(doc => [doc.id, doc.data()]));
    const exists = catMap.has(mutation.catId);
    if (mutation.action === 'create' && exists) throw new CatProfileError('This cat already exists. Refresh before trying again.', 409);
    if (mutation.action === 'update' && !exists) throw new CatProfileError('This cat no longer exists. Refresh before editing.', 404);
    if (mutation.action !== 'delete' && typeof mutation.details?.rfidTag === 'string') {
      const normalize = (value: unknown) => typeof value === 'string' ? value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase() : '';
      const tag = normalize(mutation.details.rfidTag);
      const duplicate = tag && [...detailMap].find(([id, details]) => id !== mutation.catId && catMap.has(id) && normalize(details.rfidTag) === tag);
      if (duplicate) throw new CatProfileError(`This tag belongs to ${catMap.get(duplicate[0])?.name ?? 'another cat'}. Use a different tag.`, 409);
    }
    const revision = revisionAfter(revisionDoc.data()?.revision);
    const catRef = db.doc(`${root}/cats/${mutation.catId}`);
    const detailsRef = db.doc(`${root}/catDetails/${mutation.catId}`);
    if (mutation.action === 'delete') {
      catMap.delete(mutation.catId); detailMap.delete(mutation.catId);
      for (const path of [`cats/${mutation.catId}`, `catDetails/${mutation.catId}`, `catStats/${mutation.catId}`, `dailyCatStats/${mutation.today ?? getLocalDateKey()}/cats/${mutation.catId}`, `catSessionLog/${mutation.catId}`]) tx.delete(db.doc(`${root}/${path}`));
    } else {
      if (mutation.cat !== undefined) {
        const cat = mutation.action === 'create' ? mutation.cat : { ...catMap.get(mutation.catId), ...mutation.cat };
        catMap.set(mutation.catId, cat);
        tx.set(catRef, cat);
      }
      if (mutation.details !== undefined) {
        const existingDetails = mutation.action === 'create' ? {} : detailMap.get(mutation.catId) ?? {};
        const nextDetails = { ...existingDetails, ...mutation.details };
        if (mutation.action === 'update' && mutation.details.baseline && typeof mutation.details.baseline === 'object') nextDetails.baseline = { ...(existingDetails.baseline as Record<string, unknown> ?? {}), ...(mutation.details.baseline as Record<string, unknown>) };
        detailMap.set(mutation.catId, nextDetails);
        tx.set(detailsRef, nextDetails);
      }
    }
    tx.set(db.doc(`${root}/backupState/catalog`), { revision });
    return { revision, sourceReadAt: new Date().toISOString(), complete: ![...detailMap.keys()].some(id => !catMap.has(id)), profiles: [...catMap].map(([catId, cat]) => ({ catId, cat, details: detailMap.get(catId) ?? {} })) } satisfies CatalogBackup;
  });
  // A primary commit has already succeeded. Mirror validation/storage cannot turn it into a failed save.
  try { await saveCatalogBackup(ownerId, normalizedCatalog(catalog)); return { revision: catalog.revision, backupPending: false }; }
  catch { return { revision: catalog.revision, backupPending: true }; }
}
