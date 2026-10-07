export interface AdminAuditEntry {
  id: string;
  action: string;
  actorUid: string | null;
  actorEmail: string | null;
  targetUid: string | null;
  targetEmail: string | null;
  details: string | Record<string, unknown>;
  createdAt: string;
}

type TimestampLike = { toDate: () => Date };

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function timestampIso(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return (value as TimestampLike).toDate().toISOString();
  }
  return typeof value === "string" ? value : "";
}

export function readAdminAuditEntry(
  id: string,
  data: Record<string, unknown>,
): AdminAuditEntry {
  const details = data.details;
  const safeDetails =
    typeof details === "string" ||
    (typeof details === "object" && details !== null && !Array.isArray(details))
      ? (details as string | Record<string, unknown>)
      : {};

  return {
    id,
    action: optionalString(data.action) ?? "unknown_action",
    actorUid: optionalString(data.actorUid),
    actorEmail: optionalString(data.actorEmail),
    targetUid: optionalString(data.targetUid),
    targetEmail: optionalString(data.targetEmail),
    details: safeDetails,
    createdAt: timestampIso(data.createdAt),
  };
}
