import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
import { assertOperationalReady, OperationalError } from './operationalStore';

export type GasHistoryEvent = { id: string; capturedAt: string | null; receivedAt: string; mq135Raw: number; mq136Raw: number };
export async function readGasHistory(uid: string, cursor?: string) {
  await assertOperationalReady(uid);
  const prefix = `users/${uid}/sensorHistory/`;
  const query = new URLSearchParams({ owner_id: `eq.${uid}`, document_path: `like.${prefix.replace(/_/g, '\\_')}*`, 'data->>source': 'eq.gas-ultrasonic', select: 'document_path,data,updated_at', order: 'updated_at.desc,document_path.desc', limit: '51' });
  if (cursor) {
    try {
      const [time, path] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(time) || !Number.isFinite(Date.parse(time)) || typeof path !== 'string' || !path.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(path.slice(prefix.length))) throw new Error();
      // Quote the validated path: owner IDs may contain PostgREST punctuation.
      query.set('or', `(updated_at.lt.${time},and(updated_at.eq.${time},document_path.lt.${JSON.stringify(path)}))`);
    } catch { throw new OperationalError('Invalid history cursor', 400); }
  }
  const response = await smsStoreRequest(`operational_records?${query}`);
  if (!response.ok) throw new OperationalError('Gas history unavailable');
  const rows = await response.json() as Array<{ document_path: string; updated_at: string; data: Record<string, unknown> }>;
  const page = rows.slice(0, 50), last = page.at(-1);
  return {
    events: page.map(row => ({ id: row.document_path.slice(prefix.length), capturedAt: typeof row.data.capturedAt === 'string' ? row.data.capturedAt : null, receivedAt: row.updated_at, mq135Raw: Number(row.data.mq135Raw), mq136Raw: Number(row.data.mq136Raw) })),
    nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify([last.updated_at, last.document_path])).toString('base64url') : null,
  };
}
