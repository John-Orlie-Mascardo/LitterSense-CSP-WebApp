const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadRoute(document) {
  const source = readFileSync(path.join(__dirname, "route.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const reads = [];
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Response,
    process: { env: {} },
    console,
    require: (name) => {
      if (name === "@/lib/configs/firebase-admin") {
        return {
          getAdminFirestore: () => ({
            doc: (documentPath) => {
              reads.push(documentPath);
              return {
                get: async () => ({
                  exists: Boolean(document),
                  data: () => document,
                }),
              };
            },
          }),
        };
      }
      if (name === "firebase/app") {
        return { getApp() {}, getApps: () => [], initializeApp() {} };
      }
      if (name === "firebase/firestore/lite") {
        return { doc() {}, getDoc() {}, getFirestore() {} };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { route: sandboxModule.exports, reads };
}

test("device provisioning reads through server credentials without public Firebase config", async () => {
  const token = "cfg_abcdefghijklmnop";
  const { route, reads } = loadRoute({
    ownerId: "owner-a",
    deviceName: "LitterSense Unit",
    wifiSsid: "Home Wi-Fi",
    wifiPassword: "device-secret",
    updatedAt: { toDate: () => new Date("2026-10-07T08:00:00.000Z") },
  });

  const response = await route.GET(
    new Request(`https://app.example.com/api/device-config/${token}`),
    { params: Promise.resolve({ configToken: token }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(reads, [`deviceConfigs/${token}`]);
  assert.deepEqual(await response.json(), {
    configToken: token,
    deviceName: "LitterSense Unit",
    wifiSsid: "Home Wi-Fi",
    wifiPassword: "device-secret",
    updatedAt: "2026-10-07T08:00:00.000Z",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("device provisioning keeps invalid and unknown tokens closed", async () => {
  const invalid = loadRoute(null);
  const invalidResponse = await invalid.route.GET(
    new Request("https://app.example.com/api/device-config/short"),
    { params: Promise.resolve({ configToken: "short" }) },
  );
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(invalid.reads, []);

  const unknown = loadRoute(null);
  const token = "cfg_unknownabcdefghijkl";
  const unknownResponse = await unknown.route.GET(
    new Request(`https://app.example.com/api/device-config/${token}`),
    { params: Promise.resolve({ configToken: token }) },
  );
  assert.equal(unknownResponse.status, 404);
  assert.deepEqual(unknown.reads, [`deviceConfigs/${token}`]);
});
