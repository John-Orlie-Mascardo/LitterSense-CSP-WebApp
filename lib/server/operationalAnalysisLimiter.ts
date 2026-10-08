import { randomUUID } from 'node:crypto';
import { assertOperationalReady, commitOperational, readOperationalRecord, retryOperational, setOperational } from './operationalStore';
export function createOperationalAnalysisLimiter(cooldownMs: number) {
  return {
    async begin(uid: string, now = Date.now()) {
      await assertOperationalReady(uid);
      return retryOperational(async () => {
        const path = `users/${uid}/internal/predictiveHealthLimit`, row = await readOperationalRecord(uid, path), state = row?.data ?? {};
        const leaseUntil = Number(state.leaseUntilMs ?? 0), remaining = Number(state.lastSuccessfulAtMs ?? 0) + cooldownMs - now;
        if (leaseUntil > now) return { allowed: false as const, reason: 'in_progress', retryAfterSeconds: Math.ceil((leaseUntil - now) / 1000) };
        if (remaining > 0) return { allowed: false as const, reason: 'cooldown', retryAfterSeconds: Math.ceil(remaining / 1000) };
        const leaseId = randomUUID();
        await commitOperational(uid, [setOperational(path, row, { ...state, leaseId, leaseUntilMs: now + 45000 })]);
        return { allowed: true as const, leaseId };
      });
    },
    async finish(uid: string, leaseId: string, succeeded: boolean, now = Date.now()) {
      await retryOperational(async () => {
        const path = `users/${uid}/internal/predictiveHealthLimit`, row = await readOperationalRecord(uid, path);
        if (!row || row.data.leaseId !== leaseId) return;
        await commitOperational(uid, [setOperational(path, row, { ...row.data, leaseId: '', leaseUntilMs: 0, ...(succeeded ? { lastSuccessfulAtMs: now } : {}) })]);
      });
    },
  };
}
