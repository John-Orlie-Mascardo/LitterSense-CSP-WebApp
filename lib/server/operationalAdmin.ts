import { smsStoreRequest } from '@/lib/utils/smsAccountSync';
import { assertOperationalFoundation, decodeOperational, OperationalError } from './operationalStore';
import type { AuditLogInput } from './auditLog';

export type OperationalAdminTransition = {
  userId: string;
  action: 'request' | 'reject' | 'start' | 'fail' | 'finish';
  actorUid: string;
  actorEmail?: string | null;
  reason?: string;
  error?: string;
};
export type OperationalAdminResult = { profile: Record<string, unknown>; auditId: string | null };

async function adminRpc<T>(name: string, input: unknown): Promise<T> {
  try {
    await assertOperationalFoundation();
    const response = await smsStoreRequest(`rpc/${name}`, { method: 'POST', body: JSON.stringify({ p_input: input }) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const code = typeof body.code === 'string' ? body.code : '';
      const status = code === 'P0002' ? 404 : ['55000', '40001'].includes(code) ? 409 : code === '42501' ? 403 : code === '22023' ? 400 : 503;
      throw new OperationalError(status === 404 ? 'Account profile not found.' : status === 409 ? 'Deletion request is not actionable.' : 'Operational admin storage unavailable.', status, code);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw new OperationalError('Operational admin storage unavailable.');
  }
}

// Call only after owner/admin authorization. The service RPC owns the state transition and its audit transaction.
export async function operationalAdminTransition(input: OperationalAdminTransition): Promise<OperationalAdminResult> {
  const result = await adminRpc<OperationalAdminResult>('operational_admin_transition', input);
  return { ...result, profile: decodeOperational(result.profile) as Record<string, unknown> };
}
export async function writeOperationalAudit(input: AuditLogInput): Promise<string> {
  return adminRpc<string>('operational_write_audit', input);
}
