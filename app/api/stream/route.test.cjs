const assert = require("node:assert/strict");
const test = require("node:test");
const { registerHooks } = require("node:module");

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "@/lib/utils/sensorEndpointDiagnostics"
      ? "../../../lib/utils/sensorEndpointDiagnostics.ts" : specifier, context);
  },
});

test("camera proxy uses separate stream and capture endpoints and reports failures", async (t) => {
  const originalBase = process.env.ESP32_BASE_URL;
  const originalStream = process.env.ESP32_STREAM_URL;
  const originalVercel = process.env.VERCEL;
  delete process.env.VERCEL;
  process.env.ESP32_BASE_URL = "http://camera.test";
  process.env.ESP32_STREAM_URL = "http://camera.test:81/stream";
  t.after(() => {
    for (const [key, value] of Object.entries({ ESP32_BASE_URL: originalBase, ESP32_STREAM_URL: originalStream, VERCEL: originalVercel })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const { GET } = require("./route.ts");
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(jpeg, {
      headers: { "Content-Type": String(url).endsWith("/capture") ? "image/jpeg" : "multipart/x-mixed-replace; boundary=frame" },
    });
  });

  const capture = await GET(new Request("http://localhost/api/stream?capture=1"));
  assert.equal(fetchMock.mock.calls[0].arguments[0].toString(), "http://camera.test/capture");
  assert.equal(capture.headers.get("Content-Type"), "image/jpeg");
  assert.match(capture.headers.get("Cache-Control"), /no-store/);
  assert.deepEqual(new Uint8Array(await capture.arrayBuffer()), jpeg);

  const stream = await GET(new Request("http://localhost/api/stream"));
  assert.equal(fetchMock.mock.calls[1].arguments[0].toString(), "http://camera.test:81/stream");
  assert.match(stream.headers.get("Content-Type"), /multipart/);
  await stream.body.cancel();

  process.env.VERCEL = "1";
  process.env.ESP32_BASE_URL = "http://192.168.4.1";
  process.env.ESP32_STREAM_URL = "http://192.168.4.1:81/stream";
  const previousCalls = fetchMock.mock.callCount();
  for (const suffix of ["", "?capture=1"]) {
    assert.equal((await GET(new Request(`https://example.test/api/stream${suffix}`))).status, 503);
  }
  assert.equal(fetchMock.mock.callCount(), previousCalls, "Vercel must not fetch LAN camera URLs");

  process.env.ESP32_BASE_URL = "https://camera.example.test";
  process.env.ESP32_STREAM_URL = "https://camera.example.test/stream";
  assert.equal((await GET(new Request("https://example.test/api/stream?capture=1"))).status, 200);

  delete process.env.VERCEL;
  delete process.env.ESP32_STREAM_URL;
  process.env.ESP32_BASE_URL = "http://camera.test:80/";
  const fallback = await GET(new Request("http://localhost/api/stream"));
  assert.equal(fetchMock.mock.calls.at(-1).arguments[0].toString(), "http://camera.test:81/stream");
  await fallback.body.cancel();

  fetchMock.mock.mockImplementation(async () => { throw new Error("Camera unavailable"); });
  assert.equal((await GET(new Request("http://localhost/api/stream"))).status, 503);
});
