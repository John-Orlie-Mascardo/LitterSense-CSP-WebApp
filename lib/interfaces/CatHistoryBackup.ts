import type { BehaviorStateId } from '@/lib/presentation/behaviorStates';

export type BackupVisitState = 'primary_saved' | 'pending' | 'claimed' | 'conflict' | 'cancelled';
export type ProfileBackup = { catId: string; cat: Record<string, unknown>; details: Record<string, unknown> };
export type CatalogBackup = { revision: number; profiles: ProfileBackup[]; sourceReadAt: string; complete: boolean };
export type VisitBackup = { sessionId: string; catId: string; data: Record<string, unknown>; digest: string; tokenHash: string | null; state: BackupVisitState };
export type BackupProgress = { cursor: string | null; scanned: number; complete: boolean; checkedAt: string; lastError: string | null };
export type BackupPage<T> = { rows: T[]; nextCursor: string | null; source: 'firebase' | 'supabase' | 'mixed'; complete: boolean; backedUpAt: string | null; pendingCount: number };
export type ClaimedVisit = VisitBackup & { ownerId: string; claimId: string; leaseUntil: string };
export type HistoryQuery = { startDate: string; endDate: string; sort: 'asc' | 'desc'; catId?: string; states?: BehaviorStateId[]; cursor?: string; limit: number };
