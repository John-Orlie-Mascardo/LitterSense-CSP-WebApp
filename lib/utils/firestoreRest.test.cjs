const assert = require("node:assert/strict");
const { generateKeyPairSync } = require("node:crypto");
const test = require("node:test");
const { FirestoreRestClient } = require("./firestoreRest.ts");

test("Firestore token exchange and reads have deadlines and propagate network failures", async (t) => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const client = new FirestoreRestClient({
    projectId: "test-project", clientEmail: "test@example.test",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
    tokenUri: "https://oauth.example.test/token",
  });
  const calls = [];
  const mocked = t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    return url.endsWith("/token")
      ? Response.json({ access_token: "test-token", expires_in: 3600 })
      : Response.json({}, { status: 404 });
  });
  assert.equal(await client.getDocument("users/missing"), null);
  assert.equal(calls.length, 2);
  mocked.mock.mockImplementation(async () => { throw new DOMException("Timed out", "TimeoutError"); });
  await assert.rejects(client.getDocument("users/missing"), { name: "TimeoutError" });
});
