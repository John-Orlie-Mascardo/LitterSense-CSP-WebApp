"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import { shouldFinishInitialCatsLoad } from "@/lib/utils/catSyncState";
import {
  getLocalDateKey,
  getSessionActivityDateKey,
  getSessionLocalDateKey,
  toIsoStringFromDateLike,
} from "@/lib/utils/sessionDate";
import { getSessionSortValue } from "@/lib/utils/sessionTime";
import {
  buildDemoCatData,
  shouldUseDemoCatData,
  type DemoCatData,
} from "@/lib/utils/demoCatData";
import type {
  Cat,
  CatDetails,
  CatStats,
  HealthLog,
  Session,
} from "@/lib/data/mockData";
import type { CatSessionLog } from "@/lib/interfaces/CatSessionLog";
import { deriveSessionLogCounts } from "@/lib/utils/sessionLogCounts";

interface FirebaseCatStatsDoc {
  catId?: string;
  date: string;
  visits: number;
  totalDurationSecs: number;
  lastVisit: string;
  updatedAt?: string;
}

export interface CatTrendPoint {
  day: string;
  visits: number;
  avgDuration: number;
  mq135Delta: number;
}

interface RecordVisitOptions {
  sessionStatus?: string | null;
  mq135Delta?: number;
  mq136Delta?: number;
}

interface CatContextType {
  cats: Cat[];
  catStats: Record<string, CatStats>;
  catDetails: Record<string, CatDetails>;
  sessions: Session[];
  healthLogs: HealthLog[];
  catSessionLogs: Record<string, CatSessionLog>;
  addCat: (cat: Cat, stats?: CatStats, details?: CatDetails) => Promise<void>;
  removeCat: (id: string) => Promise<void>;
  updateCat: (id: string, updates: Partial<Cat>) => Promise<void>;
  updateDetails: (id: string, updates: Partial<CatDetails>) => Promise<void>;
  getCatById: (id: string) => Cat | undefined;
  getStatsByCatId: (id: string) => CatStats | undefined;
  getDetailsByCatId: (id: string) => CatDetails | undefined;
  getSessionsByCatId: (id: string) => Session[];
  getHealthLogsByCatId: (id: string) => HealthLog[];
  getSessionLogByCatId: (id: string) => CatSessionLog | undefined;
  getTrendData: (id: string) => CatTrendPoint[] | null;
  isUsingDemoData: (id: string) => boolean;
  addHealthLog: (
    catId: string,
    type: HealthLog["type"],
    note: string,
  ) => Promise<void>;
  removeHealthLog: (id: string) => Promise<void>;
  recordVisit: (
    catId: string,
    durationSecs: number,
    options?: RecordVisitOptions,
  ) => Promise<void>;
  isLoading: boolean;
}

type FirestoreData = Record<string, unknown>;

const CatContext = createContext<CatContextType | undefined>(undefined);

const emptyStats: CatStats = {
  visits: 0,
  avgDuration: "--",
  airQuality: "Normal",
  litterLevel: 0,
  lastVisit: "",
};

const formatLocalTime = (date = new Date()) =>
  date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

const parseString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const parseNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const parseStatus = (value: unknown): Cat["status"] =>
  value === "abnormal" || value === "watch" ? value : "normal";

const parseHealthLogType = (value: unknown): HealthLog["type"] => {
  if (
    value === "Vet Visit" ||
    value === "Medication" ||
    value === "Observation" ||
    value === "Other"
  ) {
    return value;
  }
  return "Observation";
};

