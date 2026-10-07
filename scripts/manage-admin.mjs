import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function manageAdmin(action, targetEmail, dependencies) {
  if (action !== "grant" && action !== "revoke") {
    throw new Error("Action must be grant or revoke.");
  }

  const normalizedEmail = targetEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw new Error("Provide a valid target email.");
  }

  const user = await dependencies.auth.getUserByEmail(normalizedEmail);
  const currentClaims = user.customClaims ?? {};

  if (action === "grant") {
    await dependencies.auth.setCustomUserClaims(user.uid, {
      ...currentClaims,
      admin: true,
    });
  } else {
    const remainingClaims = { ...currentClaims };
    delete remainingClaims.admin;
    await dependencies.auth.setCustomUserClaims(user.uid, remainingClaims);
    await dependencies.auth.revokeRefreshTokens(user.uid);
  }

  await dependencies.writeAudit({
    action: action === "grant" ? "admin_granted" : "admin_revoked",
    actorUid: dependencies.actor.uid,
    actorEmail: dependencies.actor.email,
    targetUid: user.uid,
    targetEmail: user.email ?? normalizedEmail,
    details: { source: "manage-admin-script" },
  });
}

function createDependencies() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_BASE64.");
  }

  const serviceAccount = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8"),
  );
  const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  const firestore = getFirestore(app);

  return {
    auth: getAuth(app),
    actor: {
      uid: `service-account:${serviceAccount.client_email}`,
      email: serviceAccount.client_email,
    },
    writeAudit: async (entry) => {
      await firestore.collection("auditLogs").add({
        ...entry,
        createdAt: FieldValue.serverTimestamp(),
      });
    },
  };
}

async function main() {
  const [, , action = "", targetEmail = ""] = process.argv;
  await manageAdmin(action, targetEmail, createDependencies());
  process.stdout.write(
    `${action === "grant" ? "Granted" : "Revoked"} admin access for ${targetEmail.trim().toLowerCase()}.\n`,
  );
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Admin management failed."}\n`);
    process.exitCode = 1;
  });
}
