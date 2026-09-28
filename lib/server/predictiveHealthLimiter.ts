import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

// A lease survives process restarts but expires if the function never finishes.
const LEASE_MS = 45_000;

export function createPredictiveHealthRateLimiter(db: Firestore, cooldownMs: number) {
  const refFor = (uid: string) => db.collection("predictiveHealthLimits").doc(uid);
  return {
    async begin(uid: string, now?: number) {
      const ref = refFor(uid);
      const leaseId = randomUUID();
      return db.runTransaction(async (transaction) => {
        const state = (await transaction.get(ref)).data() ?? {};
        const currentMs = now ?? Date.now();
        if (state.leaseUntilMs > currentMs) {
          return { allowed: false as const, reason: "in_progress" as const,
            retryAfterSeconds: Math.ceil((state.leaseUntilMs - currentMs) / 1000) };
        }
        const remainingMs = typeof state.lastSuccessfulAtMs === "number"
          ? state.lastSuccessfulAtMs + cooldownMs - currentMs : 0;
        if (remainingMs > 0) {
          return { allowed: false as const, reason: "cooldown" as const,
            retryAfterSeconds: Math.ceil(remainingMs / 1000) };
        }
        transaction.set(ref, { leaseId, leaseUntilMs: currentMs + LEASE_MS }, { merge: true });
        return { allowed: true as const, leaseId };
      });
    },
    async finish(uid: string, leaseId: string, succeeded: boolean, now = Date.now()) {
      const ref = refFor(uid);
      await db.runTransaction(async (transaction) => {
        const state = (await transaction.get(ref)).data();
        if (state?.leaseId !== leaseId) return;
        transaction.set(ref, {
          leaseId: "", leaseUntilMs: 0,
          ...(succeeded ? { lastSuccessfulAtMs: now } : {}),
        }, { merge: true });
      });
    },
  };
}
