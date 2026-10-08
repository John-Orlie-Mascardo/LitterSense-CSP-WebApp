import { assertOperationalReady, OperationalError } from './operationalStore';
import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
export async function updateOperationalPushTokens(uid: string, tokens: string[], remove: boolean) {
  await assertOperationalReady(uid);
  for (const token of tokens) {
    const response = await smsStoreRequest('rpc/operational_register_push_token', { method: 'POST', body: JSON.stringify({ p_owner_id: uid, p_token: token, p_remove: remove }) });
    if (!response.ok) throw new OperationalError('Push token registration unavailable');
  }
}
