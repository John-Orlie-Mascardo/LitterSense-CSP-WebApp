"use client";
import { useEffect, useState } from "react";

export function RfidHoldProgress({ status, holdMs = 0, tag, sample, paused = false }: { status: string; holdMs?: number; tag: string; sample?: number; paused?: boolean }) {
  const [animation, setAnimation] = useState({ sample, elapsed: 0 });
  useEffect(() => {
    if (status !== "holding" || paused) return;
    const start = performance.now();
    let frame: number;
    const tick = () => {
      setAnimation({ sample, elapsed: Math.min(performance.now() - start, 2000) });
      if (performance.now() - start < 2000) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, holdMs, tag, sample, paused]);
  // Animation never verifies a tag: only the backend's completed reader proof can fill the ring.
  const progress = status === "verified" ? 1 : status === "holding" && !paused
    ? Math.min(0.95, (holdMs + (animation.sample === sample ? animation.elapsed : 0)) / 5000) : 0;
  return <div role="progressbar" aria-label="Hold tag on reader for 5 seconds" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="relative flex h-14 w-14 items-center justify-center text-litter-primary">
    <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="28" cy="28" r="24" fill="none" stroke="var(--color-border)" strokeWidth="3" />
      <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="3" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} strokeLinecap="round" />
    </svg>
    <span className="text-lg font-semibold">{status === "verified" ? "✓" : "1"}</span>
  </div>;
}
