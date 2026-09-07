/**
 * catPhoto.ts
 *
 * Validates cat photos and owns their Firebase Storage lifecycle.
 *
 * DONE: common-format validation, 10 MB ceiling, resumable upload progress,
 * timeout cancellation, deterministic owner-scoped paths, and safe cleanup
 * PLACEHOLDER: none
 *
 * NEXT: Firebase owners must deploy the reviewed Storage rules before hosted use.
 */

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { storage } from "@/lib/configs/firebase";

export const MAX_CAT_PHOTO_BYTES = 10 * 1024 * 1024;
export const CAT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const CAT_PHOTO_UPLOAD_TIMEOUT_MS = 45_000;

const SUPPORTED_CAT_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function validateCatPhotoFile(
  file: Pick<File, "size" | "type">,
): string | null {
  if (!SUPPORTED_CAT_PHOTO_TYPES.has(file.type.toLowerCase())) {
    return "Choose a JPEG, PNG, WebP, or GIF image.";
  }
  if (file.size > MAX_CAT_PHOTO_BYTES) {
    return "Choose an image smaller than 10 MB.";
  }
  return null;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Unable to prepare the selected photo");
  }
  return response.blob();
}

export function getCatPhotoPath(uid: string, catId: string): string {
  return `users/${uid}/cats/${catId}/photo.jpg`;
}

export interface UploadCatPhotoInput {
  readonly uid: string;
  readonly catId: string;
  readonly blob: Blob;
  readonly onProgress?: (percent: number) => void;
  readonly timeoutMs?: number;
}

export function uploadCatPhoto({
  uid,
  catId,
  blob,
  onProgress,
  timeoutMs = CAT_PHOTO_UPLOAD_TIMEOUT_MS,
}: UploadCatPhotoInput): Promise<string> {
  const photoRef = ref(storage, getCatPhotoPath(uid, catId));
  const uploadTask = uploadBytesResumable(photoRef, blob, {
    contentType: "image/jpeg",
    cacheControl: "public,max-age=3600",
  });

  onProgress?.(0);
  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = (url: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(url);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      rejectOnce(new Error("The photo upload took too long. Please try again."));
      uploadTask.cancel();
    }, timeoutMs);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = snapshot.totalBytes === 0
          ? 0
          : Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          );
        onProgress?.(percent);
      },
      rejectOnce,
      () => {
        void getDownloadURL(uploadTask.snapshot.ref).then(resolveOnce, rejectOnce);
      },
    );

  });
}

export async function deleteCatPhoto(uid: string, catId: string): Promise<void> {
  try {
    await deleteObject(ref(storage, getCatPhotoPath(uid, catId)));
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code !== "storage/object-not-found") throw error;
  }
}
