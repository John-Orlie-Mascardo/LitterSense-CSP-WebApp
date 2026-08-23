/**
 * SessionTimelineCard.tsx
 *
 * Recorded litter-box session card for the Home activity timeline.
 *
 * DONE: entry/exit times, recorded date, duration, in-progress and incomplete presentation
 * PLACEHOLDER: live sessions may temporarily lack final sensor deltas until persistence completes
 *
 * NEXT: device integration owners should keep status values aligned with firmware output.
 */

"use client";

import Image from "next/image";
import { Clock3, LogIn, LogOut } from "lucide-react";
import { formatDuration } from "@/lib/utils/formatters";
import type { Cat } from "@/lib/interfaces/Cat";
import type { Session } from "@/lib/interfaces/Session";
import { INCOMPLETE_SESSION_FLOOR_SECS } from "@/lib/configs/behaviorThresholds";

const TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const getSessionDate = (value: string | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getStartedAt = (session: Session) => {
  const started = getSessionDate(session.startedAt);
  if (started) return started;

  const ended = getSessionDate(session.endedAt);
  if (!ended) return null;

  return new Date(ended.getTime() - Math.max(0, session.durationSecs) * 1000);
};

const formatTime = (date: Date | null) =>
  date ? date.toLocaleTimeString("en-US", TIME_FORMAT_OPTIONS) : "--";

const formatActivityDate = (date: Date | null, fallbackDate?: string) => {
  if (date) return date.toLocaleDateString("en-US", DATE_FORMAT_OPTIONS);
  if (!fallbackDate) return "--";

  const parsed = new Date(`${fallbackDate}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? fallbackDate
    : parsed.toLocaleDateString("en-US", DATE_FORMAT_OPTIONS);
};

const isInProgress = (session: Session) =>
  session.sessionStatus === "IN_PROGRESS" || !session.endedAt;

const isShortSession = (session: Session) =>
  session.sessionStatus === "SHORT_SESSION" ||
  session.durationSecs < INCOMPLETE_SESSION_FLOOR_SECS;

function Avatar({ cat }: { readonly cat: Cat }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-litter-primary-light flex items-center justify-center text-sm font-semibold text-litter-primary">
      {cat.avatar ? (
        <Image
          src={cat.avatar}
          alt={cat.name}
          width={40}
          height={40}
          unoptimized
          className="h-full w-full object-cover"
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        cat.name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

export function SessionTimelineCard({
  cat,
  session,
}: {
  readonly cat: Cat;
  readonly session: Session;
}) {
  const startedAt = getStartedAt(session);
  const endedAt = getSessionDate(session.endedAt);
  const inProgress = isInProgress(session);
  const shortSession = isShortSession(session);
  const activityDate = formatActivityDate(endedAt ?? startedAt, session.date);

  return (
    <div className="bg-litter-card rounded-xl border border-litter-border shadow-sm p-4">
      <div className="flex items-start gap-3">
        <Avatar cat={cat} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-body text-sm font-semibold text-litter-text leading-snug">
              {cat.name}
            </p>
            <span className="rounded-full bg-litter-primary-light px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-litter-primary">
              RFID Session
            </span>
            {shortSession && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Short Session
              </span>
            )}
            <span className="text-xs font-medium text-litter-muted">
              Recorded {activityDate}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-litter-bg px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-litter-muted">
                <LogIn className="h-3.5 w-3.5" />
                Enter
              </div>
              <p className="mt-1 text-sm font-semibold text-litter-text">
                {formatTime(startedAt)}
              </p>
            </div>
            <div className="rounded-lg bg-litter-bg px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-litter-muted">
                <LogOut className="h-3.5 w-3.5" />
                Out
              </div>
              {inProgress ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-litter-primary animate-pulse" />
                  <p className="text-sm font-semibold text-litter-primary">
                    In litter box
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-sm font-semibold text-litter-text">
                  {formatTime(endedAt)}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-litter-muted">
            <Clock3 className="h-3.5 w-3.5" />
            <span>{formatDuration(session.durationSecs)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
