/**
 * CatSessionLog.ts
 *
 * Per-cat session log summary counts, one doc per cat in Firestore.
 * Derived client-side from the sessions collection and written back so
 * hardware-generated sessions are automatically reflected.
 *
 * Firestore path: users/{uid}/catSessionLog/{catId}
 */

export interface CatSessionLog {
  catId: string;
  /** Sessions classified as Normal */
  normal: number;
  /** Sessions classified as Watch */
  watch: number;
  /** Sessions classified as Abnormal */
  abnormal: number;
  /** Sessions classified as Incomplete (too short / false entry) */
  incomplete: number;
  /** Sessions classified as Insufficient data (daily summaries, no baseline) */
  insufficient: number;
  /** Sessions with no matched RFID tag */
  unattributed: number;
  updatedAt?: string;
}
