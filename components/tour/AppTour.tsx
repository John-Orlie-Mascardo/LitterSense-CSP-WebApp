"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTour } from "@/components/tour/TourProvider";

interface VisibleTargetRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  viewportHeight: number;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function findVisibleTarget(target: string | null): VisibleTargetRect | null {
  if (!target) return null;

  const candidates = document.querySelectorAll<HTMLElement>(
    `[data-tour="${target}"]`,
  );

  for (const candidate of candidates) {
    const style = window.getComputedStyle(candidate);
    const rect = candidate.getBoundingClientRect();
    const isVisible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number.parseFloat(style.opacity || "1") > 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;

    if (isVisible) {
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        viewportHeight: window.innerHeight,
      };
    }
  }

  return null;
}

function sameRect(
  previous: VisibleTargetRect | null,
  next: VisibleTargetRect | null,
): boolean {
  if (!previous || !next) return previous === next;

  return (
    previous.top === next.top &&
    previous.right === next.right &&
    previous.bottom === next.bottom &&
    previous.left === next.left &&
    previous.width === next.width &&
    previous.height === next.height &&
    previous.viewportHeight === next.viewportHeight
  );
}

export function AppTour() {
  const {
    isOpen,
    activeStepIndex,
    steps,
    closeWithoutCompletion,
    goBack,
    goNext,
    skipTour,
  } = useTour();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [targetRect, setTargetRect] = useState<VisibleTargetRect | null>(null);
  const activeStep = steps[activeStepIndex];

  useLayoutEffect(() => {
    if (!isOpen || !activeStep) return;

    const updateTarget = () => {
      const nextRect = findVisibleTarget(activeStep.target);
      setTargetRect((previous) =>
        sameRect(previous, nextRect) ? previous : nextRect,
      );
    };

    updateTarget();
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);

    return () => {
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [activeStep, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeWithoutCompletion();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0);

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (
        event.shiftKey &&
        (activeElement === first || activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus.current?.isConnected) {
        previousFocus.current.focus();
      }
    };
  }, [closeWithoutCompletion, isOpen]);

  if (!activeStep && isOpen) return null;

  const highlightPadding = 6;
  const highlight = targetRect
    ? {
        top: Math.max(0, targetRect.top - highlightPadding),
        right: Math.min(window.innerWidth, targetRect.right + highlightPadding),
        bottom: Math.min(
          targetRect.viewportHeight,
          targetRect.bottom + highlightPadding,
        ),
        left: Math.max(0, targetRect.left - highlightPadding),
      }
    : null;
  const highlightWidth = highlight ? highlight.right - highlight.left : 0;
  const highlightHeight = highlight ? highlight.bottom - highlight.top : 0;
  const cardPosition = targetRect
    ? targetRect.top > targetRect.viewportHeight / 2
      ? "top-4"
      : "bottom-4"
    : "top-1/2 -translate-y-1/2";
  const duration = reducedMotion ? 0 : 0.18;

  return (
    <AnimatePresence>
      {isOpen && activeStep && (
        <motion.div
          key="app-tour"
          className="pointer-events-none fixed inset-0 z-[60]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration }}
        >
          {highlight ? (
            <>
              <BackdropPanel
                style={{ top: 0, right: 0, left: 0, height: highlight.top }}
              />
              <BackdropPanel
                style={{
                  top: highlight.bottom,
                  right: 0,
                  bottom: 0,
                  left: 0,
                }}
              />
              <BackdropPanel
                style={{
                  top: highlight.top,
                  left: 0,
                  width: highlight.left,
                  height: highlightHeight,
                }}
              />
              <BackdropPanel
                style={{
                  top: highlight.top,
                  left: highlight.right,
                  right: 0,
                  height: highlightHeight,
                }}
              />
              <motion.div
                aria-hidden="true"
                className="pointer-events-auto fixed rounded-xl border-2 border-litter-primary ring-4 ring-litter-primary/40"
                style={{
                  top: highlight.top,
                  left: highlight.left,
                  width: highlightWidth,
                  height: highlightHeight,
                }}
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration }}
              />
            </>
          ) : (
            <BackdropPanel style={{ inset: 0 }} />
          )}

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-step-title"
            aria-describedby="tour-step-description"
            tabIndex={-1}
            className={`pointer-events-auto fixed left-1/2 ${cardPosition} max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 overflow-y-auto rounded-2xl border border-litter-border bg-litter-card p-5 text-litter-text shadow-2xl focus:outline-none`}
            initial={
              reducedMotion ? false : { opacity: 0, y: targetRect ? 8 : 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration }}
          >
            <div aria-live="polite" aria-atomic="true">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-litter-primary">
                {activeStepIndex + 1} of {steps.length}
              </p>
              <h2
                id="tour-step-title"
                className="font-display text-xl font-semibold text-litter-text"
              >
                {activeStep.title}
              </h2>
              <p
                id="tour-step-description"
                className="mt-2 text-sm leading-6 text-theme-secondary"
              >
                {activeStep.description}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={skipTour}
                className="rounded-lg px-2 py-2 text-sm font-medium text-theme-secondary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-litter-primary"
              >
                Skip tour
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={activeStepIndex === 0}
                  className="rounded-xl border border-litter-border px-4 py-2 text-sm font-semibold text-litter-text transition-colors hover:bg-theme-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-litter-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-xl bg-litter-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-litter-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-litter-primary focus-visible:ring-offset-2 focus-visible:ring-offset-litter-card"
                >
                  {activeStepIndex === steps.length - 1 ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BackdropPanel({ style }: { style: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-auto fixed bg-black/55"
      style={style}
    />
  );
}
