"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/* ─── Paw-print SVG path (reusable) ─── */
const PawPath = () => (
  <g>
    {/* Main pad */}
    <ellipse cx="12" cy="15" rx="4.5" ry="3.5" />
    {/* Toe beans */}
    <circle cx="6.5" cy="9.5" r="2" />
    <circle cx="17.5" cy="9.5" r="2" />
    <circle cx="9" cy="6" r="1.8" />
    <circle cx="15" cy="6" r="1.8" />
  </g>
);

/* ─── Floating paw prints (background) ─── */
const floatingPaws = [
  { id: 1, x: "8%",   y: "12%", size: 28, rotate: -20,  delay: 0,   duration: 18 },
  { id: 2, x: "85%",  y: "8%",  size: 22, rotate: 15,   delay: 2,   duration: 22 },
  { id: 3, x: "15%",  y: "75%", size: 32, rotate: -35,  delay: 4,   duration: 20 },
  { id: 4, x: "78%",  y: "80%", size: 24, rotate: 25,   delay: 1,   duration: 16 },
  { id: 5, x: "50%",  y: "5%",  size: 20, rotate: -10,  delay: 3,   duration: 24 },
  { id: 6, x: "92%",  y: "45%", size: 26, rotate: 40,   delay: 5,   duration: 19 },
  { id: 7, x: "5%",   y: "45%", size: 18, rotate: -45,  delay: 2.5, duration: 21 },
  { id: 8, x: "35%",  y: "90%", size: 30, rotate: 10,   delay: 1.5, duration: 17 },
  { id: 9, x: "65%",  y: "88%", size: 20, rotate: -25,  delay: 3.5, duration: 23 },
  { id: 10, x: "25%", y: "20%", size: 16, rotate: 30,   delay: 4.5, duration: 25 },
];

/* ─── Tiny sparkle particles ─── */
const particles = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: `${Math.random() * 100}%`,
  y: `${Math.random() * 100}%`,
  size: Math.random() * 4 + 2,
  delay: Math.random() * 6,
  duration: Math.random() * 4 + 3,
}));

