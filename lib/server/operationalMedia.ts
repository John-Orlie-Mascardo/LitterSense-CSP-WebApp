import { OperationalError } from './operationalStore';
import { photoFields } from '../utils/operationalPhotoFields.mjs';

export const MEDIA_BUCKET = 'littersense-media';
export function ownedPhotoPath(uid: string, path: string) {
  const pieces = path.split('/');
  return pieces[0] === 'users' && pieces[1] === uid && !pieces.some(p => !p || !/^[A-Za-z0-9_.-]+$/.test(p) || p === '.' || p === '..') &&
    ((pieces.length === 5 && pieces[2] === 'cats' && pieces[4] === 'photo.jpg') || (pieces.length === 4 && pieces[2] === 'profile' && pieces[3].endsWith('.jpg')));
}
export async function mediaRequest(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new OperationalError('Photo storage is not configured');
  const response = await fetch(`${url.replace(/\/$/, '')}/storage/v1/${path}`, {
    ...init, headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), ...init.headers },
    signal: AbortSignal.timeout(30000), cache: 'no-store',
  });
  if (!response.ok) throw new OperationalError('Photo storage unavailable', response.status === 404 ? 404 : 503);
  return response;
}
const encodedPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
export async function signPhoto(path: string) {
  const response = await mediaRequest(`object/sign/${MEDIA_BUCKET}/${encodedPath(path)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 86400 }) });
  const { signedURL } = await response.json();
  if (typeof signedURL !== 'string' || !signedURL.startsWith(`/object/sign/${MEDIA_BUCKET}/`)) throw new OperationalError('Invalid photo response');
  return `${process.env.SUPABASE_URL!.replace(/\/$/, '')}/storage/v1${signedURL}`;
}
export function photoPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const prefix = `supabase://${MEDIA_BUCKET}/`;
  if (value.startsWith(prefix)) return value.slice(prefix.length);
  try {
    const url = new URL(value), base = new URL(process.env.SUPABASE_URL ?? 'https://invalid.local');
    const signed = `/storage/v1/object/sign/${MEDIA_BUCKET}/`;
    return url.origin === base.origin && url.pathname.startsWith(signed) ? decodeURIComponent(url.pathname.slice(signed.length)) : null;
  } catch { return null; }
}
export async function refreshPhotos(data: Record<string, unknown>, uid: string) {
  const next = JSON.parse(JSON.stringify(data));
  for (const { target, key } of photoFields(next)) {
    const path = photoPath(target[key]);
    if (path && ownedPhotoPath(uid, path)) target[key] = await signPhoto(path);
  }
  return next;
}
export function storePhotoPointers(data: Record<string, unknown>, uid: string) {
  const next = JSON.parse(JSON.stringify(data));
  for (const { target, key } of photoFields(next)) {
    const path = photoPath(target[key]);
    if (path && ownedPhotoPath(uid, path)) target[key] = `supabase://${MEDIA_BUCKET}/${path}`;
  }
  return next;
}
export async function uploadOperationalPhoto(uid: string, path: string, bytes: Uint8Array, mime: string) {
  if (!ownedPhotoPath(uid, path)) throw new OperationalError('Forbidden photo path', 403);
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new OperationalError('Prepared photo must be 2 MB or smaller', 400);
  const hex = Buffer.from(bytes.subarray(0, 12)).toString('hex');
  const valid = mime === 'image/jpeg' && hex.startsWith('ffd8ff') || mime === 'image/png' && hex.startsWith('89504e470d0a1a0a') || mime === 'image/gif' && (hex.startsWith('474946383761') || hex.startsWith('474946383961')) || mime === 'image/webp' && hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
  if (!valid) throw new OperationalError('Invalid image', 400);
  await mediaRequest(`object/${MEDIA_BUCKET}/${encodedPath(path)}`, { method: 'POST', headers: { 'Content-Type': mime, 'x-upsert': 'true', 'Cache-Control': 'private,max-age=3600' }, body: Buffer.from(bytes) });
  return signPhoto(path);
}
export async function deleteOperationalPhoto(uid: string, path: string) {
  if (!ownedPhotoPath(uid, path)) throw new OperationalError('Forbidden photo path', 403);
  await mediaRequest(`object/${MEDIA_BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) });
}
