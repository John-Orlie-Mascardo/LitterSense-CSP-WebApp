import { FieldPath } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/configs/firebase-admin';
import type { BackupProgress } from '../interfaces/CatHistoryBackup';
import { buildVisitBackup, validateBackupId } from './catHistoryNormalization';
import { readBackupProgress, saveBackupProgress, saveVisitBackups } from './catHistoryStore';
import { toIsoStringFromDateLike } from './sessionDate';

export async function copyHistoryPage(ownerId: string): Promise<BackupProgress & { copiedRows: number }> {
  validateBackupId(ownerId);
  if (ownerId.length > 128) throw new Error('Invalid history owner');
  const stored = await readBackupProgress(ownerId);
  const initial = { cursor: null, scanned: 0, complete: false, checkedAt: new Date().toISOString(), lastError: null } satisfies BackupProgress;
  const previous = stored?.complete ? initial : stored ?? initial;
  // Persist a completed-cycle reset before advancing so database progress cannot regress silently.
  if (stored?.complete) await saveBackupProgress(ownerId, initial);
  let next: BackupProgress;
  let copiedRows = 0;
  try {
    let query = getAdminFirestore().collection(`users/${ownerId}/sessions`).orderBy(FieldPath.documentId()).limit(100);
    if (previous.cursor) query = query.startAfter(previous.cursor);
    const page = await query.get();
    const visits = page.docs.map(doc => {
      const data = { ...doc.data() };
      for (const key of ['startedAt', 'endedAt']) if (data[key] !== undefined && data[key] !== null && data[key] !== '' && typeof data[key] !== 'string') {
        const converted = toIsoStringFromDateLike(data[key]);
        if (!converted) throw new Error('Unsupported historical timestamp');
        data[key] = converted;
      }
      return buildVisitBackup(doc.id, data, null, 'primary_saved');
    });
    const saved = await saveVisitBackups(ownerId, visits);
    if (saved.conflicts) throw new Error('Conflicting historical session identity');
    copiedRows = visits.length;
    next = { cursor: page.docs.at(-1)?.id ?? previous.cursor, scanned: previous.scanned + page.docs.length, complete: page.docs.length < 100, checkedAt: new Date().toISOString(), lastError: null };
  } catch {
    next = { ...previous, complete: false, checkedAt: new Date().toISOString(), lastError: 'History backup is incomplete. Retry after checking primary access and stored record compatibility.' };
  }
  // Never advance before durable page storage; a lost response safely repeats the same original IDs.
  await saveBackupProgress(ownerId, next);
  return { ...next, copiedRows };
}
