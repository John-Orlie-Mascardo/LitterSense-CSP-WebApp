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

const loadOwnerPhotoModule = (uploadPhoto = () => {}) => {
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
    if (id === "./catPhoto") return { uploadPhoto };
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

test("profile photos resize proportionally and pass cancellation to the shared uploader", async () => {
  const oldDocument = global.document;
  const oldBitmap = global.createImageBitmap;
  let closed = false;
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob: (callback) => callback(new Blob(["jpeg"], { type: "image/jpeg" })),
  };
  global.document = { createElement: () => canvas };
  global.createImageBitmap = async () => ({ width: 4000, height: 3000, close: () => { closed = true; } });
  try {
    const controller = new AbortController();
    const { uploadOwnerPhoto } = loadOwnerPhotoModule(async (path, blob, options) => {
      assert.match(path, /^users\/owner\/profile\/.+\.jpg$/);
      assert.equal(blob.type, "image/jpeg");
      assert.equal(options.signal, controller.signal);
      return "https://storage.example/profile.jpg";
    });
    const result = await uploadOwnerPhoto({ uid: "owner", file: new File(["input"], "photo.jpg"), signal: controller.signal });
    assert.equal(canvas.width, 512);
    assert.equal(canvas.height, 384);
    assert.equal(closed, true);
    assert.equal(result.url, "https://storage.example/profile.jpg");
  } finally {
    global.document = oldDocument;
    global.createImageBitmap = oldBitmap;
  }
});

test("allows cleanup only inside the signed-in owner's profile directory", () => {
  if (!fs.existsSync(modulePath)) return;
  const { canDeleteOwnerPhotoPath } = loadOwnerPhotoModule();
  assert.equal(canDeleteOwnerPhotoPath("owner-1", "users/owner-1/profile/old.jpg"), true);
  assert.equal(canDeleteOwnerPhotoPath("owner-1", "users/owner-2/profile/old.jpg"), false);
  assert.equal(canDeleteOwnerPhotoPath("owner-1", "https://provider.example/avatar.jpg"), false);
});
