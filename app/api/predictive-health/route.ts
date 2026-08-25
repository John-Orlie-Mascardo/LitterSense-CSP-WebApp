/**
 * Authenticated Gemini proxy for short, non-diagnostic behavior explanations.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import {
  buildPredictiveHealthPrompt,
  parseGeminiSummary,
  parsePredictiveHealthRequest,
} from "@/lib/utils/predictiveHealth";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const COOLDOWN_MS = 15_000;
// ponytail: per-instance cooldown; replace with shared rate limiting if public traffic grows.
const lastRequestAtByUser = new Map<string, number>();

export async function POST(req: NextRequest) {
  const request = parsePredictiveHealthRequest(await req.json().catch(() => null));
  if (!request) {
    return NextResponse.json({ error: "Invalid analysis request." }, { status: 400 });
  }

  let adminAuth;
  try {
    adminAuth = getAdminAuth();
  } catch {
    return NextResponse.json({ error: "Authentication service unavailable." }, { status: 503 });
  }

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(request.idToken)).uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = Date.now();
  const lastRequestAt = lastRequestAtByUser.get(uid) ?? 0;
  if (now - lastRequestAt < COOLDOWN_MS) {
    return NextResponse.json(
      { error: "Please wait before requesting another analysis." },
      { status: 429 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI analysis is not configured." }, { status: 503 });
  }
  lastRequestAtByUser.set(uid, now);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPredictiveHealthPrompt(request) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 100,
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: { summary: { type: "string" } },
              required: ["summary"],
            },
          },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );

    if (!response.ok) {
      console.error("[predictive-health] Gemini request failed:", response.status);
      return NextResponse.json({ error: "AI analysis is temporarily unavailable." }, { status: 502 });
    }

    const summary = parseGeminiSummary(await response.json());
    return NextResponse.json(
      { summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[predictive-health] Gemini response failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json({ error: "AI analysis is temporarily unavailable." }, { status: 502 });
  }
}
