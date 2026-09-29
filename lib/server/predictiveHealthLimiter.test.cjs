const assert = require("node:assert/strict");
const test = require("node:test");
const { createPredictiveHealthRateLimiter } = require("./predictiveHealthLimiter.ts");

test("independent instances share leases and cooldown, recover after failure, and reject stale releases", async () => {
  const documents = new Map();
  let pending = Promise.resolve();
  const db = {
    collection: (name) => ({ doc: (uid) => `${name}/${uid}` }),
    runTransaction(callback) {
      const result = pending.then(() => callback({
        get: async (ref) => ({ data: () => documents.get(ref) }),
        set: (ref, data) => documents.set(ref, { ...documents.get(ref), ...data }),
      }));
      pending = result.catch(() => {});
      return result;
    },
  };
  const first = createPredictiveHealthRateLimiter(db, 15_000);
  const second = createPredictiveHealthRateLimiter(db, 15_000);
  const [started, rejected] = await Promise.all([first.begin("owner-a", 0), second.begin("owner-a", 0)]);
  assert.equal(started.allowed, true);
  assert.equal(rejected.reason, "in_progress");
  assert.equal((await second.begin("owner-b", 0)).allowed, true);
  await first.finish("owner-a", started.leaseId, false, 100);
  const retry = await second.begin("owner-a", 100);
  assert.equal(retry.allowed, true);
  await second.finish("owner-a", retry.leaseId, true, 100);
  assert.deepEqual(await first.begin("owner-a", 5100), {
    allowed: false, reason: "cooldown", retryAfterSeconds: 10,
  });
  const oldLease = await first.begin("owner-a", 15100);
  assert.equal(oldLease.allowed, true);
  const newLease = await second.begin("owner-a", 60100);
  assert.equal(newLease.allowed, true, "a crashed worker must not block the account forever");
  await first.finish("owner-a", oldLease.leaseId, true, 60101);
  assert.equal((await first.begin("owner-a", 60102)).reason, "in_progress");
  await second.finish("owner-a", newLease.leaseId, false, 60103);
  assert.equal((await first.begin("owner-a", 60104)).allowed, true);
});
