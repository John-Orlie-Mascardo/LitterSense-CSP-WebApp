"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";

type StreamState = "unknown" | "connected" | "error";

export function RemoteCamera({ onStreamStateChange }: { readonly onStreamStateChange: (state: StreamState) => void }) {
  const { user } = useAuth();
  const [frame, setFrame] = useState("");
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState("Connecting to your camera...");
  const [retry, setRetry] = useState(0);
  const [fill, setFill] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!user || paused) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let active: AbortController | undefined;
    let socket: WebSocket | undefined;
    let renewTimer: ReturnType<typeof setTimeout>;
    let socketEverConnected = false;
    let polling = false;
    let connectionGeneration = 0;
    let objectUrl = "";
    let frameUrl = "";
    let renewAt = 0;
    let lastFrame = Date.now();
    let lastFrameId = "";
    let metricsAt = Date.now();
    let fetchCount = 0, fetchTotalMs = 0, fetchMaxMs = 0;
    let newFrames = 0, duplicateFrames = 0, emptyResponses = 0;
    let ageCount = 0, ageTotalMs = 0, ageMaxMs = 0;
    const request = async (url: string, options?: RequestInit) => {
      active = new AbortController();
      return fetch(url, { ...options, cache: "no-store", signal: AbortSignal.any([active.signal, AbortSignal.timeout(10000)]) });
    };
    const clearFrame = () => {
      setFrame("");
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = "";
    };
    const markStale = () => {
      if (stopped || Date.now() - lastFrame <= 2500) return;
      setStale(true);
      setMessage("Waiting for a fresh camera frame...");
      onStreamStateChange("error");
      if (Date.now() - lastFrame > 10000) clearFrame();
    };
    const tick = async () => {
      let delay = 250;
      try {
        if (document.hidden) { delay = 1000; return; }
        if (!frameUrl || Date.now() >= renewAt) {
          const response = await request("/api/camera/session", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
          const session = await response.json();
          if (!response.ok) throw new Error(session.error || "Unable to connect to camera.");
          frameUrl = session.frameUrl;
          renewAt = Date.now() + (session.expiresIn - 30) * 1000;
        }
        if (stopped) return;
        const fetchAt = performance.now();
        const response = await request(frameUrl);
        const fetchMs = Math.round(performance.now() - fetchAt);
        fetchCount++;
        fetchTotalMs += fetchMs;
        fetchMaxMs = Math.max(fetchMaxMs, fetchMs);
        if (response.status === 401) { frameUrl = ""; return; }
        if (response.status === 204) {
          emptyResponses++;
          markStale();
          return;
        }
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/jpeg")) throw new Error("Camera relay unavailable. Reconnecting...");
        const frameId = response.headers.get("x-frame-at");
        if (frameId && frameId === lastFrameId) {
          duplicateFrames++;
          markStale();
          return;
        }
        const blob = await response.blob();
        if (stopped) return;
        const next = URL.createObjectURL(blob);
        const previous = objectUrl;
        objectUrl = next;
        setFrame(next);
        if (previous) URL.revokeObjectURL(previous);
        lastFrame = Date.now();
        setStale(false);
        lastFrameId = frameId || "";
        newFrames++;
        const relayAgeMs = Number(response.headers.get("x-frame-age-ms"));
        if (response.headers.has("x-frame-age-ms") && Number.isFinite(relayAgeMs)) {
          ageCount++;
          ageTotalMs += relayAgeMs;
          ageMaxMs = Math.max(ageMaxMs, relayAgeMs);
        }
        setMessage("");
        onStreamStateChange("connected");
      } catch (error) {
        if (!stopped) {
          clearFrame();
          setStale(false);
          setMessage(error instanceof Error ? error.message : "Camera unavailable.");
          onStreamStateChange("error");
          delay = 5000;
        }
      } finally {
        if (!stopped && fetchCount && Date.now() - metricsAt >= 10000) {
          console.info("Camera live timing", {
            requests: fetchCount, newFrames, duplicateFrames, emptyResponses,
            fetchAvgMs: Math.round(fetchTotalMs / fetchCount), fetchMaxMs,
            relayAgeAvgMs: ageCount ? Math.round(ageTotalMs / ageCount) : null, relayAgeMaxMs: ageCount ? ageMaxMs : null,
          });
          metricsAt = Date.now();
          fetchCount = fetchTotalMs = fetchMaxMs = 0;
          newFrames = duplicateFrames = emptyResponses = 0;
          ageCount = ageTotalMs = ageMaxMs = 0;
        }
        if (!stopped) timer = setTimeout(tick, delay);
      }
    };
    setStale(false);
    onStreamStateChange("unknown");
    const startSocket = async () => {
      if (stopped || document.hidden || polling) return;
      const generation = ++connectionGeneration;
      try {
        const response = await request("/api/camera/session", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        const session = await response.json();
        if (!response.ok) throw new Error(session.error || "Unable to connect to camera.");
        if (stopped || document.hidden || generation !== connectionGeneration) return;
        frameUrl = session.frameUrl;
        renewAt = Date.now() + (session.expiresIn - 30) * 1000;
        if (!session.streamUrl) { polling = true; void tick(); return; }
        const ws = new WebSocket(session.streamUrl);
        socket = ws;
        ws.binaryType = "arraybuffer";
        const connectTimeout = setTimeout(() => ws.close(), 10000);
        ws.onopen = () => {
          clearTimeout(connectTimeout);
          socketEverConnected = true;
          setMessage("Waiting for a fresh camera frame...");
          renewTimer = setTimeout(() => ws.close(), Math.max(1000, renewAt - Date.now()));
        };
        ws.onmessage = async event => {
          if (stopped || socket !== ws || document.hidden || !(event.data instanceof ArrayBuffer) || event.data.byteLength < 12) return;
          const next = URL.createObjectURL(new Blob([event.data.slice(8)], { type: "image/jpeg" }));
          try {
            const image = new Image();
            image.src = next;
            await image.decode();
            if (stopped || socket !== ws || document.hidden) { URL.revokeObjectURL(next); return; }
            const previous = objectUrl;
            objectUrl = next;
            setFrame(next);
            lastFrame = Date.now();
            newFrames++;
            setStale(false);
            setMessage("");
            onStreamStateChange("connected");
            // One outstanding frame per viewer. The relay keeps the newest frame while decoding.
            requestAnimationFrame(() => {
              if (previous) URL.revokeObjectURL(previous);
              if (socket === ws && ws.readyState === WebSocket.OPEN) ws.send("ready");
            });
          } catch {
            URL.revokeObjectURL(next);
            if (ws.readyState === WebSocket.OPEN) ws.close();
          }
        };
        ws.onclose = () => {
          clearTimeout(connectTimeout);
          if (socket !== ws) return;
          clearTimeout(renewTimer);
          socket = undefined;
          if (stopped || document.hidden) return;
          markStale();
          if (!socketEverConnected) { polling = true; void tick(); }
          else timer = setTimeout(startSocket, 1500);
        };
        ws.onerror = () => ws.close();
      } catch (error) {
        if (stopped || generation !== connectionGeneration) return;
        setMessage(error instanceof Error ? error.message : "Camera unavailable.");
        onStreamStateChange("error");
        timer = setTimeout(startSocket, 5000);
      }
    };
    const visibility = () => {
      if (polling) return;
      ++connectionGeneration;
      clearTimeout(timer);
      clearTimeout(renewTimer);
      socket?.close();
      socket = undefined;
      if (!document.hidden) void startSocket();
    };
    document.addEventListener("visibilitychange", visibility);
    const freshness = setInterval(() => {
      if (document.hidden || stopped) return;
      markStale();
      if (!polling && Date.now() - metricsAt >= 10000) {
        console.info("Camera live timing", { transport: "websocket", newFrames, intervalMs: Date.now() - metricsAt, lastFrameAgoMs: Date.now() - lastFrame });
        newFrames = 0;
        metricsAt = Date.now();
      }
    }, 1000);
    void startSocket();
    return () => {
      stopped = true;
      ++connectionGeneration;
      document.removeEventListener("visibilitychange", visibility);
      clearInterval(freshness);
      clearTimeout(renewTimer);
      socket?.close();
      active?.abort();
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user, retry, paused, onStreamStateChange]);

  async function pair() {
    if (!user) return;
    setPairing(true);
    try {
      const response = await fetch("/api/camera/pair", { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to pair camera.");
      setPairingCode(data.pairingCode);
      setRetry(value => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pairing failed."); }
    finally { setPairing(false); }
  }

  return <div className="space-y-3">
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#1C1C1C]">
      {frame && !paused ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imageRef} src={frame} alt="Live view of your litterbox" className={`h-full w-full rotate-180 ${fill ? "object-cover" : "object-contain"}`} />
        <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs text-white ${stale ? "bg-amber-700/80" : "bg-black/70"}`}>{stale ? "WAITING" : "LIVE"}</span>
      </> : <p role="status" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">{paused ? "Camera paused" : message || "Connecting to your camera..."}</p>}
    </div>
    <div className="flex flex-wrap gap-3 text-sm text-litter-primary">
      <button onClick={() => { setPaused(value => !value); setFrame(""); setStale(false); onStreamStateChange("unknown"); }}>{paused ? "Resume" : "Pause"}</button>
      <button onClick={() => setFill(value => !value)}>{fill ? "Full view" : "Fill"}</button>
      <button onClick={() => setRetry(value => value + 1)}>Reconnect</button>
      <button onClick={() => setShowPairing(value => !value)}>Pair camera</button>
    </div>
    {showPairing && <div className="space-y-3 rounded-xl border border-litter-border bg-litter-card p-4 text-sm text-litter-text">
      <p>Create a pairing code, then paste it into the camera&apos;s LitterSense-Setup page at http://192.168.4.1. The code is shown only here; keep it private.</p>
      <p>Creating a new code replaces your previous camera pairing. Existing viewing sessions expire within five minutes.</p>
      <button disabled={pairing} onClick={pair} className="rounded-lg bg-litter-primary px-4 py-2 text-white disabled:opacity-50">{pairing ? "Creating..." : "Create pairing code"}</button>
      {pairingCode && <><label className="block" htmlFor="camera-pairing-code">Camera pairing code</label><textarea id="camera-pairing-code" readOnly value={pairingCode} rows={4} className="w-full rounded-lg border border-litter-border bg-litter-bg p-2" onFocus={event => event.target.select()} /><p>On the camera&apos;s Serial Monitor, send <code>setup</code> to open its setup hotspot, then join it on your phone. Save this code under Remote camera.</p></>}
    </div>}
  </div>;
}
