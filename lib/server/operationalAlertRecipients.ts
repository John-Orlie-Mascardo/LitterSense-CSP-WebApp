import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
import { projectOperationalAccount } from './operationalRecords';

// Claim only repaired owners: old mirrors must not cancel or hide canonical alerts.
export async function claimOperationalAlerts<T>(channel: 'sms' | 'push', ownerId?: string): Promise<T[]> {
  const column = channel === 'sms' ? 'status' : 'push_status';
  const response = await smsStoreRequest(`sms_outbox?${column}=eq.pending&select=owner_id&order=created_at.asc&limit=100${ownerId ? `&owner_id=eq.${encodeURIComponent(ownerId)}` : ''}`);
  if (!response.ok) throw new Error('Unable to read pending alert recipients');
  const owners = [...new Set((await response.json() as Array<{ owner_id: string }>).map(row => row.owner_id))];
  const records: T[] = [];
  for (const uid of owners) {
    try {
      await projectOperationalAccount(uid);
      const claimed = await smsStoreRequest(`rpc/claim_${channel}_outbox`, { method: 'POST', body: JSON.stringify({ p_owner_id: uid, p_limit: 2 - records.length }) });
      if (!claimed.ok) throw new Error('Unable to claim repaired alerts');
      records.push(...await claimed.json() as T[]);
    } catch { console.warn(`[${channel}] Recipient check unavailable; unsent alerts retained for retry.`); }
    if (records.length >= 2) break;
  }
  return records;
}
