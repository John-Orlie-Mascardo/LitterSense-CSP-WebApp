/**
 * ownerPhoto.ts
 *
 * Owns Firebase Storage uploads and cleanup for owner profile photos.
 *
 * DONE: owner-scoped revision paths, resumable progress, timeout settlement,
 * download-URL resolution, and cross-owner cleanup protection
 * PLACEHOLDER: none
 *
 * NEXT: Firebase owners must deploy the matching Storage rules before hosted use.
 */

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { storage } from "@/lib/configs/firebase";

export const OWNER_PHOTO_UPLOAD_TIMEOUT_MS = 45_000;

export function getOwnerPhotoPath(uid: string, revision: string): string {
  return `users/${uid}/profile/${revision}.jpg`;
}

export function canDeleteOwnerPhotoPath(uid: string, path: string): boolean {
  return path.startsWith(`users/${uid}/profile/`) && !path.includes("..");
}

export interface UploadOwnerPhotoInput {
  readonly uid: string;
  readonly file: File;
  readonly onProgress?: (percent: number) => void;
}

export function uploadOwnerPhoto({
  uid,
  file,
  onProgress,
}: UploadOwnerPhotoInput): Promise<{ url: string; path: string }> {
  const revision = `${Date.now()}-${crypto.randomUUID()}`;
  const path = getOwnerPhotoPath(uid, revision);
  const uploadTask = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type,
    cacheControl: "public,max-age=3600",
  });

  onProgress?.(0);
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = setTimeout(() => {
      settle(() => reject(new Error(
        "The profile photo upload took too long. Please try again.",
      )));
      uploadTask.cancel();
    }, OWNER_PHOTO_UPLOAD_TIMEOUT_MS);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = snapshot.totalBytes === 0
          ? 0
          : Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(progress);
      },
      (error) => settle(() => reject(error)),
      () => {
        void getDownloadURL(uploadTask.snapshot.ref).then(
          (url) => settle(() => resolve({ url, path })),
          (error) => settle(() => reject(error)),
        );
      },
    );
  });
}

export async function deleteOwnerPhoto(uid: string, path: string): Promise<void> {
  if (!canDeleteOwnerPhotoPath(uid, path)) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    if (code !== "storage/object-not-found") throw error;
  }
}