const formatAvgDuration = (totalDurationSecs: number, visits: number) => {
  if (visits <= 0) return "--";
  const avgSecs = Math.round(totalDurationSecs / visits);
  const minutes = Math.floor(avgSecs / 60);
  const seconds = avgSecs % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const inferSessionStartedAt = (endedAt: string, durationSecs: number) => {
  if (!endedAt) return "";
  const parsed = new Date(endedAt);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(parsed.getTime() - Math.max(0, durationSecs) * 1000).toISOString();
};

const normalizeSession = (id: string, data: FirestoreData): Session => {
  const endedAt =
    toIsoStringFromDateLike(data.endedAt) ||
    toIsoStringFromDateLike(data.createdAt);
  const durationSecs = parseNumber(data.durationSecs);
  const startedAt =
    toIsoStringFromDateLike(data.startedAt) ||
    inferSessionStartedAt(endedAt, durationSecs);
  const eventDate = endedAt ? new Date(endedAt) : new Date();

  return {
    id,
    catId: parseString(data.catId),
    date:
      getSessionLocalDateKey({
        date: data.date,
        endedAt: data.endedAt,
        createdAt: data.createdAt,
      }) || getLocalDateKey(eventDate),
    time: parseString(data.time) || formatLocalTime(eventDate),
    startedAt,
    endedAt,
    durationSecs,
    mq135Delta: parseNumber(data.mq135Delta),
    mq136Delta: parseNumber(data.mq136Delta),
    anomaly: data.anomaly === true,
    anomalyType:
      typeof data.anomalyType === "string" ? data.anomalyType : null,
    sessionStatus: parseString(data.sessionStatus, "NORMAL"),
  };
};

const normalizeHealthLog = (id: string, data: FirestoreData): HealthLog => ({
  id,
  catId: parseString(data.catId),
  date: parseString(data.date) || getLocalDateKey(),
  type: parseHealthLogType(data.type),
  note: parseString(data.note),
});

const statsFromTotals = (
  visits: number,
  totalDurationSecs: number,
  lastVisit: string,
): CatStats => ({
  visits,
  avgDuration: formatAvgDuration(totalDurationSecs, visits),
  airQuality: "Normal",
  litterLevel: 68,
  lastVisit,
});

const normalizeDailyStats = (
  id: string,
  data: FirestoreData,
): FirebaseCatStatsDoc => ({
  catId: parseString(data.catId),
  date: parseString(data.date, id),
  visits: parseNumber(data.visits),
  totalDurationSecs: parseNumber(data.totalDurationSecs),
  lastVisit: parseString(data.lastVisit),
  updatedAt: parseString(data.updatedAt),
});

const buildSessionsWithDailySummaries = (
  catId: string,
  sessions: Session[],
  dailyStats: FirebaseCatStatsDoc[],
): Session[] => {
  const catSessions = sessions.filter((session) => session.catId === catId);
  const sessionsByDate = catSessions.reduce<Record<string, Session[]>>(
    (acc, session) => {
      acc[session.date] = acc[session.date] ?? [];
      acc[session.date].push(session);
      return acc;
    },
    {},
  );

  const summaryRows = dailyStats.reduce<Session[]>((rows, day) => {
    if (day.visits <= 0) return rows;
    const detailedCount = sessionsByDate[day.date]?.length ?? 0;
    const missingVisits = Math.max(0, day.visits - detailedCount);
    if (missingVisits === 0) return rows;

    const averageDuration = Math.max(
      1,
      Math.round(day.totalDurationSecs / day.visits),
    );
    const lastVisitDate = day.lastVisit ? new Date(day.lastVisit) : null;

    rows.push({
      id: `daily-summary-${catId}-${day.date}`,
      catId,
      date: day.date,
      time:
        lastVisitDate && !Number.isNaN(lastVisitDate.getTime())
          ? formatLocalTime(lastVisitDate)
          : "",
      startedAt:
        lastVisitDate && !Number.isNaN(lastVisitDate.getTime())
          ? new Date(lastVisitDate.getTime() - averageDuration * 1000).toISOString()
          : undefined,
      endedAt:
        lastVisitDate && !Number.isNaN(lastVisitDate.getTime())
          ? lastVisitDate.toISOString()
          : undefined,
      durationSecs: averageDuration,
      mq135Delta: 0,
      mq136Delta: 0,
      anomaly: false,
      anomalyType: null,
      sessionStatus: "DAILY_SUMMARY",
      summaryVisits: missingVisits,
    });

    return rows;
  }, []);

  return [...catSessions, ...summaryRows].sort((a, b) => {
    const aSort = getSessionSortValue(a);
    const bSort = getSessionSortValue(b);
    return bSort - aSort;
  });
};

const deriveStatsForCat = (
  catId: string,
  firebaseCatStats: Record<string, FirebaseCatStatsDoc>,
  sessions: Session[],
  dailyStats: Record<string, FirebaseCatStatsDoc[]>,
  localStats: Record<string, CatStats>,
  today = getLocalDateKey(),
): CatStats => {
  const todaySessions = sessions.filter(
    (session) =>
      session.catId === catId &&
      getSessionActivityDateKey(session) === today,
  );
  if (todaySessions.length > 0) {
    return statsFromTotals(
      todaySessions.length,
      todaySessions.reduce((sum, session) => sum + session.durationSecs, 0),
      todaySessions[0]?.date
        ? new Date(
          getSessionSortValue(todaySessions[0]),
        ).toISOString()
        : "",
    );
  }

  const firebaseStats = firebaseCatStats[catId];
  if (firebaseStats?.date === today) {
    return statsFromTotals(
      firebaseStats.visits,
      firebaseStats.totalDurationSecs,
      firebaseStats.lastVisit,
    );
  }

  const todayDailyStats = dailyStats[catId]?.find((day) => day.date === today);
  if (todayDailyStats) {
    return statsFromTotals(
      todayDailyStats.visits,
      todayDailyStats.totalDurationSecs,
      todayDailyStats.lastVisit,
    );
  }

  return localStats[catId] ?? emptyStats;
};

const deriveLiveStatus = (
  cat: Cat,
  stats: CatStats,
  sessions: Session[],
  today = getLocalDateKey(),
): Cat["status"] => {
  let status = cat.status;
  const todaySessions = sessions.filter(
    (session) =>
      session.catId === cat.id &&
      getSessionActivityDateKey(session) === today,
  );

  if (stats.visits > 8) {
    status = "abnormal";
  } else if (stats.visits > 6) {
    status = "abnormal";
  }

  if (
    todaySessions.some(
      (session) =>
        session.anomaly &&
        (session.anomalyType === "No exit timeout" ||
          session.durationSecs >= 600),
    )
  ) {
    status = "abnormal";
  } else if (todaySessions.some((session) => session.anomaly)) {
    status = "abnormal";
  }

  return status;
};

const buildTrendData = (
  catId: string,
  sessions: Session[],
  dailyStats: FirebaseCatStatsDoc[],
): CatTrendPoint[] | null => {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = getLocalDateKey(date);
    return {
      key,
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
    };
  });

  const catSessions = sessions.filter((session) => session.catId === catId);
  const hasAnyData =
    catSessions.length > 0 || dailyStats.some((day) => day.visits > 0);
  if (!hasAnyData) return null;

  return days.map((day) => {
    const daySessions = catSessions.filter(
      (session) => getSessionActivityDateKey(session) === day.key,
    );
    const dailySummary = dailyStats.find((stats) => stats.date === day.key);
    const visits =
      daySessions.length > 0 ? daySessions.length : dailySummary?.visits ?? 0;
    const totalDuration = daySessions.reduce(
      (sum, session) => sum + session.durationSecs,
      0,
    );
    const summaryTotalDuration =
      daySessions.length > 0
        ? totalDuration
        : dailySummary?.totalDurationSecs ?? totalDuration;
    const avgDuration =
      visits > 0 ? Math.round(summaryTotalDuration / visits) : 0;
    const mq135Delta =
      daySessions.length > 0
        ? Math.round(
          daySessions.reduce((sum, session) => sum + session.mq135Delta, 0) /
          daySessions.length,
        )
        : 0;

    return {
      day: day.label,
      visits,
      avgDuration,
      mq135Delta,
    };
  });
};

