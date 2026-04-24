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
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import type {
  Cat,
  CatDetails,
  CatStats,
  HealthLog,
  Session,
} from "@/lib/data/mockData";

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
  addCat: (cat: Cat, stats?: CatStats, details?: CatDetails) => Promise<void>;
  removeCat: (id: string) => Promise<void>;
  updateCat: (id: string, updates: Partial<Cat>) => Promise<void>;
  updateDetails: (id: string, updates: Partial<CatDetails>) => Promise<void>;
  getCatById: (id: string) => Cat | undefined;
  getStatsByCatId: (id: string) => CatStats | undefined;
  getDetailsByCatId: (id: string) => CatDetails | undefined;
  getSessionsByCatId: (id: string) => Session[];
  getHealthLogsByCatId: (id: string) => HealthLog[];
  getTrendData: (id: string) => CatTrendPoint[] | null;
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

const statusRank: Record<Cat["status"], number> = {
  healthy: 0,
  watch: 1,
  alert: 2,
};

const emptyStats: CatStats = {
  visits: 0,
  avgDuration: "--",
  airQuality: "Normal",
  litterLevel: 0,
  lastVisit: "",
};

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  value === "watch" || value === "alert" || value === "healthy"
    ? value
    : "healthy";

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

const maxStatus = (a: Cat["status"], b: Cat["status"]) =>
  statusRank[a] >= statusRank[b] ? a : b;

const formatAvgDuration = (totalDurationSecs: number, visits: number) => {
  if (visits <= 0) return "--";
  const avgSecs = Math.round(totalDurationSecs / visits);
  const minutes = Math.floor(avgSecs / 60);
  const seconds = avgSecs % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const dateTimeSortValue = (date: string, time: string) => {
  const parsed = Date.parse(`${date} ${time}`);
  if (Number.isNaN(parsed)) return Date.parse(date) || 0;
  return parsed;
};

const normalizeSession = (id: string, data: FirestoreData): Session => {
  const endedAt = parseString(data.endedAt) || parseString(data.createdAt);
  const eventDate = endedAt ? new Date(endedAt) : new Date();

  return {
    id,
    catId: parseString(data.catId),
    date: parseString(data.date) || getLocalDateKey(eventDate),
    time: parseString(data.time) || formatLocalTime(eventDate),
    durationSecs: parseNumber(data.durationSecs),
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
    const aSort = dateTimeSortValue(a.date, a.time);
    const bSort = dateTimeSortValue(b.date, b.time);
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

  const todaySessions = sessions.filter(
    (session) => session.catId === catId && session.date === today,
  );
  if (todaySessions.length > 0) {
    return statsFromTotals(
      todaySessions.length,
      todaySessions.reduce((sum, session) => sum + session.durationSecs, 0),
      todaySessions[0]?.date
        ? new Date(
            dateTimeSortValue(todaySessions[0].date, todaySessions[0].time),
          ).toISOString()
        : "",
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
    (session) => session.catId === cat.id && session.date === today,
  );

  if (stats.visits > 8) {
    status = maxStatus(status, "alert");
  } else if (stats.visits > 6) {
    status = maxStatus(status, "watch");
  }

  if (
    todaySessions.some(
      (session) =>
        session.anomaly &&
        (session.anomalyType === "No exit timeout" ||
          session.durationSecs >= 600),
    )
  ) {
    status = maxStatus(status, "alert");
  } else if (todaySessions.some((session) => session.anomaly)) {
    status = maxStatus(status, "watch");
  }

  return status;
};

const buildTrendData = (
  catId: string,
  sessions: Session[],
  dailyStats: FirebaseCatStatsDoc[],
): CatTrendPoint[] | null => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
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
    const daySessions = catSessions.filter((session) => session.date === day.key);
    const dailySummary = dailyStats.find((stats) => stats.date === day.key);
    const visits =
      dailySummary?.visits ?? daySessions.length;
    const totalDuration = daySessions.reduce(
      (sum, session) => sum + session.durationSecs,
      0,
    );
    const summaryTotalDuration =
      dailySummary?.totalDurationSecs ?? totalDuration;
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
        setFirebaseCatStats({});
        setCatDailyStats({});
        setIsLoading(false);
      });
      return;
    }

    queueMicrotask(() => setIsLoading(true));

    const unsubCats = onSnapshot(
      collection(db, "users", uid, "cats"),
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
        setIsLoading(false);
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
            const sortAt =
              Date.parse(parseString(data.endedAt)) ||
              dateTimeSortValue(session.date, session.time);
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

    return () => {
      unsubCats();
      unsubDetails();
      unsubCatStats();
      unsubSessions();
      unsubHealthLogs();
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

  const getStatsByCatId = useCallback(
    (id: string): CatStats | undefined =>
      deriveStatsForCat(id, firebaseCatStats, sessions, catDailyStats, catStats),
    [catDailyStats, catStats, firebaseCatStats, sessions],
  );

  const cats = useMemo(
    () =>
      rawCats.map((cat) => {
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
    [catDailyStats, catStats, firebaseCatStats, rawCats, sessions],
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
        endedAt: lastVisit,
      });
    });
  };

  const getCatById = useCallback(
    (id: string) => cats.find((cat) => cat.id === id),
    [cats],
  );

  const getDetailsByCatId = useCallback(
    (id: string) => catDetails[id],
    [catDetails],
  );

  const getSessionsByCatId = useCallback(
    (id: string) =>
      buildSessionsWithDailySummaries(id, sessions, catDailyStats[id] ?? []),
    [catDailyStats, sessions],
  );

  const getHealthLogsByCatId = useCallback(
    (id: string) => healthLogs.filter((log) => log.catId === id),
    [healthLogs],
  );

  const getTrendData = useCallback(
    (id: string) => buildTrendData(id, sessions, catDailyStats[id] ?? []),
    [catDailyStats, sessions],
  );

  return (
    <CatContext.Provider
      value={{
        cats,
        catStats,
        catDetails,
        sessions,
        healthLogs,
        addCat,
        removeCat,
        updateCat,
        updateDetails,
        getCatById,
        getStatsByCatId,
        getDetailsByCatId,
        getSessionsByCatId,
        getHealthLogsByCatId,
        getTrendData,
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
