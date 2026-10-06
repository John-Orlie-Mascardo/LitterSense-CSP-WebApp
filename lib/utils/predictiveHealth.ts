import { ownerText } from "../presentation/ownerText";
/**
 * Validates predictive-health input and builds a grounded, non-diagnostic report.
 */

import type { BehaviorStateId } from "@/lib/presentation/behaviorStates";

const DISPLAY_STATES = new Set<BehaviorStateId>([
  "normal",
  "watch",
  "abnormal",
  "insufficient",
  "incomplete",
  "unattributed",
]);

type BaselineMetrics = {
  readonly avgVisitsPerDay: number;
  readonly avgDurationSecs: number;
  readonly lastUpdated: string;
};

type SessionCounts = {
  readonly completed: number;
  readonly incomplete: number;
  readonly abnormal: number;
};

type PredictiveSession = {
  readonly sessionStatus?: string | null;
  readonly summaryVisits?: number;
  readonly anomaly?: boolean;
  readonly anomalyType?: string | null;
};

export interface PredictiveHealthRequest {
  readonly environment?: { readonly ammonia: "detected" | "clear" | "unavailable"; readonly h2s: "detected" | "clear" | "unavailable" };
  readonly evidenceDays?: number;
  readonly idToken: string;
  readonly catName: string;
  readonly displayState: BehaviorStateId;
  readonly todayVisits: number | null;
  readonly todayAvgDurationSecs: number | null;
  readonly baseline: BaselineMetrics | null;
  readonly sessionCounts: SessionCounts;
  readonly trendData: readonly {
    readonly day: string;
    readonly visits: number;
    readonly avgDuration: number;
  }[];
}

export interface PredictiveHealthAnalysis {
  readonly confidence?: "low" | "medium" | "high";
  readonly preliminary?: boolean;
  readonly summary: string;
  readonly baselineComparison: string;
  readonly observedChanges: readonly string[];
  readonly dataQuality: string;
  readonly safeNextStep: string;
}

type PredictiveHealthEvidence = Omit<PredictiveHealthAnalysis, "summary">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isReportText = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 2000;

export function isPredictiveHealthAnalysis(
  value: unknown,
): value is PredictiveHealthAnalysis {
    if (!isRecord(value) || !Array.isArray(value.observedChanges)) return false;
    if (value.confidence !== undefined && !['low', 'medium', 'high'].includes(String(value.confidence))) return false;
    if (value.preliminary !== undefined && typeof value.preliminary !== 'boolean') return false;
  return (
    isReportText(value.summary) &&
    isReportText(value.baselineComparison) &&
    value.observedChanges.length > 0 &&
    value.observedChanges.length <= 5 &&
    value.observedChanges.every(isReportText) &&
    isReportText(value.dataQuality) &&
    isReportText(value.safeNextStep)
  );
}

const isFiniteNumberInRange = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

const parseBaseline = (value: unknown): BaselineMetrics | null | undefined => {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { avgVisitsPerDay, avgDurationSecs, lastUpdated } = value;
  if (
    !isFiniteNumberInRange(avgVisitsPerDay, 0.01, 1000) ||
    !isFiniteNumberInRange(avgDurationSecs, 1, 86400) ||
    typeof lastUpdated !== "string" ||
    lastUpdated.trim().length < 1 ||
    lastUpdated.length > 64
  ) {
    return undefined;
  }
  return {
    avgVisitsPerDay: Number(avgVisitsPerDay),
    avgDurationSecs: Math.round(Number(avgDurationSecs)),
    lastUpdated: lastUpdated.trim(),
  };
};

const parseSessionCounts = (value: unknown): SessionCounts | null => {
  if (!isRecord(value)) return null;
  const { completed, incomplete, abnormal } = value;
  if (
    !isFiniteNumberInRange(completed, 0, 100000) ||
    !isFiniteNumberInRange(incomplete, 0, 100000) ||
    !isFiniteNumberInRange(abnormal, 0, 100000)
  ) {
    return null;
  }
  return {
    completed: Math.round(Number(completed)),
    incomplete: Math.round(Number(incomplete)),
    abnormal: Math.round(Number(abnormal)),
  };
};

