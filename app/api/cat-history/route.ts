import { getAdminAuth } from '@/lib/configs/firebase-admin';
import { readCatHistory, HistoryReadError } from '@/lib/utils/catHistoryReads';
import { HISTORY_BATCH_SIZE } from '@/lib/presentation/sessionHistory';
import type { BehaviorStateId } from '@/lib/presentation/behaviorStates';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? '', true)).uid; }
  catch { return Response.json({ error: 'Unauthorized' }, { status: 401, headers }); }
  const params = new URL(request.url).searchParams;
  const states = params.get('states')?.split(',').filter(Boolean) as BehaviorStateId[] | undefined;
  try {
    const page = await readCatHistory(uid, { startDate: params.get('startDate') ?? '', endDate: params.get('endDate') ?? '', sort: params.get('sort') === 'asc' ? 'asc' : 'desc', catId: params.get('catId') ?? 'all', states, cursor: params.get('cursor') ?? undefined, limit: HISTORY_BATCH_SIZE });
    return Response.json(page, { headers });
  } catch (error) {
    if (error instanceof HistoryReadError && error.resetRequired) return Response.json({ error: 'History source changed', resetRequired: true }, { status: 409, headers });
    if (error instanceof HistoryReadError && [400, 403].includes(error.status)) return Response.json({ error: error.message }, { status: error.status, headers });
    return Response.json({ error: 'Cat history is temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
}