/* ─── Curious Cat SVG Illustration ─── */
function CuriousCat() {
  return (
    <motion.svg
      viewBox="0 0 200 200"
      className="w-40 h-40 md:w-52 md:h-52"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      {/* Body */}
      <motion.ellipse
        cx="100" cy="140" rx="42" ry="35"
        className="fill-litter-primary"
        opacity={0.15}
      />
      <motion.ellipse
        cx="100" cy="138" rx="38" ry="32"
        className="fill-litter-primary"
        opacity={0.25}
      />

      {/* Tail */}
      <motion.path
        d="M 138 140 Q 165 110, 155 80 Q 150 65, 160 55"
        fill="none"
        className="stroke-litter-primary"
        strokeWidth="5"
        strokeLinecap="round"
        opacity={0.3}
        animate={{ d: [
          "M 138 140 Q 165 110, 155 80 Q 150 65, 160 55",
          "M 138 140 Q 170 115, 158 82 Q 148 60, 165 50",
          "M 138 140 Q 165 110, 155 80 Q 150 65, 160 55",
        ]}}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Head */}
      <motion.circle
        cx="100" cy="90" r="32"
        className="fill-litter-primary"
        opacity={0.2}
      />

      {/* Left ear */}
      <motion.path
        d="M 72 72 L 60 40 L 82 62 Z"
        className="fill-litter-primary"
        opacity={0.25}
      />
      {/* Inner left ear */}
      <path
        d="M 73 68 L 64 46 L 80 62 Z"
        className="fill-litter-primary"
        opacity={0.1}
      />

      {/* Right ear */}
      <motion.path
        d="M 128 72 L 140 40 L 118 62 Z"
        className="fill-litter-primary"
        opacity={0.25}
      />
      {/* Inner right ear */}
      <path
        d="M 127 68 L 136 46 L 120 62 Z"
        className="fill-litter-primary"
        opacity={0.1}
      />

      {/* Eyes — blinking */}
      <motion.ellipse
        cx="88" cy="87" rx="5" ry="5.5"
        className="fill-litter-primary"
        opacity={0.5}
        animate={{ ry: [5.5, 5.5, 0.5, 5.5, 5.5] }}
        transition={{ duration: 4, repeat: Infinity, times: [0, 0.42, 0.46, 0.50, 1] }}
      />
      <motion.ellipse
        cx="112" cy="87" rx="5" ry="5.5"
        className="fill-litter-primary"
        opacity={0.5}
        animate={{ ry: [5.5, 5.5, 0.5, 5.5, 5.5] }}
        transition={{ duration: 4, repeat: Infinity, times: [0, 0.42, 0.46, 0.50, 1] }}
      />
      {/* Eye shine */}
      <circle cx="86" cy="85" r="1.5" fill="white" opacity={0.6} />
      <circle cx="110" cy="85" r="1.5" fill="white" opacity={0.6} />

      {/* Nose */}
      <path
        d="M 97 95 L 100 99 L 103 95 Z"
        className="fill-litter-primary"
        opacity={0.35}
      />

      {/* Whiskers */}
      <motion.g
        opacity={0.2}
        className="stroke-litter-primary"
        strokeWidth="1.2"
        strokeLinecap="round"
        animate={{ x: [0, 1.5, 0, -1.5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <line x1="75" y1="92" x2="50" y2="88" />
        <line x1="75" y1="96" x2="48" y2="97" />
        <line x1="75" y1="100" x2="50" y2="106" />
        <line x1="125" y1="92" x2="150" y2="88" />
        <line x1="125" y1="96" x2="152" y2="97" />
        <line x1="125" y1="100" x2="150" y2="106" />
      </motion.g>

      {/* Mouth – subtle smile */}
      <path
        d="M 95 100 Q 100 105, 105 100"
        fill="none"
        className="stroke-litter-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.25}
      />

      {/* Front paws */}
      <ellipse cx="82" cy="162" rx="10" ry="6" className="fill-litter-primary" opacity={0.15} />
      <ellipse cx="118" cy="162" rx="10" ry="6" className="fill-litter-primary" opacity={0.15} />

      {/* "?" thought bubble */}
      <motion.g
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx="145" cy="55" r="16" className="fill-litter-primary" opacity={0.08} />
        <circle cx="145" cy="55" r="14" fill="none" className="stroke-litter-primary" strokeWidth="1.5" opacity={0.2} />
        <text x="145" y="61" textAnchor="middle" className="fill-litter-primary" opacity={0.35} fontSize="18" fontFamily="Outfit, sans-serif" fontWeight="700">?</text>
        <circle cx="134" cy="68" r="4" className="fill-litter-primary" opacity={0.06} />
        <circle cx="130" cy="75" r="2.5" className="fill-litter-primary" opacity={0.04} />
      </motion.g>
    </motion.svg>
  );
}

export default function NotFound() {
  /* Hydration-safe mounting for particles */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-litter-bg flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">

      {/* ── Animated gradient orbs ── */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full opacity-[0.07]"
        style={{
          background: "radial-gradient(circle, var(--color-primary) 0%, transparent 70%)",
          top: "-10%",
          left: "-10%",
        }}
        animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full opacity-[0.05]"
        style={{
          background: "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)",
          bottom: "-5%",
          right: "-5%",
        }}
        animate={{ x: [0, -50, 0], y: [0, -30, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Floating paw prints ── */}
      {floatingPaws.map((paw) => (
        <motion.svg
          key={paw.id}
          viewBox="0 0 24 24"
          className="absolute text-litter-primary pointer-events-none"
          style={{
            width: paw.size,
            height: paw.size,
            left: paw.x,
            top: paw.y,
          }}
          fill="currentColor"
          opacity={0}
          animate={{
            y: [0, -25, 0, 20, 0],
            x: [0, 12, -8, 5, 0],
            rotate: [paw.rotate, paw.rotate + 15, paw.rotate - 10, paw.rotate + 8, paw.rotate],
            opacity: [0.06, 0.12, 0.08, 0.14, 0.06],
          }}
          transition={{
            duration: paw.duration,
            delay: paw.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <PawPath />
        </motion.svg>
      ))}

      {/* ── Sparkle particles ── */}
      {mounted && particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-litter-primary pointer-events-none"
          style={{
            width: p.size,
            height: p.size,
            left: p.x,
            top: p.y,
          }}
          animate={{
            opacity: [0, 0.3, 0],
            scale: [0.5, 1.2, 0.5],
            y: [0, -20, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* ── Main card ── */}
      <motion.div
        className="bg-litter-card/80 backdrop-blur-xl p-8 md:p-12 rounded-[2rem] shadow-2xl shadow-[#1B7A6E]/8 border border-litter-border/60 max-w-lg w-full relative overflow-hidden z-10"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#145C54] via-[#1B7A6E] to-litter-accent" />

        {/* Subtle shimmer overlay */}
        <motion.div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            background: "linear-gradient(105deg, transparent 40%, var(--color-primary) 50%, transparent 60%)",
            backgroundSize: "200% 100%",
          }}
          animate={{ backgroundPosition: ["200% 0%", "-200% 0%"] }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
        />

        {/* Cat illustration */}
        <div className="flex justify-center mb-2">
          <CuriousCat />
        </div>

        {/* 404 number */}
        <motion.h1
          className="font-display font-extrabold text-8xl md:text-9xl text-litter-primary mb-1 relative"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2, type: "spring", stiffness: 120 }}
        >
          <span className="relative z-10">404</span>
          {/* Glow behind text */}
          <span
            className="absolute inset-0 text-litter-primary blur-2xl opacity-20 z-0"
            aria-hidden="true"
          >
            404
          </span>
        </motion.h1>

        {/* Divider line */}
        <motion.div
          className="w-16 h-0.5 bg-litter-primary/20 mx-auto mb-4"
          initial={{ width: 0 }}
          animate={{ width: 64 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        />

        {/* Message */}
        <motion.h2
          className="font-display font-bold text-xl md:text-2xl text-litter-text mb-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          This page could not be found
        </motion.h2>

        <motion.p
          className="text-litter-muted mb-8 max-w-sm mx-auto text-sm md:text-base"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
        >
          Looks like this curious cat wandered off the trail. Let&apos;s get you back on track.
        </motion.p>

        {/* CTA button */}
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55 }}
        >
          <Link
            href="/"
            className="group w-full sm:w-auto py-3.5 px-8 bg-litter-primary text-white font-semibold rounded-xl shadow-lg shadow-[#1B7A6E]/25 hover:shadow-xl hover:shadow-[#1B7A6E]/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2.5"
          >
            <Home className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
            Return to Home
          </Link>
        </motion.div>
      </motion.div>

      {/* ── Bottom paw trail (walking away) ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 opacity-[0.08] pointer-events-none">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.svg
            key={i}
            viewBox="0 0 24 24"
            className="text-litter-primary"
            style={{ width: 18 - i * 2, height: 18 - i * 2 }}
            fill="currentColor"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1 - i * 0.15, y: 0 }}
            transition={{ duration: 0.4, delay: 0.8 + i * 0.15 }}
          >
            <PawPath />
          </motion.svg>
        ))}
      </div>
    </div>
  );
}
