import { shouldSkipServerSensorProxy } from "@/lib/utils/sensorEndpointDiagnostics";

const DEFAULT_ESP32_BASE_URL = "http://192.168.68.120";

export async function GET(request: Request) {
  if (process.env.VERCEL === "1") return new Response("Use the authenticated remote camera viewer.", { status: 410, headers: { "Cache-Control": "no-store" } });
  const capture = new URL(request.url).searchParams.get("capture") === "1";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const baseUrl = process.env.ESP32_BASE_URL?.trim() || DEFAULT_ESP32_BASE_URL;
    const streamUrl = new URL(baseUrl);
    streamUrl.port = "81";
    streamUrl.pathname = "/stream";
    const url = capture
      ? new URL("/capture", baseUrl)
      : new URL(process.env.ESP32_STREAM_URL?.trim() || streamUrl.toString());
    if (shouldSkipServerSensorProxy(url.toString(), process.env.VERCEL === "1")) {
      return new Response("Camera requires a cloud-reachable endpoint", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const upstream = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.any([request.signal, controller.signal]),
    });

    if (!upstream.ok) {
      await upstream.body?.cancel();
      return new Response("Camera unavailable", { status: 503 });
    }
    const contentType = upstream.headers.get("Content-Type") ?? "";
    if (capture && !contentType.startsWith("image/jpeg")) {
      await upstream.body?.cancel();
      return new Response("Camera did not return an image", { status: 502 });
    }

    return new Response(capture ? await upstream.arrayBuffer() : upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          contentType ||
          "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache, no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("Stream unavailable", { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
