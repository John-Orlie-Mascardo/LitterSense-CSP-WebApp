"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Database } from "lucide-react";
import { BehaviorStateBadge } from "@/components/behavior/BehaviorStateBadge";
import { CatChip } from "@/components/cats/CatChip";
import { CatBehaviorTrends } from "@/components/dashboard/CatBehaviorTrends";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useCats } from "@/lib/contexts/CatContext";
import { useDeviceSensors } from "@/lib/hooks/useDeviceSensors";
import { getPredictiveOverview } from "@/lib/utils/predictiveOverview";
import {
  BEHAVIOR_STATE_BY_ID,
  formatMetricValue,
  getCatDisplayState,
  hasEstablishedBaseline,
  hasRecordedCatData,
  type BehaviorStateId,
} from "@/lib/presentation/behaviorStates";
import { getFallbackAverageDuration } from "@/lib/utils/dashboardBehaviorMetrics";
import {
  isPredictiveHealthAnalysis,
  parseDurationLabelToSeconds,
  summarizePredictiveSessions,
  type PredictiveHealthAnalysis,
} from "@/lib/utils/predictiveHealth";

type CatPresentation = {
  readonly hasData: boolean;
  readonly baselineEstablished: boolean;
  readonly state: BehaviorStateId;
};

export default function PredictiveHealthPage() {
  const { user } = useAuth();
  const { data: sensors, error: sensorError } = useDeviceSensors();
  const {
    cats,
    isLoading,
    getDetailsByCatId,
    getSessionsByCatId,
    getStatsByCatId,
    getTrendData,
  } = useCats();
  const [selectedCatId, setSelectedCatId] = useState("");
  const [analysisResult, setAnalysisResult] = useState<{
    readonly key: string;
    readonly analysis: PredictiveHealthAnalysis;
  } | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  const activeCatId = cats.some((cat) => cat.id === selectedCatId)
    ? selectedCatId
    : cats[0]?.id ?? "";
  const selectedCat = cats.find((cat) => cat.id === activeCatId);
  const stats = getStatsByCatId(activeCatId);
  const details = getDetailsByCatId(activeCatId);
  const storedTrendData = getTrendData(activeCatId);
  const selectedSessions = useMemo(
    () => getSessionsByCatId(activeCatId),
    [activeCatId, getSessionsByCatId],
  );
  const sessionCounts = useMemo(
    () => summarizePredictiveSessions(selectedSessions),
    [selectedSessions],
  );

  const catPresentations = useMemo(
    () =>
      Object.fromEntries(
        cats.map((cat) => {
          const catStats = getStatsByCatId(cat.id);
          const catTrendData = getTrendData(cat.id);
          const baselineEstablished = hasEstablishedBaseline(getDetailsByCatId(cat.id));
          const hasData = hasRecordedCatData({
            sessions: getSessionsByCatId(cat.id),
            stats: catStats,
            trendData: catTrendData,
          });

          return [
            cat.id,
            {
              hasData,
              baselineEstablished,
              state: getCatDisplayState({
                persistedStatus: cat.status,
                hasData,
                baselineEstablished,
              }),
            },
          ];
        }),
      ) as Record<string, CatPresentation>,
    [cats, getDetailsByCatId, getSessionsByCatId, getStatsByCatId, getTrendData],
  );

  const presentation = catPresentations[activeCatId] ?? {
    hasData: false,
    baselineEstablished: false,
    state: "insufficient" as const,
  };
  const overview = getPredictiveOverview(selectedSessions, presentation.baselineEstablished);
  const trendData = overview.trendData.length ? overview.trendData : storedTrendData;
  const gasAvailable = !sensorError && sensors?.gasUltrasonicOnline === true;
  const gasState = (raw: number | null | undefined): "detected" | "clear" | "unavailable" => gasAvailable && (raw === 0 || raw === 1) ? raw === 0 ? "detected" : "clear" : "unavailable";
  const environment = { ammonia: gasState(sensors?.mq135Raw), h2s: gasState(sensors?.mq136Raw) };
  const displayVisits = Math.max(stats?.visits ?? 0, overview.todayCount);
  const averageDuration = getFallbackAverageDuration(
    stats?.avgDuration,
    trendData,
    selectedSessions,
    activeCatId,
  );
  const displayDuration = String(
    formatMetricValue(averageDuration, presentation.hasData),
  );
  const baseline = presentation.baselineEstablished && details?.baseline
    ? {
        avgVisitsPerDay: details.baseline.avgVisitsPerDay,
        avgDurationSecs: details.baseline.avgDurationSecs,
        lastUpdated: details.baseline.lastUpdated,
      }
    : null;
  const todayVisits = displayVisits;
  const todayAvgDurationSecs = todayVisits > 0
    ? (parseDurationLabelToSeconds(stats?.avgDuration ?? '') ?? parseDurationLabelToSeconds(averageDuration))
    : null;
  const analysisKey = JSON.stringify({
    activeCatId,
    displayState: presentation.state,
    todayVisits,
    todayAvgDurationSecs,
    baseline,
    sessionCounts,
    trendData,
    environment,
    evidenceDays: overview.recordedDays,
  });
  const analysis = analysisResult?.key === analysisKey
    ? analysisResult.analysis
    : null;
  const analysisSummary = analysis?.summary ?? (presentation.baselineEstablished ? BEHAVIOR_STATE_BY_ID[presentation.state].description : `Early read available from ${overview.completed} completed visits and current environment readings. Select Analyze for a preliminary summary.`);

  const handleAnalyze = async () => {
    if (!user || !selectedCat || isAnalyzing || retryAfterSeconds > 0) return;

    setIsAnalyzing(true);
    setAnalysisError("");
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/predictive-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          catName: selectedCat.name,
          displayState: presentation.state,
          todayVisits,
          todayAvgDurationSecs,
          baseline,
          sessionCounts,
          trendData: trendData ?? [],
          environment,
          evidenceDays: overview.recordedDays,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        readonly analysis?: unknown;
        readonly cooldownSeconds?: unknown;
        readonly error?: unknown;
        readonly retryAfterSeconds?: unknown;
      } | null;
      const serverRetrySeconds = typeof payload?.retryAfterSeconds === "number"
        ? Math.max(0, Math.ceil(payload.retryAfterSeconds))
        : 0;
      if (response.status === 429 && serverRetrySeconds > 0) {
        setRetryAfterSeconds(serverRetrySeconds);
      }
      if (!response.ok || !isPredictiveHealthAnalysis(payload?.analysis)) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "AI analysis is unavailable.",
        );
      }
      setAnalysisResult({ key: analysisKey, analysis: payload.analysis });
      if (typeof payload.cooldownSeconds === "number") {
        setRetryAfterSeconds(Math.max(0, Math.ceil(payload.cooldownSeconds)));
      }
    } catch (error) {
      setAnalysisError(
        error instanceof Error ? error.message : "AI analysis is unavailable.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-litter-bg pb-24 lg:pb-10">
      <TopBar />

      <main className="mx-auto max-w-[1440px] px-4 pt-20 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-litter-primary-light">
              <BrainCircuit className="h-6 w-6 text-litter-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-litter-text">
                Predictive Health Analysis
              </h1>
              <p className="mt-1 text-sm text-litter-muted">
                Review each cat&apos;s behavioral baseline and request an AI-supported summary.
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-litter-border bg-litter-card p-8 text-center text-sm text-litter-muted">
            Loading behavioral data...
          </div>
        ) : !selectedCat ? (
          <div className="rounded-xl border border-litter-border bg-litter-card p-8 text-center">
            <p className="font-semibold text-litter-text">Add a cat to begin analysis.</p>
            <Link
              href="/dashboard/cats"
              className="mt-3 inline-flex rounded-lg bg-litter-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Go to My Cats
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
              {cats.map((cat) => (
                <CatChip
                  key={cat.id}
                  cat={cat}
                  isActive={cat.id === activeCatId}
                  displayState={catPresentations[cat.id]?.state ?? "insufficient"}
                  onClick={() => {
                    setSelectedCatId(cat.id);
                    setAnalysisError("");
                  }}
                />
              ))}
            </div>

            <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <section className="rounded-xl border border-litter-border bg-litter-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-litter-primary" aria-hidden="true" />
                    <h2 className="font-display text-lg font-semibold text-litter-text">
                      Behavioral Baseline
                    </h2>
                  </div>
                  {presentation.baselineEstablished ? <BehaviorStateBadge state={presentation.state} /> : <span className="rounded-full bg-litter-primary-light px-3 py-1 text-xs font-semibold text-litter-primary">Building baseline</span>}
                </div>

                {presentation.baselineEstablished && details?.baseline ? (
                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-litter-muted">Average visits per day</p>
                      <p className="mt-1 text-xl font-bold text-litter-text">
                        {details.baseline.avgVisitsPerDay}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-litter-muted">Average duration</p>
                      <p className="mt-1 text-xl font-bold text-litter-text">
                        {(details.baseline.avgDurationSecs / 60).toFixed(1)} min
                      </p>
                    </div>
                    <p className="col-span-2 text-xs text-litter-muted">
                      Last updated {new Date(details.baseline.lastUpdated).toLocaleDateString()}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-relaxed text-litter-muted">
                    {overview.progress}
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-litter-border bg-litter-card p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-litter-primary-light">
                      <BrainCircuit className="h-5 w-5 text-litter-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-semibold text-litter-text">
                        AI Analysis
                      </h2>
                      <p className="mt-2 text-xs font-semibold text-litter-primary">{presentation.baselineEstablished ? "Recorded behavior review" : `Early read, based on ${overview.completed} completed visits`}</p>
                      <p className="mt-2 text-sm leading-relaxed text-litter-muted">
                        {analysisSummary}
                      </p>
                      {analysisError ? (
                        <p className="mt-2 text-sm text-litter-danger" role="alert">
                          {analysisError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAnalyze()}
                    disabled={!user || isAnalyzing || retryAfterSeconds > 0}
                    aria-busy={isAnalyzing}
                    className="shrink-0 rounded-lg border border-litter-primary px-4 py-2 text-sm font-semibold text-litter-primary transition-colors hover:bg-litter-primary-light disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAnalyzing
                      ? "Analyzing..."
                      : retryAfterSeconds > 0
                        ? `Analyze again in ${retryAfterSeconds}s`
                        : "Analyze"}
                  </button>
                </div>
                {analysis ? (
                  <div className="mt-5 grid gap-3 border-t border-litter-border pt-5 sm:grid-cols-2">
                    <div className="rounded-lg bg-litter-bg p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-litter-muted">
                        Baseline comparison
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-litter-text">
                        {analysis.baselineComparison}
                      </p>
                    </div>
                    <div className="rounded-lg bg-litter-bg p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-litter-muted">
                        Data quality
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-litter-text">
                        {analysis.dataQuality}
                      </p>
                    </div>
                    <div className="rounded-lg bg-litter-bg p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-litter-muted">
                        Observed changes
                      </h3>
                      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-litter-text">
                        {analysis.observedChanges.map((change) => (
                          <li key={change} className="flex gap-2">
                            <span className="text-litter-primary" aria-hidden="true">•</span>
                            <span>{change}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg bg-litter-primary-light p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-litter-primary">
                        Safe next step
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-litter-text">
                        {analysis.safeNextStep}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 border-t border-litter-border pt-4 text-xs text-litter-muted">
                    Select Analyze to generate a report from the recorded baseline and Litter Box Sessions.
                  </p>
                )}
                <p className="mt-4 text-xs text-litter-muted">
                  AI insights support monitoring and do not replace veterinary care.
                </p>
              </section>
            </div>

            <CatBehaviorTrends
              showPoints
              key={selectedCat.id}
              catName={selectedCat.name}
              todayVisits={displayVisits}
              todayAvgDuration={displayDuration}
              trendData={trendData}
            />
            <section className="mb-6 rounded-xl border border-litter-border bg-litter-card p-5">
              <h2 className="font-display text-lg font-semibold text-litter-text">Recorded visits</h2>
              {overview.recentVisits.length ? <ul className="mt-3 divide-y divide-litter-border">
                {overview.recentVisits.map(visit => <li key={visit.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm text-litter-text"><span>{visit.day} · {visit.sessionStatus === "DAILY_SUMMARY" ? `${visit.count} visits (daily summary)` : visit.timeLabel} (Philippine time)</span><span>{Math.floor(visit.durationSecs / 60)}m {Math.round(visit.durationSecs % 60)}s{visit.sessionStatus === "SHORT_SESSION" ? " · Incomplete" : ""}</span></li>)}
              </ul> : <p className="mt-3 text-sm text-litter-muted">No sessions have been recorded for this cat. Check that the collar tag is registered in My Cats and that the RFID device has internet access. Make a confirmed entry and exit to record a visit.</p>}
            </section>
            <section className="mb-6 rounded-xl border border-litter-border bg-litter-card p-5">
              <h2 className="font-display text-lg font-semibold text-litter-text">Litter box environment</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><p className="rounded-lg bg-litter-bg p-3 text-sm text-litter-text">Urine level: <span className="font-semibold capitalize">{environment.ammonia}</span></p><p className="rounded-lg bg-litter-bg p-3 text-sm text-litter-text">Stool level: <span className="font-semibold capitalize">{environment.h2s}</span></p></div>
              <p className="mt-3 text-xs text-litter-muted">These readings describe the shared litter box environment. Detection flags do not measure gas concentration or diagnose a cat.</p>
            </section>
            {!presentation.baselineEstablished && <section className="mb-6 rounded-xl border border-litter-border bg-litter-card p-5 text-sm text-litter-muted">
              <h2 className="font-display text-lg font-semibold text-litter-text">General guidance — not your cat&apos;s personal baseline</h2>
              <p className="mt-3">Many adult cats urinate about twice a day and pass stool about once a day. Diet, hydration and age affect this; an RFID visit does not prove urine or stool was passed.</p>
              <p className="mt-3">Contact a vet for repeated small trips, straining, blood or discomfort. Straining with little or no urine can be an emergency: seek urgent veterinary care without waiting 24 hours. If you see no urine for 24 hours, contact a vet urgently.</p>
              <p className="mt-3">Reference: <a href="https://www.petmd.com/cat/symptoms/why-is-my-cat-peeing-a-lot" target="_blank" rel="noopener noreferrer" className="text-litter-primary underline">PetMD veterinary guidance</a> and <a href="https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-lower-urinary-tract-disease" target="_blank" rel="noopener noreferrer" className="text-litter-primary underline">Cornell Feline Health Center</a>.</p>
            </section>}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