const getVisitAnomaly = (
  durationSecs: number,
  options?: RecordVisitOptions,
) => {
  const status = options?.sessionStatus ?? "NORMAL";
  const isAnomaly =
    status === "ABNORMAL" ||
    status === "NO_EXIT_TIMEOUT" ||
    status === "SHORT_SESSION" ||
    durationSecs >= 300;

  if (!isAnomaly) return { anomaly: false, anomalyType: null };
  if (status === "NO_EXIT_TIMEOUT") {
    return { anomaly: true, anomalyType: "No exit timeout" };
  }
  if (status === "SHORT_SESSION") {
    return { anomaly: true, anomalyType: "Short session" };
  }
  return { anomaly: true, anomalyType: "Extended duration" };
};

export function CatProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid;
  const [rawCats, setRawCats] = useState<Cat[]>([]);
  const [catStats, setCatStats] = useState<Record<string, CatStats>>({});
  const [catDetails, setCatDetails] = useState<Record<string, CatDetails>>({});
  const [sessions, setSessions] = useState<Session[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [catSessionLogs, setCatSessionLogs] = useState<Record<string, CatSessionLog>>({});
  const [firebaseCatStats, setFirebaseCatStats] = useState<
    Record<string, FirebaseCatStatsDoc>
  >({});
  const [catDailyStats, setCatDailyStats] = useState<
    Record<string, FirebaseCatStatsDoc[]>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!uid) {
      queueMicrotask(() => {
        setRawCats([]);
        setCatStats({});
        setCatDetails({});
        setSessions([]);
        setHealthLogs([]);
        setCatSessionLogs({});
        setFirebaseCatStats({});
        setCatDailyStats({});
        setIsLoading(false);
      });
      return;
    }

    queueMicrotask(() => setIsLoading(true));

    const unsubCats = onSnapshot(
      collection(db, "users", uid, "cats"),
      { includeMetadataChanges: true },
      (snapshot) => {
        const loaded: Cat[] = [];
        snapshot.forEach((catDoc) => {
          const data = catDoc.data();
          loaded.push({
            id: catDoc.id,
            name: parseString(data.name, "Unnamed cat"),
            status: parseStatus(data.status),
            avatar: typeof data.avatar === "string" ? data.avatar : null,
            isOnline: data.isOnline === true,
          });
        });
        setRawCats(loaded);
        if (
          shouldFinishInitialCatsLoad({
            catCount: loaded.length,
            fromCache: snapshot.metadata.fromCache,
          })
        ) {
          setIsLoading(false);
        }
      },
      (error) => {
        console.error("Failed to sync cats:", error);
        setIsLoading(false);
      },
    );

    const unsubDetails = onSnapshot(
      collection(db, "users", uid, "catDetails"),
      (snapshot) => {
        const loaded: Record<string, CatDetails> = {};
        snapshot.forEach((detailDoc) => {
          loaded[detailDoc.id] = detailDoc.data() as CatDetails;
        });
        setCatDetails(loaded);
      },
      (error) => {
        console.error("Failed to sync cat details:", error);
      },
    );

    const today = getLocalDateKey();
    const unsubCatStats = onSnapshot(
      collection(db, "users", uid, "dailyCatStats", today, "cats"),
      (snapshot) => {
        const loaded: Record<string, FirebaseCatStatsDoc> = {};
        snapshot.forEach((statsDoc) => {
          loaded[statsDoc.id] = statsDoc.data() as FirebaseCatStatsDoc;
        });
        setFirebaseCatStats(loaded);
      },
      (error) => {
        console.error("Failed to sync cat stats:", error);
      },
    );

    const unsubSessions = onSnapshot(
      collection(db, "users", uid, "sessions"),
      (snapshot) => {
        const loaded = snapshot.docs
          .map((sessionDoc) => {
            const data = sessionDoc.data() as FirestoreData;
            const session = normalizeSession(sessionDoc.id, data);
            const sortAt = getSessionSortValue(session);
            return { session, sortAt };
          })
          .sort((a, b) => b.sortAt - a.sortAt)
          .map(({ session }) => session);

        setSessions(loaded);
      },
      (error) => {
        console.error("Failed to sync session history:", error);
      },
    );

    const unsubHealthLogs = onSnapshot(
      collection(db, "users", uid, "healthLogs"),
      (snapshot) => {
        const loaded = snapshot.docs
          .map((logDoc) => {
            const data = logDoc.data() as FirestoreData;
            const log = normalizeHealthLog(logDoc.id, data);
            const sortAt =
              Date.parse(parseString(data.createdAt)) ||
              Date.parse(log.date) ||
              0;
            return { log, sortAt };
          })
          .sort((a, b) => b.sortAt - a.sortAt)
          .map(({ log }) => log);

        setHealthLogs(loaded);
      },
      (error) => {
        console.error("Failed to sync health logs:", error);
      },
    );

    const unsubSessionLogs = onSnapshot(
      collection(db, "users", uid, "catSessionLog"),
      (snapshot) => {
        const loaded: Record<string, CatSessionLog> = {};
        snapshot.forEach((logDoc) => {
          loaded[logDoc.id] = logDoc.data() as CatSessionLog;
        });
        setCatSessionLogs(loaded);
      },
      (error) => {
        console.error("Failed to sync cat session logs:", error);
      },
    );

    return () => {
      unsubCats();
      unsubDetails();
      unsubCatStats();
      unsubSessions();
      unsubHealthLogs();
      unsubSessionLogs();
    };
  }, [uid, authLoading]);

  useEffect(() => {
    if (!uid || rawCats.length === 0) {
      queueMicrotask(() => setCatDailyStats({}));
      return;
    }

    const activeCatIds = new Set(rawCats.map((cat) => cat.id));
    queueMicrotask(() =>
      setCatDailyStats((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([catId]) => activeCatIds.has(catId)),
        ),
      ),
    );

    const unsubscribers = rawCats.map((cat) =>
      onSnapshot(
        collection(db, "users", uid, "catStats", cat.id, "daily"),
        (snapshot) => {
          const loaded = snapshot.docs
            .map((statsDoc) =>
              normalizeDailyStats(
                statsDoc.id,
                statsDoc.data() as FirestoreData,
              ),
            )
            .sort((a, b) => b.date.localeCompare(a.date));

          setCatDailyStats((prev) => ({
            ...prev,
            [cat.id]: loaded,
          }));
        },
        (error) => {
          console.error(`Failed to sync daily stats for ${cat.id}:`, error);
        },
      ),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [uid, rawCats]);

<<<<<<< HEAD
  const demoDataByCatId = useMemo(
    () =>
      Object.fromEntries(
        rawCats.flatMap((cat, catIndex) => {
          const storedStats = firebaseCatStats[cat.id];
          const localStoredStats = catStats[cat.id];
          const hasStoredStats =
            (storedStats?.visits ?? 0) > 0 ||
            (localStoredStats?.visits ?? 0) > 0 ||
            Boolean(localStoredStats?.lastVisit?.trim()) ||
            (catDailyStats[cat.id] ?? []).some((day) => day.visits > 0);
          if (!shouldUseDemoCatData({
            catId: cat.id,
            sessions,
            baseline: catDetails[cat.id]?.baseline,
            hasStoredStats,
          })) {
            return [];
          }
          return [[cat.id, buildDemoCatData(cat.id, catIndex)]];
        }),
      ) as Record<string, DemoCatData>,
    [catDailyStats, catDetails, catStats, firebaseCatStats, rawCats, sessions],
  );
=======
  // Recompute and persist session log counts whenever sessions or details change.
  useEffect(() => {
    if (!uid || rawCats.length === 0) return;

    const writeSessionLogs = async () => {
      for (const cat of rawCats) {
        const catSessions = buildSessionsWithDailySummaries(
          cat.id,
          sessions,
          catDailyStats[cat.id] ?? [],
        );
        const details = catDetails[cat.id];
        const baselineEstablished = Boolean(
          details?.baseline &&
          (details.baseline.avgVisitsPerDay ?? 0) > 0 &&
          (details.baseline.avgDurationSecs ?? 0) > 0 &&
          details.baseline.lastUpdated?.trim(),
        );
        const counts = deriveSessionLogCounts(catSessions, baselineEstablished);
        const logDoc = {
          catId: cat.id,
          ...counts,
          updatedAt: new Date().toISOString(),
        } satisfies CatSessionLog;

        try {
          await setDoc(
            doc(db, "users", uid, "catSessionLog", cat.id),
            logDoc,
          );
        } catch (err) {
          console.error(`Failed to write session log for ${cat.id}:`, err);
        }
      }
    };

    void writeSessionLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, sessions, catDailyStats, catDetails]);
>>>>>>> 845387bad060e91023769fcdc4318e14cd661020

  const getStatsByCatId = useCallback(
    (id: string): CatStats | undefined =>
      deriveStatsForCat(
        id,
        firebaseCatStats,
        demoDataByCatId[id]?.sessions ?? sessions,
        catDailyStats,
        catStats,
      ),
    [catDailyStats, catStats, demoDataByCatId, firebaseCatStats, sessions],
  );

  const cats = useMemo(
    () =>
      rawCats.map((cat) => {
        const demoData = demoDataByCatId[cat.id];
        if (demoData) return { ...cat, status: demoData.state };
        const stats = deriveStatsForCat(
          cat.id,
          firebaseCatStats,
          sessions,
          catDailyStats,
          catStats,
        );
        return {
          ...cat,
          status: deriveLiveStatus(cat, stats, sessions),
        };
      }),
    [catDailyStats, catStats, demoDataByCatId, firebaseCatStats, rawCats, sessions],
  );

  const addCat = async (cat: Cat, stats?: CatStats, details?: CatDetails) => {
    if (!user) return;

    await setDoc(doc(db, "users", user.uid, "cats", cat.id), {
      name: cat.name,
      status: cat.status,
      avatar: cat.avatar,
      isOnline: cat.isOnline,
    });

    if (details) {
      await setDoc(doc(db, "users", user.uid, "catDetails", cat.id), details);
    }

    if (stats) {
      setCatStats((prev) => ({ ...prev, [cat.id]: stats }));
    }
  };

  const removeCat = async (id: string) => {
    if (!user) return;
    const today = getLocalDateKey();

    await deleteDoc(doc(db, "users", user.uid, "cats", id));
    await deleteDoc(doc(db, "users", user.uid, "catDetails", id));
    await deleteDoc(doc(db, "users", user.uid, "catStats", id));
    await deleteDoc(doc(db, "users", user.uid, "dailyCatStats", today, "cats", id));
    await deleteDoc(doc(db, "users", user.uid, "catSessionLog", id));

    setCatStats((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  const updateCat = async (id: string, updates: Partial<Cat>) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid, "cats", id), updates);
  };

  const updateDetails = async (id: string, updates: Partial<CatDetails>) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "catDetails", id), updates, {
      merge: true,
    });
  };

  const addHealthLog = async (
    catId: string,
    type: HealthLog["type"],
    note: string,
  ) => {
    if (!user) return;
    const now = new Date();
    const createdAt = now.toISOString();
    const logRef = doc(collection(db, "users", user.uid, "healthLogs"));

    await setDoc(logRef, {
      catId,
      date: getLocalDateKey(now),
      type,
      note,
      createdAt,
      updatedAt: createdAt,
    });
  };

  const removeHealthLog = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "healthLogs", id));
  };

  const recordVisit = async (
    catId: string,
    durationSecs: number,
    options?: RecordVisitOptions,
  ) => {
    if (!user) return;
    const now = new Date();
    const today = getLocalDateKey(now);
    const lastVisit = now.toISOString();
    const safeDurationSecs = Math.max(1, Math.round(durationSecs));
    const startedAt = new Date(now.getTime() - safeDurationSecs * 1000).toISOString();
    const dailyRef = doc(
      db,
      "users",
      user.uid,
      "dailyCatStats",
      today,
      "cats",
      catId,
    );
    const catDailyRef = doc(
      db,
      "users",
      user.uid,
      "catStats",
      catId,
      "daily",
      today,
    );
    const summaryRef = doc(db, "users", user.uid, "catStats", catId);
    const sessionRef = doc(collection(db, "users", user.uid, "sessions"));
    const anomaly = getVisitAnomaly(safeDurationSecs, options);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(dailyRef);
      const existing = snapshot.exists()
        ? (snapshot.data() as FirebaseCatStatsDoc)
        : null;
      const nextStats = {
        catId,
        date: today,
        visits: (existing?.visits ?? 0) + 1,
        totalDurationSecs:
          (existing?.totalDurationSecs ?? 0) + safeDurationSecs,
        lastVisit,
        updatedAt: lastVisit,
      };

      transaction.set(dailyRef, nextStats);
      transaction.set(catDailyRef, nextStats);
      transaction.set(summaryRef, nextStats);
      transaction.set(sessionRef, {
        catId,
        date: today,
        time: formatLocalTime(now),
        durationSecs: safeDurationSecs,
        mq135Delta: options?.mq135Delta ?? 0,
        mq136Delta: options?.mq136Delta ?? 0,
        anomaly: anomaly.anomaly,
        anomalyType: anomaly.anomalyType,
        sessionStatus: options?.sessionStatus ?? "NORMAL",
        createdAt: lastVisit,
        startedAt,
        endedAt: lastVisit,
      });
    });
  };

  const getCatById = useCallback(
    (id: string) => cats.find((cat) => cat.id === id),
    [cats],
  );

  const getDetailsByCatId = useCallback(
    (id: string) => {
      const demoData = demoDataByCatId[id];
      const storedDetails = catDetails[id];
      if (!demoData) return storedDetails;
      return storedDetails
        ? { ...demoData.details, ...storedDetails, baseline: demoData.details.baseline }
        : demoData.details;
    },
    [catDetails, demoDataByCatId],
  );

  const getSessionsByCatId = useCallback(
    (id: string) => demoDataByCatId[id]?.sessions
      ?? buildSessionsWithDailySummaries(id, sessions, catDailyStats[id] ?? []),
    [catDailyStats, demoDataByCatId, sessions],
  );

  const getHealthLogsByCatId = useCallback(
    (id: string) => healthLogs.filter((log) => log.catId === id),
    [healthLogs],
  );

  const getTrendData = useCallback(
    (id: string) => buildTrendData(
      id,
      demoDataByCatId[id]?.sessions ?? sessions,
      demoDataByCatId[id] ? [] : catDailyStats[id] ?? [],
    ),
    [catDailyStats, demoDataByCatId, sessions],
  );

  const isUsingDemoData = useCallback(
    (id: string) => Boolean(demoDataByCatId[id]),
    [demoDataByCatId],
  );

  const getSessionLogByCatId = useCallback(
    (id: string): CatSessionLog | undefined => catSessionLogs[id],
    [catSessionLogs],
  );

  const getSessionLogByCatId = useCallback(
    (id: string): CatSessionLog | undefined => catSessionLogs[id],
    [catSessionLogs],
  );

  return (
    <CatContext.Provider
      value={{
        cats,
        catStats,
        catDetails,
        sessions,
        healthLogs,
        catSessionLogs,
        addCat,
        removeCat,
        updateCat,
        updateDetails,
        getCatById,
        getStatsByCatId,
        getDetailsByCatId,
        getSessionsByCatId,
        getHealthLogsByCatId,
        getSessionLogByCatId,
        getTrendData,
        isUsingDemoData,
        addHealthLog,
        removeHealthLog,
        recordVisit,
        isLoading,
      }}
    >
      {children}
    </CatContext.Provider>
  );
}

export function useCats() {
  const context = useContext(CatContext);
  if (context === undefined) {
    throw new Error("useCats must be used within a CatProvider");
  }
  return context;
}
