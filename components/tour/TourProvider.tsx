"use client";

/* eslint-disable react-hooks/set-state-in-effect -- The tour intentionally opens and closes in response to auth, route, and localStorage synchronization. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  getTourSteps,
  type DashboardTourState,
  type TourStep,
} from "@/components/tour/tourSteps";

const TOUR_STORAGE_KEY_PREFIX = "littersense_tour_done:";
const sessionSuppressedUsers = new Set<string>();

interface TourContextValue {
  isOpen: boolean;
  activeStepIndex: number;
  steps: TourStep[];
  reportDashboardState: (state: DashboardTourState | null) => void;
  requestReplay: () => void;
  closeWithoutCompletion: () => void;
  goBack: () => void;
  goNext: () => void;
  skipTour: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading, profileLoading, isAdmin } = useAuth();
  const uid = user?.uid ?? null;
  const [dashboardState, setDashboardState] =
    useState<DashboardTourState | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [replayRequested, setReplayRequested] = useState(false);
  const autoStartAttemptedFor = useRef<string | null>(null);
  const previousUid = useRef<string | null>(uid);

  const steps = useMemo(
    () => (dashboardState ? getTourSteps(dashboardState) : []),
    [dashboardState],
  );

  const reportDashboardState = useCallback(
    (state: DashboardTourState | null) => setDashboardState(state),
    [],
  );

  const closeWithoutCompletion = useCallback(() => {
    setIsOpen(false);
  }, []);

  const requestReplay = useCallback(() => {
    setActiveStepIndex(0);
    setReplayRequested(true);
  }, []);

  const markCompleteAndClose = useCallback(() => {
    if (uid) {
      sessionSuppressedUsers.add(uid);
      try {
        window.localStorage.setItem(`${TOUR_STORAGE_KEY_PREFIX}${uid}`, "true");
      } catch {
        // The in-memory suppression above prevents a storage failure from
        // reopening the tour during this browser session.
      }
    }

    setReplayRequested(false);
    setIsOpen(false);
  }, [uid]);

  const goBack = useCallback(() => {
    setActiveStepIndex((current) => Math.max(0, current - 1));
  }, []);

  const goNext = useCallback(() => {
    if (activeStepIndex >= steps.length - 1) {
      markCompleteAndClose();
      return;
    }

    setActiveStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [activeStepIndex, markCompleteAndClose, steps.length]);

  useEffect(() => {
    if (previousUid.current === uid) return;

    previousUid.current = uid;
    autoStartAttemptedFor.current = null;
    setReplayRequested(false);
    setIsOpen(false);
  }, [uid]);

  useEffect(() => {
    if (pathname === "/dashboard") return;

    setIsOpen(false);
    setDashboardState(null);
    autoStartAttemptedFor.current = null;
  }, [pathname]);

  useEffect(() => {
    if (
      pathname !== "/dashboard" ||
      !dashboardState ||
      !uid ||
      loading ||
      profileLoading ||
      isAdmin
    ) {
      return;
    }

    if (replayRequested) {
      autoStartAttemptedFor.current = uid;
      setActiveStepIndex(0);
      setReplayRequested(false);
      setIsOpen(true);
      return;
    }

    if (
      autoStartAttemptedFor.current === uid ||
      sessionSuppressedUsers.has(uid)
    ) {
      return;
    }

    autoStartAttemptedFor.current = uid;

    try {
      if (
        window.localStorage.getItem(`${TOUR_STORAGE_KEY_PREFIX}${uid}`) ===
        "true"
      ) {
        return;
      }
    } catch {
      sessionSuppressedUsers.add(uid);
      return;
    }

    setActiveStepIndex(0);
    setIsOpen(true);
  }, [
    dashboardState,
    isAdmin,
    loading,
    pathname,
    profileLoading,
    replayRequested,
    uid,
  ]);

  const value = useMemo<TourContextValue>(
    () => ({
      isOpen,
      activeStepIndex,
      steps,
      reportDashboardState,
      requestReplay,
      closeWithoutCompletion,
      goBack,
      goNext,
      skipTour: markCompleteAndClose,
    }),
    [
      activeStepIndex,
      closeWithoutCompletion,
      goBack,
      goNext,
      isOpen,
      markCompleteAndClose,
      reportDashboardState,
      requestReplay,
      steps,
    ],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used inside TourProvider");
  }

  return context;
}
