import { getAdminAuth } from '@/lib/configs/firebase-admin';
import { mutateCatProfile, validateCatMutation } from '@/lib/utils/catCatalogSync';
import { readCatCatalog } from '@/lib/utils/catHistoryReads';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
async function owner(request: Request) {
  try { return (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '', true)).uid; }
  catch { return ''; }
}
export async function GET(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const result = await readCatCatalog(uid);
    return Response.json({ ...result.catalog, source: result.source, backupPending: result.backupPending }, { headers });
  } catch { return Response.json({ error: 'Cat profiles are temporarily unavailable. Please try again.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  let mutation;
  try { mutation = validateCatMutation(await request.json()); }
  catch { return Response.json({ error: 'Invalid cat profile fields.' }, { status: 400, headers }); }
  try {
    const result = await mutateCatProfile(uid, mutation);
    return Response.json({ saved: true, ...result }, { headers });
  } catch (error) {
    const status = error instanceof Error && 'status' in error && [404, 409].includes(Number(error.status)) ? Number(error.status) : 503;
    return Response.json({ error: status === 503 ? 'Cat profile changes require an available database. Please try again when service is restored.' : (error as Error).message }, { status, headers });
  }
}
