import { ScrollText } from "lucide-react";
import type { AdminAuditEntry } from "@/lib/utils/adminAudit";

interface AuditLogListProps {
  entries: AdminAuditEntry[];
  isLoading: boolean;
}

function actionLabel(action: string) {
  const words = action.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatDate(iso: string) {
  if (!iso) return "Time unavailable";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function detailsText(details: AdminAuditEntry["details"]) {
  if (typeof details === "string") return details;
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

export function AuditLogList({ entries, isLoading }: AuditLogListProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-litter-border bg-litter-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-litter-border px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-litter-primary-light">
          <ScrollText className="h-4.5 w-4.5 text-litter-primary" />
        </div>
        <div>
          <h2 className="font-display text-base font-semibold text-litter-text">Recent audit activity</h2>
          <p className="mt-0.5 text-xs text-litter-muted">Latest 50 server-recorded actions</p>
        </div>
      </div>

      {isLoading ? (
        <p className="px-6 py-8 text-center text-sm text-litter-muted">Loading audit activity...</p>
      ) : entries.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-litter-muted">No audit activity recorded yet.</p>
      ) : (
        <ol className="max-h-96 divide-y divide-litter-border overflow-y-auto">
          {entries.map((entry) => {
            const detail = detailsText(entry.details);
            return (
              <li key={entry.id} className="px-6 py-3.5">
                <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-litter-text">{actionLabel(entry.action)}</p>
                    <p className="mt-0.5 text-xs text-litter-muted">
                      Actor: {entry.actorEmail ?? entry.actorUid ?? "Unknown"}
                      {entry.targetEmail || entry.targetUid
                        ? ` · Target: ${entry.targetEmail ?? entry.targetUid}`
                        : ""}
                    </p>
                    {detail && <p className="mt-1 text-xs text-litter-text-secondary">{detail}</p>}
                  </div>
                  <time className="shrink-0 text-xs text-litter-muted" dateTime={entry.createdAt || undefined}>
                    {formatDate(entry.createdAt)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
