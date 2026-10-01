import { timingSafeEqual } from "node:crypto";
import { processSmsOutbox } from "@/lib/utils/smsDelivery";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const expected = process.env.SMS_PROCESS_SECRET ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await processSmsOutbox(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "SMS processing unavailable" }, { status: 503 }); }
}
