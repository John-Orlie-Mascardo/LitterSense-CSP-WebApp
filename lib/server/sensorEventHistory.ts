import { createHash } from 'node:crypto';
import { resolveOperationalDevice } from '@/lib/server/operationalCats';
import { OperationalError, readOperationalRecord, retryOperational, setOperational, commitOperational } from '@/lib/server/operationalStore';

export async function saveSensorEventHistory(token: string, payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new OperationalError('Invalid history batch', 400);
  const batch = payload as Record<string, unknown>;
  const source = batch.source ?? 'gas-ultrasonic';
  if (!['gas-ultrasonic', 'rfid'].includes(source as string) || typeof batch.deviceId !== 'string' || !/^[A-Za-z0-9:_-]{1,96}$/.test(batch.deviceId) || !Array.isArray(batch.events) || batch.events.length < 1 || batch.events.length > 8) throw new OperationalError('Invalid history batch', 400);
  const deviceId = batch.deviceId;
  const events = batch.events.map((raw: unknown): Record<string, unknown> => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new OperationalError('Invalid history event', 400);
    const e = raw as Record<string, unknown>;
    const captured = typeof e.capturedAt === 'string' ? Date.parse(e.capturedAt) : NaN;
    if (typeof e.eventId !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(e.eventId) || (e.capturedAt !== null && (!Number.isFinite(captured) || captured < 1700000000000 || captured > Date.now() + 5000))) throw new OperationalError('Invalid event identity or timestamp', 400);
    const common = { eventId: e.eventId, deviceId, source, capturedAt: e.capturedAt === null ? null : new Date(captured).toISOString(), timingKnown: e.capturedAt !== null };
    if (source === 'rfid') {
      // Undated visits cannot be assigned to a calendar day or current statistics.
      if (e.capturedAt !== null || typeof e.rfidHex !== 'string' || !/^[A-F0-9]{4,124}$/.test(e.rfidHex) || !['NORMAL', 'ABNORMAL', 'SHORT_SESSION', 'NO_EXIT_TIMEOUT', 'SESSION_INTERRUPTED'].includes(e.status as string) || typeof e.durationMs !== 'number' || !Number.isInteger(e.durationMs) || e.durationMs < 0 || e.durationMs > 4294967295 || (e.durationMs === 0 && e.status !== 'SESSION_INTERRUPTED')) throw new OperationalError('Invalid undated RFID visit', 400);
      return { ...common, rfidHex: e.rfidHex, status: e.status, durationMs: e.status === 'SESSION_INTERRUPTED' ? null : e.durationMs };
    }
    if (![0, 1].includes(e.mq135Raw as number) || ![0, 1].includes(e.mq136Raw as number) || typeof e.entranceOccupied !== 'boolean' || (e.distanceCm !== null && (typeof e.distanceCm !== 'number' || !Number.isFinite(e.distanceCm) || e.distanceCm < 0 || e.distanceCm > 515))) throw new OperationalError('Invalid historical sensor readings', 400);
    return { ...common, mq135Raw: e.mq135Raw, mq136Raw: e.mq136Raw, distanceCm: e.distanceCm, entranceOccupied: e.entranceOccupied };
  });
  const uid = await resolveOperationalDevice(token);
  const paired = await readOperationalRecord(uid, `users/${uid}/deviceState/${source === 'rfid' ? 'current' : 'gasUltrasonic'}`);
  if (paired?.data.deviceId && paired.data.deviceId !== deviceId) throw new OperationalError('Device identity mismatch', 403);
  const acknowledged: string[] = [];
  for (const event of events) {
    const digest = createHash('sha256').update(`${source}:${deviceId}:${event.eventId}`).digest('hex');
    const path = `users/${uid}/sensorHistory/${digest}`;
    await retryOperational(async () => {
      const previous = await readOperationalRecord(uid, path);
      if (previous) {
        if (Object.keys(previous.data).length !== Object.keys(event).length || Object.entries(event).some(([key, value]) => previous.data[key] !== value)) throw new OperationalError('History event identity conflict', 409);
        return;
      }
      await commitOperational(uid, [setOperational(path, null, event)]);
    });
    acknowledged.push(String(event.eventId));
  }
  return acknowledged;
}
