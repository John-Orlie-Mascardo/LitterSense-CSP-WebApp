import { createHash } from 'node:crypto';
import { resolveOperationalDevice } from './operationalCats';
import { assertOperationalReady, commitOperational, OperationalError, readOperationalCredential, readOperationalRecord, retryOperational, setOperational } from './operationalStore';
import { rememberSensorDevice } from '@/lib/utils/sensorSnapshotStore';
import { smsStoreRequest } from '@/lib/utils/smsAccountSync';

const publicFields = (data: Record<string, unknown>, configToken: string) => ({
  configToken, deviceName: String(data.deviceName ?? 'LitterSense Unit #1'),
  wifiSsid: String(data.wifiSsid ?? ''), wifiPassword: String(data.wifiPassword ?? ''),
  updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
});
export async function readOperationalDeviceConfig(uid: string) {
  await assertOperationalReady(uid);
  const pointer = await readOperationalRecord(uid, `users/${uid}/deviceConfig/default`);
  const token = pointer?.data.configToken;
  if (typeof token !== 'string' || !token) return null;
  const owned = await readOperationalRecord(uid, `deviceConfigs/${token}`);
  if (owned?.data.ownerId !== uid) throw new OperationalError('Device config owner mismatch', 403);
  return readPublicOperationalConfig(token);
}
export async function readPublicOperationalConfig(token: string) {
  const uid = await resolveOperationalDevice(token);
  const config = await readOperationalRecord(uid, `deviceConfigs/${token}`);
  if (!config) throw new OperationalError('Device config unavailable', 404);
  return publicFields(config.data, token);
}
export async function saveOperationalDeviceConfig(uid: string, input: Record<string, unknown>) {
  await assertOperationalReady(uid);
  const token = input.configToken;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(token)) throw new OperationalError('Invalid config token', 400);
  for (const [field, max] of [['deviceName', 128], ['wifiSsid', 32], ['wifiPassword', 64]] as const) {
    if (typeof input[field] !== 'string' || Buffer.byteLength(input[field]) > max) throw new OperationalError(`Invalid ${field}`, 400);
  }
  if (typeof input.previousToken !== 'string') throw new OperationalError('Refresh device setup before saving', 409);
  const previousToken = await retryOperational(async () => {
    const pointerPath = `users/${uid}/deviceConfig/default`;
    const pointer = await readOperationalRecord(uid, pointerPath);
    const previous = String(pointer?.data.configToken ?? '');
    if (previous !== input.previousToken) throw new OperationalError('Device setup changed. Refresh before saving.', 409);
    const credential = await readOperationalCredential(`deviceConfigs/${token}`);
    if (credential && credential.owner_id !== uid) throw new OperationalError('Config token already belongs to another owner', 409);
    const updatedAt = new Date().toISOString();
    const fields = { configToken: token, deviceName: (input.deviceName as string).trim() || 'LitterSense Unit #1', wifiSsid: (input.wifiSsid as string).trim(), wifiPassword: input.wifiPassword, updatedAt };
    const changes = [setOperational(pointerPath, pointer, { ...pointer?.data, configToken: token, deviceName: fields.deviceName, wifiSsid: fields.wifiSsid, updatedAt }), setOperational(`deviceConfigs/${token}`, credential, { ...credential?.data, ...fields, ownerId: uid })];
    if (previous && previous !== token) {
      const old = await readOperationalRecord(uid, `deviceConfigs/${previous}`);
      if (old) changes.push({ action: 'delete', document_path: old.document_path, expected_revision: old.revision });
    }
    await commitOperational(uid, changes);
    return previous;
  });
  let projectionPending = false;
  try {
    await rememberSensorDevice(uid, token);
    if (previousToken && previousToken !== token) {
      const removed = await smsStoreRequest(`sms_devices?owner_id=eq.${encodeURIComponent(uid)}&token_hash=eq.${createHash('sha256').update(previousToken).digest('hex')}`, { method: 'DELETE' });
      if (!removed.ok) throw new Error('Device projection removal pending');
    }
  } catch { projectionPending = true; console.warn('[supabase:device] Setup saved; alert device projection pending.'); }
  console.info('[supabase:device] Provisioning saved.');
  return { projectionPending };
}
