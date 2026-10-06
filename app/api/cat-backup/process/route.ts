import { timingSafeEqual } from 'node:crypto';
import { processCatHistoryRecovery } from '@/lib/utils/catVisitRecovery';

export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const expected = Buffer.from(process.env.CAT_HISTORY_PROCESS_SECRET ?? '');
  const supplied = Buffer.from(request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? '');
  if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (process.env.CAT_HISTORY_RECOVERY_ENABLED !== 'true') return Response.json({ enabled: false }, { headers });
  try { return Response.json(await processCatHistoryRecovery(), { headers }); }
  catch { return Response.json({ error: 'History recovery unavailable' }, { status: 503, headers }); }
}