export function parsePredictiveHealthRequest(value: unknown): PredictiveHealthRequest | null {
  if (!isRecord(value)) return null;

  const {
    idToken,
    catName,
    displayState,
    todayVisits,
    todayAvgDurationSecs,
    baseline,
    sessionCounts,
    trendData,
  } = value;
  const safeBaseline = parseBaseline(baseline);
  const safeSessionCounts = parseSessionCounts(sessionCounts);
  const environment = value.environment;
  const states = ["detected", "clear", "unavailable"];
  if (environment !== undefined && (!isRecord(environment) || !states.includes(String(environment.ammonia)) || !states.includes(String(environment.h2s)))) return null;
  if (value.evidenceDays !== undefined && !isFiniteNumberInRange(value.evidenceDays, 0, 7)) return null;
  if (
    typeof idToken !== "string" || idToken.length < 1 || idToken.length > 4096 ||
    typeof catName !== "string" || catName.trim().length < 1 || catName.length > 80 ||
    typeof displayState !== "string" || !DISPLAY_STATES.has(displayState as BehaviorStateId) ||
    (todayVisits !== null && !isFiniteNumberInRange(todayVisits, 0, 1000)) ||
    (todayAvgDurationSecs !== null && !isFiniteNumberInRange(todayAvgDurationSecs, 0, 86400)) ||
    safeBaseline === undefined ||
    !safeSessionCounts ||
    (!Array.isArray(trendData) && trendData !== null)
  ) {
    return null;
  }

  const safeTrendData = (trendData ?? []).slice(0, 7).map((point) => {
    if (!isRecord(point)) return null;
    const { day, visits, avgDuration } = point;
    if (
      typeof day !== "string" || day.length > 12 ||
      !isFiniteNumberInRange(visits, 0, 1000) ||
      !isFiniteNumberInRange(avgDuration, 0, 86400)
    ) {
      return null;
    }
    return {
      day,
      visits: Math.round(Number(visits)),
      avgDuration: Math.round(Number(avgDuration)),
    };
  });

  if (safeTrendData.some((point) => point === null)) return null;

  return {
    ...(environment ? { environment: environment as PredictiveHealthRequest["environment"] } : {}),
    ...(typeof value.evidenceDays === "number" ? { evidenceDays: value.evidenceDays } : {}),
    idToken,
    catName: catName.trim(),
    displayState: displayState as BehaviorStateId,
    todayVisits: todayVisits === null ? null : Math.round(Number(todayVisits)),
    todayAvgDurationSecs:
      todayAvgDurationSecs === null ? null : Math.round(Number(todayAvgDurationSecs)),
    baseline: safeBaseline,
    sessionCounts: safeSessionCounts,
    trendData: safeTrendData as PredictiveHealthRequest["trendData"],
  };
}

export function summarizePredictiveSessions(
  sessions: readonly PredictiveSession[],
): SessionCounts {
  return sessions.reduce<SessionCounts>((counts, session) => {
    const status = session.sessionStatus?.toUpperCase() ?? "NORMAL";
    const isIncomplete =
      status === "SHORT_SESSION" || status === "SESSION_INTERRUPTED" || status === "NO_EXIT_TIMEOUT" || session.anomalyType === "Short session";
    const isIgnored = status === "IN_PROGRESS" || status === "FALSE_ENTRY_IGNORED";
    const isAbnormal =
      !isIncomplete &&
      (session.anomaly === true || status === "ABNORMAL" || status === "NO_EXIT_TIMEOUT");

    return {
      completed:
        counts.completed +
        (isIncomplete || isIgnored ? 0 : Math.max(1, Math.round(session.summaryVisits ?? 1))),
      incomplete: counts.incomplete + (isIncomplete ? 1 : 0),
      abnormal: counts.abnormal + (isAbnormal ? 1 : 0),
    };
  }, { completed: 0, incomplete: 0, abnormal: 0 });
}

