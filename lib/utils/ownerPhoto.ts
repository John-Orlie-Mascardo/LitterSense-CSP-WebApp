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
  ref,
} from "firebase/storage";
import { storage } from "@/lib/configs/firebase";

import { uploadPhoto } from "./catPhoto";
import { operationalPrimary } from "./operationalMode";
import { primaryPhoto } from "./operationalPhoto";

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
  readonly onProgress?: (percent: number | null) => void;
  readonly signal?: AbortSignal;
}

export async function uploadOwnerPhoto({ uid, file, onProgress, signal }: UploadOwnerPhotoInput): Promise<{ url: string; path: string }> {
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(file);
  let blob: Blob;
  try {
    signal?.throwIfAborted();
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare photo");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Unable to prepare photo")), "image/jpeg", 0.9,
    ));
  } finally {
    bitmap.close();
  }
  signal?.throwIfAborted();
  const path = getOwnerPhotoPath(uid, `${Date.now()}-${crypto.randomUUID()}`);
  const url = await uploadPhoto(path, blob, { onProgress, signal, timeoutMs: OWNER_PHOTO_UPLOAD_TIMEOUT_MS });
  return { url, path };
}

export async function deleteOwnerPhoto(uid: string, path: string): Promise<void> {
  if (!canDeleteOwnerPhotoPath(uid, path)) return;
  if (await operationalPrimary()) { await primaryPhoto(path); return; }
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    if (code !== "storage/object-not-found") throw error;
  }
}
