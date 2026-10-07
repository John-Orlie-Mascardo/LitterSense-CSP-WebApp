import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/configs/firebase-admin";

export type AuditAction =
  | "admin_login"
  | "admin_granted"
  | "admin_revoked"
  | "deletion_requested"
  | "deletion_approved"
  | "deletion_rejected"
  | "deletion_failed";

export interface AuditLogInput {
  action: AuditAction;
  actorUid: string;
  actorEmail?: string | null;
  targetUid?: string | null;
  targetEmail?: string | null;
  details?: string | Record<string, unknown>;
}

export function buildAuditLogRecord(input: AuditLogInput) {
  return {
    action: input.action,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail ?? null,
    targetUid: input.targetUid ?? null,
    targetEmail: input.targetEmail ?? null,
    details: input.details ?? {},
    createdAt: FieldValue.serverTimestamp(),
  };
}

export async function writeAuditLog(input: AuditLogInput): Promise<string> {
  const saved = await getAdminFirestore()
    .collection("auditLogs")
    .add(buildAuditLogRecord(input));
  return saved.id;
}