export function parseDurationLabelToSeconds(value: string | null | undefined) {
  if (!value) return null;
  const match = value.trim().match(/^(?:(\d+)m)?\s*(?:(\d+)s)?$/i);
  if (!match || (!match[1] && !match[2])) return null;
  const seconds = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return seconds <= 86400 ? seconds : null;
}

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  return `${formatNumber(seconds / 60)} min`;
};

const comparisonDirection = (current: number, baseline: number) => {
  const percent = Math.round((Math.abs(current - baseline) / baseline) * 100);
  return `${percent}% ${current > baseline ? "above" : "below"}`;
};

const comparisonClause = (
  current: number,
  baseline: number,
  matchingVerb: string,
  comparisonVerb: string,
) => current === baseline
  ? matchingVerb
  : `${comparisonVerb} ${comparisonDirection(current, baseline)}`;

const trendDirection = (first: number, last: number) => {
  if (first === last) return `remained at ${formatNumber(last)}`;
  return `${last > first ? "increased" : "decreased"} from ${formatNumber(first)} to ${formatNumber(last)}`;
};

const durationTrendDirection = (first: number, last: number) => {
  if (first === last) return `remained at ${formatDuration(last)}`;
  return `${last > first ? "increased" : "decreased"} from ${formatDuration(first)} to ${formatDuration(last)}`;
};

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const getSafeNextStep = (state: BehaviorStateId) => {
  switch (state) {
    case "normal":
      return "Continue routine monitoring and compare future visits with this cat's established baseline.";
    case "watch":
      return "Monitor the next litter-box visits. If the changed pattern continues or the cat appears uncomfortable, contact a veterinarian.";
    case "abnormal":
      return "Monitor the next litter-box visits and observe the cat. If the abnormal pattern repeats or the cat shows discomfort, contact a veterinarian.";
    case "incomplete":
      return "Collect more completed Litter Box Sessions before relying on the behavioral comparison.";
    case "unattributed":
      return "Check the collar tag and RFID reader, then collect attributed sessions for this cat.";
    default:
      return "Collect more completed Litter Box Sessions before requesting a reliable behavioral prediction.";
  }
};

export function buildPredictiveHealthEvidence(
  request: PredictiveHealthRequest,
): PredictiveHealthEvidence {
  const { baseline, sessionCounts, trendData } = request;
  const baselineComparison = baseline
    ? [
        request.todayVisits === null
          ? "Today's visit count is unavailable."
          : `Today's ${formatNumber(request.todayVisits)} visits ${comparisonClause(request.todayVisits, baseline.avgVisitsPerDay, "match", "are")} the ${formatNumber(baseline.avgVisitsPerDay)}-visit baseline.`,
        request.todayAvgDurationSecs === null
          ? "Today's average duration is unavailable."
          : `Today's ${formatDuration(request.todayAvgDurationSecs)} average duration ${comparisonClause(request.todayAvgDurationSecs, baseline.avgDurationSecs, "matches", "is")} the ${formatDuration(baseline.avgDurationSecs)} baseline.`,
      ].join(" ")
    : "No established baseline is available, so a reliable comparison cannot be made yet.";

  const observedChanges: string[] = [];
  if (request.environment) {
    if (request.todayVisits !== null) observedChanges.push(`Today: ${pluralize(request.todayVisits, "visit")}${request.todayAvgDurationSecs === null ? "" : `; average duration ${formatDuration(request.todayAvgDurationSecs)}`}.`);
    observedChanges.push(`Environment: Urine ${request.environment.ammonia}; Stool ${request.environment.h2s}. These are box readings, not measurements of this cat's health.`);
  }
  const activeTrend = trendData.filter((point) => point.visits > 0 || point.avgDuration > 0);
  if (activeTrend.length >= 2) {
    const first = activeTrend[0];
    const last = activeTrend[activeTrend.length - 1];
    observedChanges.push(
      `From ${first.day} to ${last.day}, visits ${trendDirection(first.visits, last.visits)} and average duration ${durationTrendDirection(first.avgDuration, last.avgDuration)}.`,
    );
  }
  if (sessionCounts.abnormal > 0) {
    observedChanges.push(
      `${pluralize(sessionCounts.abnormal, "abnormal session")} ${sessionCounts.abnormal === 1 ? "was" : "were"} recorded.`,
    );
  }
  if (sessionCounts.incomplete > 0) {
    observedChanges.push(
      `${pluralize(sessionCounts.incomplete, "incomplete session")} ${sessionCounts.incomplete === 1 ? "was" : "were"} excluded from baseline evidence.`,
    );
  }
  if (observedChanges.length === 0) {
    observedChanges.push("No multi-day change is available from the recorded trend.");
  }

  const excludedText = sessionCounts.incomplete > 0
    ? `; ${pluralize(sessionCounts.incomplete, "incomplete session")} ${sessionCounts.incomplete === 1 ? "was" : "were"} excluded`
    : "";
  const dataQuality = baseline
    ? `Baseline established. Analysis uses ${pluralize(sessionCounts.completed, "completed Litter Box Session")}${excludedText}.`
    : `Limited: no established baseline. Analysis uses ${pluralize(sessionCounts.completed, "completed Litter Box Session")}${excludedText}. More completed Litter Box Sessions are needed before a reliable baseline comparison can be made.`;

  return {
    baselineComparison,
    observedChanges: observedChanges.slice(0, 5),
    dataQuality,
    safeNextStep: getSafeNextStep(request.displayState),
  };
}

