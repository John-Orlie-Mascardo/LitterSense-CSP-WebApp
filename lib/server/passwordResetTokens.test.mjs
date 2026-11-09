import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");

function load(respond) {
  const requests = [];
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("./passwordResetTokens.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: loaded, exports: loaded.exports, Date, encodeURIComponent, JSON,
    require: (name) => {
      if (name === "node:crypto") return require("node:crypto");
      if (name === "@/lib/utils/smsAccountSync") {
        return { smsStoreRequest: async (path, init = {}) => { requests.push({ path, init }); return respond(path, init); } };
      }
      throw Error("Unknown import " + name);
    },
  });
  return { store: loaded.exports, requests };
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("a new token is random, stored only as its hash, and expires in 30 minutes", async () => {
  const { store, requests } = load(() => new Response(null, { status: 201 }));
  const before = Date.now();
  const token = await store.createResetToken("owner-1", "owner@example.com");
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  const row = JSON.parse(requests[0].init.body);
  assert.equal(requests[0].path, "password_reset_tokens");
  assert.equal(row.token_hash, sha256(token));
  assert.equal(JSON.stringify(row).includes(token), false);
  const ttl = Date.parse(row.expires_at) - before;
  assert.ok(ttl > 29 * 60000 && ttl <= 30 * 60000 + 1000, String(ttl));
});

test("claiming marks the token used only if it is unused and not expired, in one request", async () => {
  const { store, requests } = load(() => Response.json([{ uid: "owner-1", email: "owner@example.com" }]));
  const owner = await store.claimResetToken("raw-token");
  assert.equal(owner.uid, "owner-1");
  assert.equal(requests[0].init.method, "PATCH");
  assert.match(requests[0].path, new RegExp(`token_hash=eq\\.${sha256("raw-token")}`));
  assert.match(requests[0].path, /used_at=is\.null/);
  assert.match(requests[0].path, /expires_at=gt\./);
});

test("an expired, used, or unknown token claims nothing", async () => {
  const { store } = load(() => Response.json([]));
  assert.equal(await store.claimResetToken("raw-token"), null);
});

test("recent-token check looks back one minute for the same account", async () => {
  const { store, requests } = load(() => Response.json([{ token_hash: "x" }]));
  assert.equal(await store.hasRecentResetToken("owner-1"), true);
  assert.match(requests[0].path, /uid=eq\.owner-1/);
  assert.match(requests[0].path, /created_at=gt\./);
});
