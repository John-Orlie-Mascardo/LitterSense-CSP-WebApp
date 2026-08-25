/**
 * Validates predictive-health API input and Gemini's structured response.
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

export interface PredictiveHealthRequest {
  readonly idToken: string;
  readonly catName: string;
  readonly displayState: BehaviorStateId;
  readonly todayVisits: string | number;
  readonly todayAvgDuration: string;
  readonly trendData: readonly {
    readonly day: string;
    readonly visits: number;
    readonly avgDuration: number;
  }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function parsePredictiveHealthRequest(value: unknown): PredictiveHealthRequest | null {
  if (!isRecord(value)) return null;

  const { idToken, catName, displayState, todayVisits, todayAvgDuration, trendData } = value;
  if (
    typeof idToken !== "string" || idToken.length < 1 || idToken.length > 4096 ||
    typeof catName !== "string" || catName.trim().length < 1 || catName.length > 80 ||
    typeof displayState !== "string" || !DISPLAY_STATES.has(displayState as BehaviorStateId) ||
    (typeof todayVisits !== "string" && typeof todayVisits !== "number") ||
    typeof todayAvgDuration !== "string" || todayAvgDuration.length > 40 ||
    (!Array.isArray(trendData) && trendData !== null)
  ) {
    return null;
  }

  const safeTrendData = (trendData ?? []).slice(0, 7).map((point) => {
    if (!isRecord(point)) return null;
    const { day, visits, avgDuration } = point;
    if (
      typeof day !== "string" || day.length > 12 ||
      typeof visits !== "number" || !Number.isFinite(visits) || visits < 0 || visits > 1000 ||
      typeof avgDuration !== "number" || !Number.isFinite(avgDuration) ||
      avgDuration < 0 || avgDuration > 86400
    ) {
      return null;
    }
    return { day, visits: Math.round(visits), avgDuration: Math.round(avgDuration) };
  });

  if (safeTrendData.some((point) => point === null)) return null;

  return {
    idToken,
    catName: catName.trim(),
    displayState: displayState as BehaviorStateId,
    todayVisits,
    todayAvgDuration,
    trendData: safeTrendData as PredictiveHealthRequest["trendData"],
  };
}

export function buildPredictiveHealthPrompt(request: PredictiveHealthRequest) {
  return [
    "Explain the supplied cat litter-box metrics in one plain-language sentence of at most 35 words.",
    "Describe only recorded patterns. Do not diagnose, predict a disease, name illnesses, or change the supplied display state.",
    "If the display state is insufficient, say that more recorded sessions are needed.",
    `Metrics: ${JSON.stringify({
      catName: request.catName,
      displayState: request.displayState,
      todayVisits: request.todayVisits,
      todayAvgDuration: request.todayAvgDuration,
      sevenDayTrend: request.trendData,
    })}`,
  ].join("\n");
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
  if (!summary || summary.length > 320) {
    throw new Error("Gemini returned an invalid summary.");
  }
  return summary;
}
