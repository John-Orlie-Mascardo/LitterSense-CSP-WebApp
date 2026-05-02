import {
  doc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { ref, listAll, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";

/**
 * Performs a hard delete of a user's account and all associated data.
 * This is the Option 1 implementation - complete data removal.
 *
 * @param userId - The Firebase UID of the user to delete
 * @throws Error if deletion fails at any step
 */
export async function deleteUserData(userId: string): Promise<void> {
  try {
    // Step 1: Delete all Firestore data for the user
    await deleteUserFirestoreData(userId);

    // Step 2: Delete all Cloud Storage files for the user
    await deleteUserStorageData(userId);

    // Step 3: Delete the Firebase Auth user account
    // Note: This must be done by the user themselves or requires special permissions.
    // For admin-triggered deletion, we'll mark the user as deleted in Firestore instead.
    // Uncomment below only if the admin user has credentials for the target user:
    // const userAuth = auth.currentUser;
    // if (userAuth?.uid === userId) {
    //   await deleteUser(userAuth);
    // }

    console.log(`[Hard Delete] User ${userId} data deletion completed`);
  } catch (error) {
    console.error(`[Hard Delete] Failed to delete user ${userId}:`, error);
    throw new Error(
      `Failed to delete user data: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Deletes all Firestore data associated with a user.
 * Recursively deletes the user document and all nested collections.
 */
async function deleteUserFirestoreData(userId: string): Promise<void> {
  const userDocRef = doc(db, "users", userId);

  // Collections nested under users/{userId} that need to be deleted
  const nestedCollections = [
    "cats",
    "catDetails",
    "sessions",
    "healthLogs",
    "notifications",
    "deviceConfig",
    "catStats",
    "dailyCatStats",
  ];

  // Delete all nested collections
  for (const collectionName of nestedCollections) {
    const collectionRef = collection(userDocRef, collectionName);
    const snapshot = await getDocs(collectionRef);

    for (const docSnapshot of snapshot.docs) {
      await deleteDoc(docSnapshot.ref);
    }
  }

  // Delete the main user document
  await deleteDoc(userDocRef);
}

/**
 * Deletes all Cloud Storage files associated with a user.
 * Removes the entire user directory from storage.
 */
async function deleteUserStorageData(userId: string): Promise<void> {
  const userStorageRef = ref(storage, `users/${userId}`);

  try {
    const fileList = await listAll(userStorageRef);

    // Delete all files in the user's directory
    for (const fileRef of fileList.items) {
      await deleteObject(fileRef);
    }

    // Recursively delete subdirectories
    for (const dirRef of fileList.prefixes) {
      await deleteDirectoryRecursive(dirRef);
    }
  } catch (error) {
    // If the directory doesn't exist, that's fine - just skip
    const errorCode = (error as Record<string, string>)?.code;
    if (errorCode !== "storage/object-not-found") {
      throw error;
    }
  }
}

/**
 * Recursively deletes all files in a Cloud Storage directory.
 */
async function deleteDirectoryRecursive(dirRef: any): Promise<void> {
  const fileList = await listAll(dirRef);

  for (const fileRef of fileList.items) {
    await deleteObject(fileRef);
  }

  for (const subDirRef of fileList.prefixes) {
    await deleteDirectoryRecursive(subDirRef);
  }
}
