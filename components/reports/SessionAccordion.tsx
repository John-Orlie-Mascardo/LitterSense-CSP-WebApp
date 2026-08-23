/**
 * SessionAccordion.tsx
 *
 * Renders a single-open, per-cat report log with Unattributed sessions last.
 *
 * DONE: grouping, persistent disclosure state, responsive rows, print expansion
 * PLACEHOLDER: none
 *
 * NEXT: report UI owners maintain accessibility and responsive column labels.
 *
 * NOTE(manuscript): State labels, descriptions, and visible session counts
 * must match the capstone paper; state copy comes only from the shared module.
 */

"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, Radio } from "lucide-react";
import { BehaviorStateBadge } from "@/components/behavior/BehaviorStateBadge";
import { buildReportSessionGroups, type ReportCatSnapshot } from "@/lib/presentation/reportSessionGroups";
import type { ReportSession } from "@/lib/hooks/useReports";
import { formatDuration } from "@/lib/utils/formatters";
import { formatSessionTimeLabel } from "@/lib/utils/sessionTime";

interface SessionAccordionProps {
  readonly sessions: readonly ReportSession[];
  readonly cats: readonly ReportCatSnapshot[];
}

export function SessionAccordion({ sessions, cats }: SessionAccordionProps) {
  const groups = buildReportSessionGroups(sessions, cats);
  const [openGroupId, setOpenGroupId] = useState<string | null>(groups[0]?.id ?? null);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-litter-border px-4 py-8 text-center text-sm text-theme-muted">
        No sessions recorded in this period.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isOpen = openGroupId === group.id;

        return (
          <section
            key={group.id}
            className="reports-session-group overflow-hidden rounded-xl border border-litter-border bg-litter-card"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`report-session-group-${group.id}`}
              onClick={() => setOpenGroupId(isOpen ? null : group.id)}
              className="reports-accordion-trigger flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-litter-card-hover"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-litter-primary-light font-semibold text-litter-primary">
                {group.isUnattributed ? (
                  <Radio className="h-5 w-5" aria-hidden="true" />
                ) : group.avatar ? (
                  <Image
                    src={group.avatar}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  group.name.charAt(0).toUpperCase()
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-litter-text">{group.name}</p>
                <p className="text-xs text-theme-muted">
                  {group.sessionCount > 0
                    ? `${group.sessionCount} ${group.sessionCount === 1 ? "session" : "sessions"}`
                    : "No data yet"}
                </p>
                {group.description && (
                  <p className="mt-1 text-xs leading-relaxed text-theme-muted">
                    {group.description}
                  </p>
                )}
              </div>

              <BehaviorStateBadge state={group.state} compact />
              <ChevronDown
                aria-hidden="true"
                className={`reports-accordion-chevron h-5 w-5 shrink-0 text-theme-muted transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <div
              id={`report-session-group-${group.id}`}
              className={`reports-accordion-content border-t border-litter-border ${
                isOpen ? "block" : "hidden"
              }`}
            >
              {group.sessions.length === 0 ? (
                <p className="px-4 py-5 text-sm text-theme-muted">
                  No sessions recorded in this period.
                </p>
              ) : (
                <>
                  <div className="reports-session-mobile divide-y divide-litter-border sm:hidden">
                    {group.sessions.map((session) => (
                      <div key={session.id} className="space-y-3 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-litter-text">{session.date}</p>
                            <p className="text-xs text-theme-muted">
                              {formatSessionTimeLabel(session) || "No data yet"}
                            </p>
                          </div>
                          <BehaviorStateBadge state={session.displayState} compact />
                        </div>
                        <dl className="grid grid-cols-3 gap-2 text-xs">
                          <SessionValue label="Duration" value={formatDuration(session.durationSecs)} />
                          <SessionValue
                            label="Air quality change"
                            value={session.summaryVisits ? "No data yet" : `${session.mq135Delta}%`}
                          />
                          <SessionValue
                            label="Odor level change"
                            value={session.summaryVisits ? "No data yet" : `${session.mq136Delta}%`}
                          />
                        </dl>
                      </div>
                    ))}
                  </div>

                  <div className="reports-session-table hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[680px] text-xs">
                      <thead>
                        <tr className="border-b border-litter-border text-left text-theme-muted">
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Time</th>
                          <th className="px-3 py-2 font-medium">Duration</th>
                          <th className="px-3 py-2 font-medium">Air quality change</th>
                          <th className="px-3 py-2 font-medium">Odor level change</th>
                          <th className="px-3 py-2 font-medium">State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-litter-border">
                        {group.sessions.map((session) => (
                          <tr key={session.id}>
                            <td className="px-3 py-2 text-litter-text">{session.date}</td>
                            <td className="px-3 py-2 text-litter-text">
                              {formatSessionTimeLabel(session) || "No data yet"}
                            </td>
                            <td className="px-3 py-2 text-litter-text">
                              {formatDuration(session.durationSecs)}
                            </td>
                            <td className="px-3 py-2 text-litter-text">
                              {session.summaryVisits ? "No data yet" : `${session.mq135Delta}%`}
                            </td>
                            <td className="px-3 py-2 text-litter-text">
                              {session.summaryVisits ? "No data yet" : `${session.mq136Delta}%`}
                            </td>
                            <td className="px-3 py-2">
                              <BehaviorStateBadge state={session.displayState} compact />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SessionValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="leading-tight text-theme-muted">{label}</dt>
      <dd className="mt-1 font-medium text-litter-text">{value}</dd>
    </div>
  );
}
