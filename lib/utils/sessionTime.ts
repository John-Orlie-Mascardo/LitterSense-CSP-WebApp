type SessionTimeSource = {
  endedAt?: string | null;
  date?: string;
  time?: string;
};

const TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

export function formatSessionTimeLabel(session: SessionTimeSource): string {
  const endedAt = session.endedAt?.trim();
  if (endedAt) {
    const parsed = new Date(endedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString("en-US", TIME_FORMAT_OPTIONS);
    }
  }

  return session.time ?? "";
}

export function getSessionSortValue(session: SessionTimeSource): number {
  const endedAt = session.endedAt?.trim();
  if (endedAt) {
    const parsed = Date.parse(endedAt);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (session.date && session.time) {
    const parsed = Date.parse(`${session.date} ${session.time}`);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return session.date ? Date.parse(session.date) || 0 : 0;
}
