/**
 * catPhoto.test.cjs
 *
 * Pure contracts for cat-photo validation, conversion, and owner-scoped paths.
 *
 * DONE: formats, size ceiling, paths, conversion, progress, and timeout cancellation
 * PLACEHOLDER: none
 *
 * NEXT: extend format fixtures only when the product accepts another image type.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/catPhoto.ts", "utf8");

const loadCatPhotoModule = (storageOverrides = {}) => {
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
        ...storageOverrides,
      };
    }
    if (id === "@/lib/configs/firebase") return { storage: {} };
    return require(id);
  });
  return testModule.exports;
};

const testModule = { exports: loadCatPhotoModule() };

const {
  MAX_CAT_PHOTO_BYTES,
  dataUrlToBlob,
  getCatPhotoPath,
  validateCatPhotoFile,
} = testModule.exports;

test("accepts common images and rejects unsupported or oversized files", () => {
  assert.equal(validateCatPhotoFile({ type: "image/jpeg", size: 1024 }), null);
  assert.equal(validateCatPhotoFile({ type: "image/webp", size: 1024 }), null);
  assert.equal(
    validateCatPhotoFile({ type: "application/pdf", size: 1024 }),
    "Choose a JPEG, PNG, WebP, or GIF image.",
  );
  assert.equal(
    validateCatPhotoFile({ type: "image/png", size: MAX_CAT_PHOTO_BYTES + 1 }),
    "Choose an image smaller than 10 MB.",
  );
});

test("accepts the exact 10 MB boundary", () => {
  assert.equal(
    validateCatPhotoFile({ type: "image/gif", size: 10 * 1024 * 1024 }),
    null,
  );
});

test("builds only the owner-scoped deterministic avatar path", () => {
  assert.equal(
    getCatPhotoPath("owner-1", "cat-2"),
    "users/owner-1/cats/cat-2/photo.jpg",
  );
});

test("converts a cropped JPEG data URL to a Blob", async () => {
  const blob = await dataUrlToBlob("data:image/jpeg;base64,/9j/2Q==");
  assert.equal(blob.type, "image/jpeg");
  assert.equal(blob.size, 4);
});

test("resumable upload reports initial and transferred-byte progress before resolving", async () => {
  let nextObserver;
  let completeObserver;
  const uploadTask = {
    snapshot: { ref: { path: "photo" } },
    cancel() {},
    on(_event, next, _error, complete) {
      nextObserver = next;
      completeObserver = complete;
    },
  };
  const { uploadCatPhoto } = loadCatPhotoModule({
    ref: () => ({ path: "photo" }),
    uploadBytesResumable: () => uploadTask,
    getDownloadURL: async () => "https://storage.example/cat.jpg",
  });
  const progress = [];
  const resultPromise = uploadCatPhoto({
    uid: "owner",
    catId: "cat",
    blob: new Blob(["photo"], { type: "image/jpeg" }),
    onProgress: (value) => progress.push(value),
  });

  nextObserver({ bytesTransferred: 1, totalBytes: 4 });
  completeObserver();

  assert.equal(await resultPromise, "https://storage.example/cat.jpg");
  assert.deepEqual(progress, [0, 25]);
});

test("resumable upload cancels and rejects when its deadline expires", async () => {
  let cancelCalled = false;
  const uploadTask = {
    snapshot: { ref: { path: "photo" } },
    cancel() { cancelCalled = true; },
    on() {},
  };
  const { uploadCatPhoto } = loadCatPhotoModule({
    ref: () => ({ path: "photo" }),
    uploadBytesResumable: () => uploadTask,
  });
  const uploadPromise = uploadCatPhoto({
    uid: "owner",
    catId: "cat",
    blob: new Blob(["photo"], { type: "image/jpeg" }),
    timeoutMs: 5,
  });

  await assert.rejects(
    Promise.race([
      uploadPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("test deadline")), 40)),
    ]),
    /photo upload took too long/i,
  );
  assert.equal(cancelCalled, true);
});