export function buildPredictiveHealthPrompt(request: PredictiveHealthRequest) {
  const evidence = buildPredictiveHealthEvidence(request);
  return [
    "Use Urine and Stool for environment readings; never use chemical names, chemical abbreviations, ppm units, confidence labels, or RFID Session labels. Write a plain-language behavioral health summary for a cat owner in two or three sentences and at most 90 words.",
    `The app's official behavior state is \"${request.displayState}\". Explain it, but never change or contradict it.`,
    "Use only the supplied verified evidence. Do not diagnose, predict a disease, name illnesses, invent causes, invent measurements, or claim certainty about the cat's health.",
    "When no personal baseline exists, give a useful preliminary early read using the available visits and environment. Label it preliminary and do not claim a personal baseline comparison. Even zero visits can support setup steps and available environment guidance.",
    "State meanings: normal = matches the cat's usual pattern and limits; watch = within limits but different from the usual pattern; abnormal = a set activity limit was crossed; insufficient = more sessions are needed; incomplete = visit too short; unattributed = no collar tag was read.",
    `Verified evidence: ${JSON.stringify({
      catName: request.catName,
      officialBehaviorState: request.displayState,
      baselineComparison: evidence.baselineComparison,
      observedChanges: evidence.observedChanges,
      dataQuality: evidence.dataQuality,
      safeNextStep: evidence.safeNextStep,
    })}`,
  ].join("\n");
}

export function createPredictiveHealthAnalysis(
  request: PredictiveHealthRequest,
  summary: string,
): PredictiveHealthAnalysis {
  const confidence = (request.evidenceDays ?? 0) >= 7 ? request.baseline && request.sessionCounts.completed >= 14 ? "high" : "medium" : "low";
  return { summary: ownerText(summary), ...buildPredictiveHealthEvidence(request), confidence, preliminary: !request.baseline };
}

export function parseGeminiSummary(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.candidates)) {
    throw new Error("Gemini returned no candidates.");
  }

  const candidate = value.candidates[0];
  const content = isRecord(candidate) ? candidate.content : null;
  const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
  const textPart = parts.find((part) => isRecord(part) && typeof part.text === "string");
  if (!isRecord(textPart) || typeof textPart.text !== "string") {
    throw new Error("Gemini returned no text.");
  }

  const parsed = JSON.parse(textPart.text) as unknown;
  const summary = isRecord(parsed) && typeof parsed.summary === "string"
    ? parsed.summary.trim()
    : "";
  if (!summary || summary.length > 700) {
    throw new Error("Gemini returned an invalid summary.");
  }
  return summary;
}
