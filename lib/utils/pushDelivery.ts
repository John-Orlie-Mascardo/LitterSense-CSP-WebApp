import { ownerText } from '@/lib/presentation/ownerText';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { getAdminAuth, getAdminFirestore, getAdminMessaging } from '@/lib/configs/firebase-admin';
import { smsStoreRequest } from './smsAccountSync';
import { smsDeliveryDecision } from './smsDelivery';
import { buildAlertMessage, type AlertContext } from './smsTemplates';
import { rfidPrimaryEnabled } from '@/lib/server/operationalStore';
import { updateOperationalPushTokens } from '@/lib/server/operationalPushTokens';
import { projectOperationalAccount } from '@/lib/server/operationalRecords';
import { claimOperationalAlerts } from '@/lib/server/operationalAlertRecipients';

type PushRecord = { id: string; owner_id: string; cat_id: string | null; reason: string; event_key: string; context: AlertContext & { title?: string; body?: string; url?: string; source?: string; targetTokenHash?: string }; created_at: string };
type PushAccount = { fcm_tokens: string[]; phone_number: string; notifications: Omit<Parameters<typeof smsDeliveryDecision>[0]['notifications'], 'perCat'> & { rfidVisitAlerts?: boolean; litterLevelWarnings?: boolean; perCat?: Array<{ catId: string; healthAlerts?: boolean; visitAlerts?: boolean }> }; cats: Array<{ id: string; name?: string }> };
export function invalidPushToken(code?: string) {
  return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
}
export function pushDeliveryDecision(account: PushAccount, record: PushRecord) {
  const prefs = account.notifications;
  if (record.reason === 'Saved notification') {
    if (record.cat_id && !account.cats.some(cat => cat.id === record.cat_id)) return 'cancel';
    if (record.context.source === 'dashboard_abnormal' && (!record.cat_id || prefs.healthAlerts === false || prefs.perCat?.some(pref => pref.catId === record.cat_id && pref.healthAlerts === false))) return 'cancel';
    if (record.context.source === 'rfid_visit' && (prefs.rfidVisitAlerts !== true || prefs.perCat?.some(pref => pref.catId === record.cat_id && pref.visitAlerts === false))) return 'cancel';
    if (record.context.source === 'litter_level' && prefs.litterLevelWarnings === false) return 'cancel';
    return smsDeliveryDecision({ ...account, phone_number: '+639000000000' }, { ...record, cat_id: null, message: '' });
  }
  return smsDeliveryDecision({ ...account, phone_number: '+639000000000' }, { ...record, message: '' });
}
export async function processPushOutbox(ownerId?: string) {
  let records: PushRecord[];
  if (rfidPrimaryEnabled()) records = await claimOperationalAlerts<PushRecord>('push', ownerId);
  else {
    const claimed = await smsStoreRequest('rpc/claim_push_outbox', { method: 'POST', body: JSON.stringify({ p_owner_id: ownerId ?? null, p_limit: 2 }) });
    if (!claimed.ok) throw new Error('Unable to claim push alerts');
    records = await claimed.json() as PushRecord[];
  }
  for (const record of records) {
    let providerAttempted = false;
    const patch = async (status: string, context?: Record<string, unknown>) => {
      const response = await smsStoreRequest(`sms_outbox?id=eq.${encodeURIComponent(record.id)}&push_status=eq.sending`, { method: 'PATCH', body: JSON.stringify({ push_status: status, ...(context ? { context } : {}) }) });
      if (!response.ok) throw new Error('Unable to record push delivery');
    };
    try {
    if (rfidPrimaryEnabled()) await projectOperationalAccount(record.owner_id);
    const response = await smsStoreRequest(`sms_accounts?owner_id=eq.${encodeURIComponent(record.owner_id)}&select=fcm_tokens,phone_number,notifications,cats`);
    if (!response.ok) throw new Error('Unable to verify push recipient');
    const account = (await response.json() as PushAccount[])[0];
    if (!account || !account.fcm_tokens.length) { await patch('cancelled'); continue; }
    // Push does not require a phone number. The same alert and quiet-hour rules apply.
    const decision = pushDeliveryDecision(account, record);
    if (decision !== 'send') { await patch(decision === 'defer' ? 'pending' : 'cancelled'); continue; }
    try {
      if ((await getAdminAuth().getUser(record.owner_id)).disabled) { await patch('cancelled'); continue; }
    } catch (error) {
      const deleted = typeof error === 'object' && error !== null && 'code' in error && error.code === 'auth/user-not-found';
      await patch(deleted ? 'cancelled' : 'pending'); continue;
    }
    const tokens = account.fcm_tokens.filter(token => !record.context.targetTokenHash || createHash('sha256').update(token).digest('hex') === record.context.targetTokenHash).slice(0, 20);
    if (!tokens.length) { await patch('cancelled'); continue; }
    const gasAlert = record.reason === 'Ammonia detected' || record.reason === 'Hydrogen sulfide detected';
    const providerStartedAt = new Date().toISOString();
    let result;
    try {
      providerAttempted = true;
      result = await getAdminMessaging().sendEachForMulticast({ tokens, notification: { title: ownerText(record.context.title ?? 'LitterSense Alert'), body: ownerText(record.context.body ?? buildAlertMessage(record.reason, { ...record.context, occurredAt: record.context.occurredAt ?? record.created_at, catName: account.cats.find(cat => cat.id === record.cat_id)?.name })) }, data: { eventKey: record.event_key, url: record.context.url?.startsWith('/dashboard') ? record.context.url : '/dashboard' }, webpush: { headers: { TTL: '3600', Urgency: 'high' } } });
    } catch { await patch('unknown'); continue; }
    // Never retry a whole batch after some devices already received it.
    // Provider acceptance is not proof of display on the phone. Retain each gas target's outcome.
    const providerAcceptedAt = new Date().toISOString();
    const queueToProviderMs = Date.parse(providerStartedAt) - Date.parse(record.created_at);
    const providerMs = Date.parse(providerAcceptedAt) - Date.parse(providerStartedAt);
    // No tokens, owner details or message contents in timing logs.
    console.info('[alert timing] Push provider', { source: gasAlert ? 'gas' : 'visit', queueToProviderMs, providerMs, acceptedDevices: result.successCount });
    await patch(result.successCount ? 'sent' : 'failed', {
      ...record.context,
      deliveryTiming: { queuedAt: record.created_at, providerStartedAt, providerAcceptedAt, queueToProviderMs, providerMs },
      ...(gasAlert ? { pushDelivery: { attemptedAt: providerAcceptedAt, devices: tokens.map((token, index) => ({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        accepted: result.responses[index]?.success === true,
        ...(result.responses[index]?.error ? { errorCode: result.responses[index].error!.code } : {}),
      })) } } : {}),
    });
    const invalid = tokens.filter((_, index) => invalidPushToken(result.responses[index]?.error?.code));
    for (const token of rfidPrimaryEnabled() ? [] : invalid) {
      const removed = await smsStoreRequest('rpc/register_push_token', { method: 'POST', body: JSON.stringify({ p_owner_id: record.owner_id, p_token: token, p_remove: true }) });
      if (!removed.ok) throw new Error('Unable to remove expired push token');
    }
    if (invalid.length) {
      try { if (rfidPrimaryEnabled()) await updateOperationalPushTokens(record.owner_id, invalid, true); else await getAdminFirestore().doc(`users/${record.owner_id}`).update({ fcmTokens: FieldValue.arrayRemove(...invalid) }); }
      catch { console.warn('[push] Expired-token profile cleanup awaits availability.'); }
    }
    } catch {
      try { await patch(providerAttempted ? 'unknown' : 'pending'); }
      catch { console.warn('[push] Delivery state unavailable; reconciliation required.'); }
    }
  }
  return { processed: records.length };
}
