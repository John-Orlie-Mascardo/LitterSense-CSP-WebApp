import { createHash } from 'node:crypto';
import type { VisitBackup } from '../interfaces/CatHistoryBackup';
import { buildVisitBackup } from './catHistoryNormalization';
import { readVisitBackupsById, resolveCatBackupDevice, saveVisitBackups } from './catHistoryStore';
import { buildSessionDocumentId, buildVisitWritePlan, COUNTABLE_SESSION_STATUSES, findCatIdByRfid, type SensorSyncRequest } from './sensorSync';

// Existing firmware reconstructs epoch time from whole seconds minus elapsed millis on every retry.
// Preserve the first observation only for the exact boot/start/end identity and <1s clock jitter.
export function preserveFirmwareVisitTime(candidate: VisitBackup, original: VisitBackup): VisitBackup {
  if (candidate.sessionId !== original.sessionId) return candidate;
  const identity = /^sync_[a-fA-F0-9]{1,32}_(\d{1,10})_(\d{1,10})$/.exec(candidate.sessionId);
  if (!identity) return candidate;
  const start = Number(identity[1]), end = Number(identity[2]);
  if (start > 0xffffffff || end > 0xffffffff || candidate.data.durationSecs !== Math.max(1, Math.round(((end - start + 0x100000000) % 0x100000000) / 1000))) return candidate;
  const endShift = Date.parse(candidate.data.endedAt as string) - Date.parse(original.data.endedAt as string);
  const startShift = Date.parse(candidate.data.startedAt as string) - Date.parse(original.data.startedAt as string);
  if (!Number.isFinite(endShift) || !endShift || Math.abs(endShift) >= 1000 || startShift !== endShift) return candidate;
  const preserved = buildVisitBackup(candidate.sessionId, { ...candidate.data, startedAt: original.data.startedAt, endedAt: original.data.endedAt, date: original.data.date, time: original.data.time }, candidate.tokenHash, candidate.state);
  return preserved.digest === original.digest ? preserved : candidate;
}

export async function backupSensorVisits(
  configToken: string,
  normalized: SensorSyncRequest,
  primary: { ownerId?: string; saved: VisitBackup[]; fallbackAllowed: boolean },
  receivedAt: Date,
): Promise<{ inserted: number; duplicates: number; conflicts: number; acknowledgedEventId?: string }> {
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(configToken) || !Number.isFinite(receivedAt.getTime())) throw new Error('Invalid visit backup request');
  const tokenHash = createHash('sha256').update(configToken).digest('hex');
  const result: { inserted: number; duplicates: number; conflicts: number; acknowledgedEventId?: string } = { inserted: 0, duplicates: 0, conflicts: 0 };
  const store = async (ownerId: string, visits: VisitBackup[]) => {
    for (let offset = 0; offset < visits.length; offset += 100) {
      const saved = await saveVisitBackups(ownerId, visits.slice(offset, offset + 100));
      result.inserted += saved.inserted; result.duplicates += saved.duplicates; result.conflicts += saved.conflicts;
    }
  };
  const preserveAndStore = async (ownerId: string, visits: VisitBackup[]) => {
    for (let offset = 0; offset < visits.length; offset += 100) {
      const batch = visits.slice(offset, offset + 100);
      const existing = new Map((await readVisitBackupsById(ownerId, batch.map(visit => visit.sessionId))).map(visit => [visit.sessionId, visit]));
      await store(ownerId, batch.map(visit => {
        const original = existing.get(visit.sessionId);
        if (!original) existing.set(visit.sessionId, visit);
        return original ? preserveFirmwareVisitTime(visit, original) : visit;
      }));
    }
  };
  if (primary.saved.length) {
    if (!primary.ownerId) throw new Error('Confirmed visits require verified primary ownership');
    await preserveAndStore(primary.ownerId, primary.saved.map(visit => {
      if (visit.state !== 'primary_saved') throw new Error('Unconfirmed visit cannot be mirrored');
      return buildVisitBackup(visit.sessionId, visit.data, tokenHash, 'primary_saved');
    }));
  }
  if (!primary.fallbackAllowed || !normalized.events.length) return result;
  const device = await resolveCatBackupDevice(configToken);
  if (!device || device.tokenHash !== tokenHash || !device.catalog.complete || (primary.ownerId && primary.ownerId !== device.ownerId)) return result;
  const tags: Array<[string, { rfidTag?: unknown }]> = device.catalog.profiles
    .filter(profile => typeof profile.cat.name === 'string' && Boolean(profile.cat.name.trim()))
    .map(profile => [profile.catId, { rfidTag: profile.details.rfidTag }]);
  const confirmed = new Set(primary.saved.map(visit => visit.sessionId));
  const pending: VisitBackup[] = [];
  for (const event of normalized.events) {
    if (!COUNTABLE_SESSION_STATUSES.includes(event.status) || !Number.isFinite(event.durationSecs) || event.durationSecs < 1) continue;
    const matches = tags.filter(tag => findCatIdByRfid([tag], event.rfidCard, event.rfidHex));
    if (matches.length !== 1) continue;
    const sessionId = buildSessionDocumentId(configToken, event);
    if (confirmed.has(sessionId)) continue;
    const catId = matches[0][0];
    const plan = buildVisitWritePlan({ userId: device.ownerId, catId, configToken, event, sessionId, serverNow: receivedAt });
    pending.push(buildVisitBackup(sessionId, plan.sessionData, tokenHash, 'pending'));
  }
  await preserveAndStore(device.ownerId, pending);
  // Release the board's queue only after the exact visit is durably stored for its verified owner.
  if (!result.conflicts && normalized.events.length === 1 && !normalized.ignored.length) {
    const event = normalized.events[0];
    const candidate = pending.find(visit => visit.sessionId === buildSessionDocumentId(configToken, event));
    if (candidate && /^[A-Za-z0-9_-]{1,96}$/.test(event.eventId)) {
      const stored = (await readVisitBackupsById(device.ownerId, [candidate.sessionId]))[0];
      if (stored && stored.tokenHash === tokenHash && ['primary_saved', 'pending', 'claimed'].includes(stored.state) && preserveFirmwareVisitTime(candidate, stored).digest === stored.digest) result.acknowledgedEventId = event.eventId;
    }
  }
  return result;
}
