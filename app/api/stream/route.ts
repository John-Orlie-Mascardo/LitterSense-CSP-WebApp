const DEFAULT_ESP32_BASE_URL = "http://192.168.68.116";

const ESP32_STREAM_URL =
  process.env.ESP32_STREAM_URL ??
  `${process.env.ESP32_BASE_URL ?? DEFAULT_ESP32_BASE_URL}:81/stream`;

export async function GET() {
  try {
    const upstream = await fetch(ESP32_STREAM_URL, { cache: "no-store" });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ??
          "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache, no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("Stream unavailable", { status: 503 });
  }
}
