/**
 * catPhoto.test.cjs
 *
 * Pure contracts for cat-photo validation, conversion, and owner-scoped paths.
 *
 * DONE: supported formats, size ceiling, deterministic paths, data-URL conversion
 * PLACEHOLDER: Firebase transport is verified through UI contracts and production build
 *
 * NEXT: extend format fixtures only when the product accepts another image type.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/catPhoto.ts", "utf8");
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
