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
  readonly onProgress?: (percent: number | null) => void;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export function uploadCatPhoto({ uid, catId, blob, ...options }: UploadCatPhotoInput): Promise<string> {
  return uploadPhoto(getCatPhotoPath(uid, catId), blob, options);
}

export function uploadPhoto(
  path: string,
  blob: Blob,
  { onProgress, signal, timeoutMs = CAT_PHOTO_UPLOAD_TIMEOUT_MS }: {
    onProgress?: (percent: number | null) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (blob.size > 2 * 1024 * 1024) return Promise.reject(new Error("The prepared photo must be 2 MB or smaller."));
  const uploadTask = uploadBytesResumable(ref(storage, path), blob, {
    contentType: blob.type || "image/jpeg",
    cacheControl: "public,max-age=3600",
  });
  onProgress?.(null);
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined = undefined;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
      unsubscribe?.();
      callback();
    };
    const abort = () => {
      settle(() => reject(signal?.reason ?? new DOMException("Upload canceled", "AbortError")));
      uploadTask.cancel();
    };
    const timeoutId = setTimeout(() => {
      settle(() => reject(new Error("The photo upload took too long. Please try again.")));
      uploadTask.cancel();
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    unsubscribe = uploadTask.on("state_changed", (snapshot) => {
      if (!settled) onProgress?.(snapshot.totalBytes > 0
        ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : null);
    }, (error) => settle(() => reject(error)), () => {
      if (!settled) void getDownloadURL(uploadTask.snapshot.ref).then(
        (url) => settle(() => resolve(url)),
        (error) => settle(() => reject(error)),
      );
    });
    if (settled) unsubscribe?.();
    if (signal?.aborted && !settled) abort();
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
