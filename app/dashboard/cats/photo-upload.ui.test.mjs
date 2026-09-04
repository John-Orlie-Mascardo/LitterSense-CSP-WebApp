/**
 * photo-upload.ui.test.mjs
 *
 * Source contracts for owner-friendly cat-photo Storage flows.
 *
 * DONE: validation, accepted formats, upload progress, URL persistence, error copy
 * PLACEHOLDER: none
 *
 * NEXT: add browser interaction coverage when Firebase emulator tests are available.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const catsSource = readFileSync(join(currentDir, "page.tsx"), "utf8");
const detailSource = readFileSync(
  join(currentDir, "[catId]", "CatDetailClient.tsx"),
  "utf8",
);
const contextSource = readFileSync(
  join(currentDir, "..", "..", "..", "lib", "contexts", "CatContext.tsx"),
  "utf8",
);

test("cat forms validate files and upload cropped blobs to Storage", () => {
  for (const source of [catsSource, detailSource]) {
    assert.match(source, /validateCatPhotoFile/);
    assert.match(source, /dataUrlToBlob/);
    assert.match(source, /uploadCatPhoto/);
    assert.match(source, /uploadProgress/);
    assert.match(source, /We couldn't upload that photo\. Please try again\./);
  }
});

test("newly selected photos persist Storage URLs instead of fresh data URIs", () => {
  assert.match(catsSource, /avatar: uploadedPhotoUrl/);
  assert.match(detailSource, /catUpdates\.avatar = uploadedPhotoUrl/);
  assert.doesNotMatch(catsSource, /avatar:\s*croppedDataUrl/);
  assert.doesNotMatch(detailSource, /avatar:\s*croppedDataUrl/);
});

test("photo inputs declare the shared accepted image types", () => {
  assert.match(catsSource, /accept=\{CAT_PHOTO_ACCEPT\}/);
  assert.match(detailSource, /accept=\{CAT_PHOTO_ACCEPT\}/);
});

test("photo removal and cat deletion clean up the owner-scoped object", () => {
  assert.match(detailSource, /deleteCatPhoto\(user\.uid, catId\)/);
  assert.match(contextSource, /deleteCatPhoto\(user\.uid, id\)/);
});

test("editing without a new photo omits avatar from the cat update", () => {
  assert.match(detailSource, /const catUpdates: Partial<Cat> = \{\s*name:/);
  assert.match(detailSource, /if \(uploadedPhotoUrl\) catUpdates\.avatar = uploadedPhotoUrl/);
  assert.match(detailSource, /else if \(isEditPhotoRemoved\) catUpdates\.avatar = null/);
  assert.doesNotMatch(detailSource, /updateCat\(catId, \{ name: editForm\.name\.trim\(\), avatar: nextAvatar \}\)/);
});
