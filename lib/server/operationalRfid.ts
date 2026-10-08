import { randomUUID } from 'node:crypto';
import { acceptEnrollmentScan, isEnrollmentActive, RFID_ENROLLMENT_MS, RFID_ENROLLMENT_PATH, type RfidEnrollment } from '@/lib/utils/rfidEnrollment';
import { buildDeviceSensorSnapshot, SENSOR_SNAPSHOT_STALE_AFTER_MS } from '@/lib/utils/deviceSensorSnapshot';
import { buildSessionDocumentId, buildVisitWritePlan, findCatIdByRfid, type SensorSyncRequest } from '@/lib/utils/sensorSync';
import { buildVisitBackup } from '@/lib/utils/catHistoryNormalization';
import { preserveFirmwareVisitTime } from '@/lib/utils/catVisitIngestion';
import { readSensorMirrors } from '@/lib/utils/sensorSnapshotStore';
import { readOperationalCatalog, resolveOperationalDevice } from './operationalCats';
import { assertOperationalReady, commitOperational, OperationalError, readOperationalRecord, retryOperational, setOperational } from './operationalStore';

const root = (uid: string) => `users/${uid}/`;
export async function readOperationalEnrollment(uid: string) {
  await assertOperationalReady(uid);
  return (await readOperationalRecord(uid, `${root(uid)}${RFID_ENROLLMENT_PATH}`))?.data as RfidEnrollment | undefined;
}
export async function startOperationalEnrollment(uid: string, now = Date.now()) {
  await assertOperationalReady(uid);
  return retryOperational(async () => {
    const [current, previous, mirrors] = await Promise.all([readOperationalRecord(uid, `${root(uid)}deviceState/current`), readOperationalRecord(uid, `${root(uid)}${RFID_ENROLLMENT_PATH}`), readSensorMirrors(uid)]);
    const freshMirror = mirrors.filter(row => row.source === 'rfid' && Date.parse(row.receivedAt) <= now).sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))[0];
    const currentAt = Date.parse(String(current?.data.updatedAt ?? ''));
    const latest = freshMirror && (!Number.isFinite(currentAt) || Date.parse(freshMirror.receivedAt) > currentAt) ? { ...current?.data, ...freshMirror.data, updatedAt: freshMirror.receivedAt } : current?.data;
    const at = Date.parse(String(latest?.updatedAt ?? ''));
    if (!current?.data.deviceId || typeof current.data.deviceId !== 'string' || !Number.isFinite(at) || at > now || now - at > SENSOR_SNAPSHOT_STALE_AFTER_MS || latest?.sessionActive === true || latest?.online === false) throw new OperationalError('RFID reader must be online and idle before scanning.', 409);
    const enrollment: RfidEnrollment = { id: randomUUID(), deviceId: current.data.deviceId, status: 'waiting', count: 0, tag: '', lastScanId: -1, error: '', expiresAt: now + RFID_ENROLLMENT_MS };
    await commitOperational(uid, [setOperational(`${root(uid)}${RFID_ENROLLMENT_PATH}`, previous, { ...enrollment })]);
    console.info('[supabase:rfid] Enrollment started.');
    return enrollment;
  });
}
export async function cancelOperationalEnrollment(uid: string, id: string) {
  await assertOperationalReady(uid);
  await retryOperational(async () => {
    const path = `${root(uid)}${RFID_ENROLLMENT_PATH}`, current = await readOperationalRecord(uid, path);
    if (current?.data.id === id) await commitOperational(uid, [setOperational(path, current, { ...current.data, status: 'cancelled', expiresAt: 0, tag: '' })]);
  });
}
export async function syncOperationalRfid(payload: Record<string, unknown>, configToken: string, normalized: SensorSyncRequest, now: Date) {
  const startedAt = Date.now();
  const uid = await resolveOperationalDevice(configToken);
  if (typeof payload.deviceId !== 'string' || !payload.deviceId) throw new OperationalError('Missing reader identity', 400);
  const deviceId = payload.deviceId, enrollmentPath = `${root(uid)}${RFID_ENROLLMENT_PATH}`, snapshotPath = `${root(uid)}deviceState/current`;
  // Idle heartbeats and enrollment readiness need no tag lookup.
  const needsTags = normalized.events.length > 0 || Boolean(payload.enrollmentScan);
  const registered = needsTags ? await readOperationalCatalog(uid) : { profiles: [] };
  const tags = registered.profiles.map(profile => [profile.catId, { rfidTag: profile.details.rfidTag }] as [string, { rfidTag?: unknown }]);
  const recorded: Array<{ sessionId: string; catId: string }> = [], duplicates: typeof recorded = [], unmatched: Array<{ eventId: string; rfidCard: string; rfidHex: string }> = [];
  let enrollmentId = '', enrollmentAck = -1;
  await retryOperational(async () => {
    enrollmentId = ''; enrollmentAck = -1;
    const [current, scan] = await Promise.all([readOperationalRecord(uid, snapshotPath), readOperationalRecord(uid, enrollmentPath)]);
    if (current?.data.deviceId && current.data.deviceId !== deviceId) throw new OperationalError('Reader identity does not match paired device', 403);
    let enrollment = scan?.data as RfidEnrollment | undefined;
    if (enrollment?.deviceId === deviceId && isEnrollmentActive(enrollment, now.getTime())) {
      enrollmentId = enrollment.id;
      if (payload.enrollmentReadyId === enrollment.id && enrollment.status === 'waiting') enrollment = { ...enrollment, status: 'ready' };
      const proof = payload.enrollmentScan as Record<string, unknown> | undefined;
      if (proof && proof.id === enrollment.id && typeof proof.sequence === 'number' && typeof proof.tag === 'string') {
        enrollment = acceptEnrollmentScan(enrollment, proof.sequence, proof.tag.toUpperCase(), registered.profiles.map(profile => ({ tag: String(profile.details.rfidTag ?? '').replace(/[^a-f0-9]/gi, '').toUpperCase(), name: String(profile.cat.name ?? 'another cat') })), proof, now.getTime());
        if (enrollment.lastScanId === proof.sequence) enrollmentAck = proof.sequence;
      }
    }
    const snapshot = buildDeviceSensorSnapshot({ deviceId, configToken, recordedEvents: [], ignoredEvents: normalized.ignored, previous: current?.data, liveSensors: payload, now });
    const changes = [setOperational(snapshotPath, current, { ...snapshot })];
    if (enrollment && enrollment !== scan?.data) changes.push(setOperational(enrollmentPath, scan, { ...enrollment }));
    await commitOperational(uid, changes);
  });
  for (const event of normalized.events) {
    const matches = tags.filter(tag => findCatIdByRfid([tag], event.rfidCard, event.rfidHex));
    const catId = matches.length === 1 ? matches[0][0] : '';
    if (!catId) { unmatched.push({ eventId: event.eventId, rfidCard: event.rfidCard, rfidHex: event.rfidHex }); continue; }
    const sessionId = buildSessionDocumentId(configToken, event);
    const outcome = await retryOperational(async () => {
      const plan = buildVisitWritePlan({ userId: uid, catId, configToken, event, sessionId, serverNow: now });
      const [existing, cat, details] = await Promise.all([readOperationalRecord(uid, plan.sessionPath), readOperationalRecord(uid, `${root(uid)}cats/${catId}`), readOperationalRecord(uid, `${root(uid)}catDetails/${catId}`)]);
      if (!cat || !details || !findCatIdByRfid([[catId, { rfidTag: details.data.rfidTag }]], event.rfidCard, event.rfidHex)) throw new OperationalError('Cat/tag association changed. Retry sync.', 409);
      if (existing) {
        const previous = buildVisitBackup(sessionId, existing.data, null, 'primary_saved'), candidate = buildVisitBackup(sessionId, plan.sessionData, null, 'primary_saved');
        if (preserveFirmwareVisitTime(candidate, previous).digest !== previous.digest) throw new OperationalError('Visit identity conflicts with saved history', 409);
        return 'duplicate';
      }
      const current = await readOperationalRecord(uid, snapshotPath);
      const snapshot = buildDeviceSensorSnapshot({ deviceId, configToken, recordedEvents: [event], ignoredEvents: [], previous: current?.data, liveSensors: payload, now });
      const changes = [setOperational(plan.sessionPath, null, plan.sessionData), setOperational(cat.document_path, cat, cat.data), setOperational(details.document_path, details, details.data), setOperational(snapshotPath, current, { ...snapshot })];
      if (event.status !== 'SESSION_INTERRUPTED') for (const path of plan.summaryPaths) {
        const previous = await readOperationalRecord(uid, path), sameDay = previous?.data.date === plan.summaryData.date;
        changes.push(setOperational(path, previous, { ...plan.summaryData, visits: (sameDay ? Number(previous?.data.visits ?? 0) : 0) + 1, totalDurationSecs: (sameDay ? Number(previous?.data.totalDurationSecs ?? 0) : 0) + event.durationSecs }));
      }
      await commitOperational(uid, changes);
      return 'recorded';
    });
    (outcome === 'duplicate' ? duplicates : recorded).push({ sessionId, catId });
  }
  const acknowledged = normalized.events.length === 1 && !unmatched.length && recorded.length + duplicates.length === 1 && /^[A-Za-z0-9_-]{1,96}$/.test(normalized.events[0].eventId) ? normalized.events[0].eventId : '';
  console.info('[rfid timing] Reader sync persisted', { elapsedMs: Date.now() - startedAt, events: normalized.events.length, catalogRead: needsTags, enrollment: Boolean(enrollmentId) });
  return { uid, recorded, duplicates, unmatched, enrollmentId, enrollmentAck, acknowledged };
}
