import test from "node:test";
import assert from "node:assert/strict";

const moduleUrl = new URL("./manage-admin.mjs", import.meta.url);

function dependencies(user) {
  const events = [];
  return {
    events,
    value: {
      auth: {
        getUserByEmail: async (email) => {
          events.push(["getUserByEmail", email]);
          return user;
        },
        setCustomUserClaims: async (uid, claims) => {
          events.push(["setCustomUserClaims", uid, claims]);
        },
        revokeRefreshTokens: async (uid) => {
          events.push(["revokeRefreshTokens", uid]);
        },
      },
      writeAudit: async (entry) => {
        events.push(["writeAudit", entry]);
      },
      actor: {
        uid: "service-account:firebase-admin@example.com",
        email: "firebase-admin@example.com",
      },
    },
  };
}

test("grant preserves existing claims and records the target account", async () => {
  const { manageAdmin } = await import(moduleUrl);
  const deps = dependencies({
    uid: "admin-2",
    email: "new-admin@example.com",
    customClaims: { paid: true },
  });

  await manageAdmin("grant", "NEW-ADMIN@example.com", deps.value);

  assert.deepEqual(deps.events, [
    ["getUserByEmail", "new-admin@example.com"],
    ["setCustomUserClaims", "admin-2", { paid: true, admin: true }],
    ["writeAudit", {
      action: "admin_granted",
      actorUid: "service-account:firebase-admin@example.com",
      actorEmail: "firebase-admin@example.com",
      targetUid: "admin-2",
      targetEmail: "new-admin@example.com",
      details: { source: "manage-admin-script" },
    }],
  ]);
});

test("revoke removes only the admin claim, revokes refresh tokens, and records it", async () => {
  const { manageAdmin } = await import(moduleUrl);
  const deps = dependencies({
    uid: "admin-2",
    email: "admin@example.com",
    customClaims: { admin: true, paid: true },
  });

  await manageAdmin("revoke", "admin@example.com", deps.value);

  assert.deepEqual(deps.events, [
    ["getUserByEmail", "admin@example.com"],
    ["setCustomUserClaims", "admin-2", { paid: true }],
    ["revokeRefreshTokens", "admin-2"],
    ["writeAudit", {
      action: "admin_revoked",
      actorUid: "service-account:firebase-admin@example.com",
      actorEmail: "firebase-admin@example.com",
      targetUid: "admin-2",
      targetEmail: "admin@example.com",
      details: { source: "manage-admin-script" },
    }],
  ]);
});

test("management rejects unsupported actions and malformed target emails", async () => {
  const { manageAdmin } = await import(moduleUrl);
  const deps = dependencies({ uid: "unused", email: "unused@example.com" });

  await assert.rejects(
    manageAdmin("promote", "admin@example.com", deps.value),
    /Action must be grant or revoke/,
  );
  await assert.rejects(
    manageAdmin("grant", "not-an-email", deps.value),
    /valid target email/,
  );
  assert.deepEqual(deps.events, []);
});
