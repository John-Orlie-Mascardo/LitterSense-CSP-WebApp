"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";

type StreamState = "unknown" | "connected" | "error";

export function RemoteCamera({ onStreamStateChange }: { readonly onStreamStateChange: (state: StreamState) => void }) {
  const { user } = useAuth();
  const [frame, setFrame] = useState("");
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
    let objectUrl = "";
    let frameUrl = "";
    let renewAt = 0;
    let lastFrame = Date.now();
    const request = async (url: string, options?: RequestInit) => {
      active = new AbortController();
      return fetch(url, { ...options, cache: "no-store", signal: AbortSignal.any([active.signal, AbortSignal.timeout(10000)]) });
    };
    const clearFrame = () => {
      setFrame("");
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = "";
    };
    const tick = async () => {
      let delay = 450;
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
        const response = await request(frameUrl);
        if (response.status === 401) { frameUrl = ""; return; }
        if (response.status === 204) {
          if (Date.now() - lastFrame > 12000 && !stopped) {
            clearFrame();
            setMessage("Camera offline or waiting for its first frame. Reconnecting...");
            onStreamStateChange("error");
          }
          return;
        }
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/jpeg")) throw new Error("Camera relay unavailable. Reconnecting...");
        const blob = await response.blob();
        if (stopped) return;
        const next = URL.createObjectURL(blob);
        const previous = objectUrl;
        objectUrl = next;
        setFrame(next);
        if (previous) URL.revokeObjectURL(previous);
        lastFrame = Date.now();
        setMessage("");
        onStreamStateChange("connected");
      } catch (error) {
        if (!stopped) {
          clearFrame();
          setMessage(error instanceof Error ? error.message : "Camera unavailable.");
          onStreamStateChange("error");
          delay = 5000;
        }
      } finally { if (!stopped) timer = setTimeout(tick, delay); }
    };
    onStreamStateChange("unknown");
    void tick();
    return () => {
      stopped = true;
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
        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">LIVE</span>
      </> : <p role="status" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">{paused ? "Camera paused" : message || "Connecting to your camera..."}</p>}
    </div>
    <div className="flex flex-wrap gap-3 text-sm text-litter-primary">
      <button onClick={() => { setPaused(value => !value); setFrame(""); onStreamStateChange("unknown"); }}>{paused ? "Resume" : "Pause"}</button>
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
