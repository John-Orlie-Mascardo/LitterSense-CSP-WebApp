import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../../../../", import.meta.url);

const PHRASE = "I agree to delete this account.";
const nowSecs = () => Math.floor(Date.now() / 1000);

function transpile(file) {
  return ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function load({ authTime = nowSecs(), requestStatus = 0, primary = true, storageError = null } = {}) {
  const operations = [];
  class OperationalError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const userRef = { listCollections: async () => [], delete: async () => operations.push("legacy-profile") };
  const db = {
    doc: (path) => path.startsWith("users/") ? userRef : { delete: async () => {} },
    collection: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
  };
  const modules = {
    "@/lib/server/operationalStore": { rfidPrimaryEnabled: () => primary, OperationalError },
    "@/lib/server/operationalAdmin": {
      operationalAdminTransition: async (input) => {
        operations.push(input.action);
        if (requestStatus && input.action === "request") throw new OperationalError("Not actionable", requestStatus);
        return { profile: {}, auditId: "audit" };
      },
    },
    "@/lib/server/operationalDeletion": { deleteOwnerMedia: async () => operations.push("media") },
    "@/lib/utils/accountDeletion": { DELETE_ACCOUNT_PHRASE: PHRASE },
    "@/lib/server/ownerAuth": {
      authorizeOwnerRequest: async () => ({ ok: true, owner: { uid: "owner", email: "owner@example.test", authTime } }),
    },
    "@/lib/configs/firebase-admin": {
      getAdminFirestore: () => db,
      getAdminAuth: () => ({ revokeRefreshTokens: async () => operations.push("revoke"), deleteUser: async () => operations.push("auth") }),
      getAdminStorageBucket: () => ({ deleteFiles: async () => { if (storageError) throw storageError; operations.push("legacy-media"); } }),
    },
  };
  const requireModule = (name) => {
    if (name === "@/lib/server/primaryAccountDeletion") {
      const shared = { exports: {} };
      vm.runInNewContext(transpile("lib/server/primaryAccountDeletion.ts"), {
        module: shared, exports: shared.exports, require: requireModule, Response, console: { error() {} },
      });
      return shared.exports;
    }
    if (!(name in modules)) throw Error("Unknown import " + name);
    return modules[name];
  };
  const route = { exports: {} };
  vm.runInNewContext(transpile("app/api/account/delete/route.ts"), {
    module: route, exports: route.exports, require: requireModule, Request, Response, console: { error() {} },
  });
  const request = (body) => new Request("https://example.test/api/account/delete", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { operations, route: route.exports, request };
}

test("the exact typed phrase deletes the owner's account through the shared deletion steps", async () => {
  const f = load();
  const response = await f.route.POST(f.request({ confirmation: PHRASE }));
  assert.equal(response.status, 200);
  assert.deepEqual(f.operations, ["request", "start", "revoke", "media", "legacy-media", "legacy-profile", "auth", "finish"]);
});

test("a wrong or missing phrase deletes nothing", async () => {
  for (const confirmation of ["i agree to delete this account.", "I agree to delete this account", "", undefined]) {
    const f = load();
    const response = await f.route.POST(f.request({ confirmation }));
    assert.equal(response.status, 400, String(confirmation));
    assert.deepEqual(f.operations, []);
  }
});

test("an old sign-in must sign in again before deleting", async () => {
  const f = load({ authTime: nowSecs() - 6 * 60 });
  const response = await f.route.POST(f.request({ confirmation: PHRASE }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).reauthenticate, true);
  assert.deepEqual(f.operations, []);
});

test("an earlier pending request still lets the owner finish deleting", async () => {
  const f = load({ requestStatus: 409 });
  const response = await f.route.POST(f.request({ confirmation: PHRASE }));
  assert.equal(response.status, 200);
  assert.equal(f.operations[0], "request");
  assert.equal(f.operations[1], "start");
});

test("without the Supabase primary store the route refuses instead of half-deleting", async () => {
  const f = load({ primary: false });
  const response = await f.route.POST(f.request({ confirmation: PHRASE }));
  assert.equal(response.status, 503);
  assert.deepEqual(f.operations, []);
});

test("a Firebase Storage bucket that doesn't exist (photos live in Supabase) doesn't block deletion", async () => {
  const f = load({ storageError: Object.assign(new Error("The specified bucket does not exist."), { code: 404 }) });
  const response = await f.route.POST(f.request({ confirmation: PHRASE }));
  assert.equal(response.status, 200);
  assert.deepEqual(f.operations, ["request", "start", "revoke", "media", "legacy-profile", "auth", "finish"]);
});

test("other Storage errors still stop deletion so nothing is half-removed silently", async () => {
  const f = load({ storageError: Object.assign(new Error("Permission denied"), { code: 403 }) });
  const response = await f.route.POST(f.request({ confirmation: PHRASE }));
  assert.equal(response.status, 500);
  assert.equal(f.operations.includes("auth"), false);
  assert.equal(f.operations.at(-1), "fail");
});
