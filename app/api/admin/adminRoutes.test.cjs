const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadRoute(file, authorizeAdminRequest) {
  const source = readFileSync(path.join(__dirname, file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Request,
    Response,
    URL,
    console,
    process,
    require: (name) => {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "@/lib/server/adminAuth") return { authorizeAdminRequest };
      if (name === "@/lib/configs/firebase-admin") {
        return {
          getAdminAuth: () => ({}),
          getAdminFirestore: () => ({}),
          getAdminStorageBucket: () => ({}),
        };
      }
      if (name === "@/lib/server/auditLog") return { writeAuditLog: async () => {} };
      if (name === "firebase-admin/firestore") {
        return { getFirestore: () => ({}) };
      }
      if (name === "firebase-admin/app") return { getApps: () => [{}] };
      if (name === "@/lib/utils/smsAccountSync") {
        return { smsStoreRequest: async () => ({ ok: true }) };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

for (const [name, file, body] of [
  ["delete-user", "delete-user/route.ts", { userId: "owner-1" }],
  ["update-password", "update-password/route.ts", { targetEmail: "owner@example.com", newPassword: "password123" }],
]) {
  test(`${name} returns the shared admin authorization response before privileged work`, async () => {
    let calls = 0;
    const route = loadRoute(file, async () => {
      calls += 1;
      return {
        ok: false,
        response: Response.json({ error: "Forbidden." }, { status: 403 }),
      };
    });

    const response = await route.POST(new Request(`https://app.example.com/api/admin/${name}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer owner-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }));

    assert.equal(response.status, 403);
    assert.equal(calls, 1);
  });
}
