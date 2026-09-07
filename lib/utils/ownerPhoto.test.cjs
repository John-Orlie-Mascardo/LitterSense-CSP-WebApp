/**
 * ownerPhoto.test.cjs
 *
 * Contracts for owner-scoped profile-photo Storage paths and cleanup guards.
 *
 * DONE: deterministic path shape and cross-owner cleanup protection
 * PLACEHOLDER: Firebase transport is covered by Settings integration contracts
 *
 * NEXT: add emulator coverage when authenticated Storage emulators are available.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const modulePath = "lib/utils/ownerPhoto.ts";

test("owner photo storage helper exists", () => {
  assert.equal(fs.existsSync(modulePath), true);
});

const loadOwnerPhotoModule = () => {
  const source = fs.readFileSync(modulePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const testModule = { exports: {} };
  const loadModule = new Function("exports", "module", "require", compiled.outputText);
  loadModule(testModule.exports, testModule, (id) => {
    if (id === "firebase/storage") {
      return {
        deleteObject() {},
        getDownloadURL() {},
        ref() {},
        uploadBytesResumable() {},
      };
    }
    if (id === "@/lib/configs/firebase") return { storage: {} };
    return require(id);
  });
  return testModule.exports;
};

test("builds revisioned owner-scoped profile paths", () => {
  if (!fs.existsSync(modulePath)) return;
  const { getOwnerPhotoPath } = loadOwnerPhotoModule();
  assert.equal(
    getOwnerPhotoPath("owner-1", "revision-2"),
    "users/owner-1/profile/revision-2.jpg",
  );
});

test("allows cleanup only inside the signed-in owner's profile directory", () => {
  if (!fs.existsSync(modulePath)) return;
  const { canDeleteOwnerPhotoPath } = loadOwnerPhotoModule();
  assert.equal(canDeleteOwnerPhotoPath("owner-1", "users/owner-1/profile/old.jpg"), true);
  assert.equal(canDeleteOwnerPhotoPath("owner-1", "users/owner-2/profile/old.jpg"), false);
  assert.equal(canDeleteOwnerPhotoPath("owner-1", "https://provider.example/avatar.jpg"), false);
});
