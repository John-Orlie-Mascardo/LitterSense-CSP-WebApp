/** Deterministic display-only data for cats that have no recorded evidence. */

import type { CatDetails } from "@/lib/interfaces/CatDetails";
import type { Session } from "@/lib/interfaces/Session";

type DemoState = "normal" | "watch" | "abnormal";

type DemoProfile = {
  readonly state: DemoState;
  readonly visits: readonly number[];
  readonly durations: readonly number[];
};

export type DemoCatData = {
  readonly state: DemoState;
  readonly details: CatDetails;
  readonly sessions: Session[];
};

const PROFILES: readonly DemoProfile[] = [
  {
    state: "normal",
    visits: [4, 4, 5, 4, 4, 4, 4],
    durations: [118, 124, 121, 116, 123, 119, 120],
  },
  {
    state: "watch",
    visits: [4, 4, 5, 5, 5, 6, 6],
    durations: [120, 126, 138, 150, 162, 174, 180],
  },
  {
    state: "abnormal",
    visits: [4, 5, 5, 6, 7, 8, 9],
    durations: [122, 145, 180, 218, 270, 318, 360],
  },
];

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function buildDemoCatData(catId: string, catIndex: number, now = new Date()): DemoCatData {
  const profile = PROFILES[Math.max(0, Math.trunc(catIndex)) % PROFILES.length];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const sessions: Session[] = [];

  for (let daysAgo = 13; daysAgo >= 0; daysAgo -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - daysAgo);
    const patternIndex = ((6 - daysAgo) % 7 + 7) % 7;
    const visitCount = profile.visits[patternIndex];
    const durationSecs = profile.durations[patternIndex];
    const dateKey = getDateKey(date);

    for (let visitIndex = 0; visitIndex < visitCount; visitIndex += 1) {
      const endedAt = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        8,
        visitIndex * 75,
      );
      const startedAt = new Date(endedAt.getTime() - durationSecs * 1000);
      const isAbnormal = profile.state === "abnormal" && daysAgo === 0 && visitIndex < 2;

      sessions.push({
        id: `demo-${catId}-${dateKey}-${visitIndex + 1}`,
        catId,
        date: dateKey,
        time: endedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSecs,
        mq135Delta: profile.state === "abnormal" ? 18 : profile.state === "watch" ? 10 : 5,
        mq136Delta: profile.state === "abnormal" ? 16 : profile.state === "watch" ? 9 : 4,
        anomaly: isAbnormal,
        anomalyType: isAbnormal ? "Extended duration" : null,
        sessionStatus: isAbnormal ? "ABNORMAL" : profile.state === "watch" ? "WATCH" : "NORMAL",
      });
    }
  }

  const lastUpdated = new Date(today);
  lastUpdated.setDate(today.getDate() - 1);
  sessions.sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));

  return {
    state: profile.state,
    details: {
      breed: "Domestic",
      gender: catIndex % 2 === 0 ? "male" : "female",
      dob: "2022-01-01",
      weightKg: 4.5,
      rfidTag: "—",
      healthInsight: "Demo behavioral profile",
      baseline: {
        avgVisitsPerDay: 4,
        avgDurationSecs: 120,
        mq135DeltaPercent: 6,
        mq136DeltaPercent: 5,
        lastUpdated: getDateKey(lastUpdated),
      },
    },
    sessions,
  };
}

export function shouldUseDemoCatData({
  catId,
  sessions,
  baseline,
  hasStoredStats = false,
}: {
  readonly catId: string;
  readonly sessions: readonly { readonly catId: string }[];
  readonly baseline?: {
    readonly avgVisitsPerDay?: number;
    readonly avgDurationSecs?: number;
    readonly lastUpdated?: string;
  } | null;
  readonly hasStoredStats?: boolean;
}) {
  const hasBaseline = Boolean(
    baseline &&
      (baseline.avgVisitsPerDay ?? 0) > 0 &&
      (baseline.avgDurationSecs ?? 0) > 0 &&
      baseline.lastUpdated?.trim(),
  );
  return !hasStoredStats && !hasBaseline && !sessions.some((session) => session.catId === catId);
}
