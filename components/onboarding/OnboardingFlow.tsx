"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  CircleCheck,
  Loader2,
  PawPrint,
  Radio,
  ShieldCheck,
  Sparkles,
  Tag,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { arrayUnion, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";
import { defaultOnboardingNotificationPreferences } from "@/lib/utils/onboardingState";
import { getFirebaseMessagingToken } from "@/lib/utils/firebaseMessaging";

type PermissionState = "idle" | "granted" | "denied" | "unsupported";

const steps = [
  "Welcome",
  "How it works",
  "Notifications",
  "Preferences",
  "Done",
] as const;

const howItWorksItems = [
  {
    icon: Tag,
    title: "RFID identifies your cat",
    body: "Each registered tag connects visits to the right profile.",
  },
  {
    icon: Wind,
    title: "Sensors track visits",
    body: "The device watches litter activity and air quality changes.",
  },
  {
    icon: ShieldCheck,
    title: "Trends reveal changes",
    body: "Dashboard summaries help you notice unusual patterns earlier.",
  },
];

export function OnboardingFlow() {
  const { user, refreshUser } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [permissionState, setPermissionState] = useState<PermissionState>("idle");
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [preferences, setPreferences] = useState(
    defaultOnboardingNotificationPreferences,
  );

  const currentStep = steps[stepIndex];
  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / steps.length) * 100),
    [stepIndex],
  );

  const goNext = () => setStepIndex((current) => Math.min(current + 1, steps.length - 1));

  const requestNotifications = async () => {
    if (!("Notification" in globalThis.window)) {
      setPermissionState("unsupported");
      return;
    }

    setIsRequestingPermission(true);
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result === "granted" ? "granted" : "denied");

      if (result === "granted" && user) {
        const token = await getFirebaseMessagingToken();
        if (token) {
          await setDoc(
            doc(db, "users", user.uid),
            {
              fcmTokens: arrayUnion(token),
              notificationPermission: "granted",
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      }
    } catch (error) {
      console.error("Failed to request notification permission:", error);
      setPermissionState("denied");
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const finishOnboarding = async () => {
    if (!user) return;

    setIsFinishing(true);
    try {
      await setDoc(
        doc(db, "users", user.uid, "settings", "notifications"),
        {
          healthAlerts: preferences.ammoniaAlerts || preferences.h2sAlerts,
          litterLevelWarnings: true,
          dailySummary: false,
          alertSensitivity: "medium",
          quietHours: {
            enabled: false,
            from: "22:00",
            to: "07:00",
          },
          perCat: [],
          ...preferences,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await setDoc(
        doc(db, "users", user.uid),
        {
          onboardingComplete: true,
          onboardingCompletedAt: serverTimestamp(),
          notificationPermission:
            permissionState === "granted" ? "granted" : "not_granted",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await refreshUser();
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <main className="min-h-screen bg-litter-bg px-4 py-6 text-litter-text">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl flex-col">
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-litter-primary text-white shadow-sm">
                <PawPrint className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-litter-primary">
                  LitterSense
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-theme-muted">
                  First Launch
                </p>
              </div>
            </div>
            <span className="rounded-full bg-litter-primary-light px-3 py-1 text-xs font-semibold text-litter-primary">
              {stepIndex + 1}/{steps.length}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-theme-overlay">
            <div
              className="h-full rounded-full bg-litter-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <section className="flex flex-1 flex-col justify-center">
          {currentStep === "Welcome" && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-litter-primary-light">
                <Sparkles className="h-11 w-11 text-litter-primary" />
              </div>
              <div>
                <h1 className="font-display text-3xl font-bold">
                  Monitor your cat&apos;s health through their litter box
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-theme-muted">
                  LitterSense turns visit patterns, RFID activity, and air quality into simple health signals.
                </p>
              </div>
              <button
                type="button"
                onClick={goNext}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-litter-primary px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#165a4e]"
              >
                Get Started
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {currentStep === "How it works" && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl font-bold">How it works</h1>
                <p className="mt-2 text-sm text-theme-muted">
                  A quick look at what happens after your device is set up.
                </p>
              </div>
              <div className="space-y-3">
                {howItWorksItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="flex gap-3 rounded-2xl border border-litter-border bg-litter-card p-4 shadow-sm"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-litter-primary-light">
                        <Icon className="h-5 w-5 text-litter-primary" />
                      </div>
                      <div>
                        <h2 className="font-semibold">{item.title}</h2>
                        <p className="mt-1 text-sm text-theme-muted">{item.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={goNext}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-litter-primary px-4 py-3 font-semibold text-white"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {currentStep === "Notifications" && (
            <div className="space-y-6">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-litter-primary-light">
                <Bell className="h-10 w-10 text-litter-primary" />
              </div>
              <div className="text-center">
                <h1 className="font-display text-3xl font-bold">
                  Don&apos;t miss health changes
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-theme-muted">
                  LitterSense sends alerts when your cat&apos;s health patterns change. Allow notifications so you don&apos;t miss anything.
                </p>
              </div>
              {permissionState !== "idle" && (
                <div className="rounded-2xl border border-litter-border bg-litter-card p-4 text-sm text-theme-muted">
                  {permissionState === "granted"
                    ? "Notifications are enabled."
                    : "You can enable notifications later in Settings."}
                </div>
              )}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={requestNotifications}
                  disabled={isRequestingPermission || permissionState === "granted"}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-litter-primary px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isRequestingPermission ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                  {permissionState === "granted" ? "Allowed" : "Allow Notifications"}
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="w-full rounded-xl border border-litter-border bg-litter-card px-4 py-3 font-semibold text-litter-primary"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {currentStep === "Preferences" && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl font-bold">
                  Choose alerts
                </h1>
                <p className="mt-2 text-sm text-theme-muted">
                  These can be changed anytime in Settings.
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-litter-border bg-litter-card shadow-sm">
                <PreferenceToggle
                  icon={Wind}
                  label="Ammonia alerts"
                  description="Urine odor pattern changes"
                  checked={preferences.ammoniaAlerts}
                  onChange={(checked) =>
                    setPreferences((current) => ({ ...current, ammoniaAlerts: checked }))
                  }
                />
                <PreferenceToggle
                  icon={ShieldCheck}
                  label="H2S alerts"
                  description="Stool odor pattern changes"
                  checked={preferences.h2sAlerts}
                  onChange={(checked) =>
                    setPreferences((current) => ({ ...current, h2sAlerts: checked }))
                  }
                />
                <PreferenceToggle
                  icon={Radio}
                  label="RFID entry/exit"
                  description="Visit notifications for each RFID session"
                  checked={preferences.rfidVisitAlerts}
                  onChange={(checked) =>
                    setPreferences((current) => ({ ...current, rfidVisitAlerts: checked }))
                  }
                />
              </div>
              <button
                type="button"
                onClick={goNext}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-litter-primary px-4 py-3 font-semibold text-white"
              >
                Save Preferences
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {currentStep === "Done" && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-green-100">
                <CircleCheck className="h-12 w-12 text-green-600" />
              </div>
              <div>
                <h1 className="font-display text-3xl font-bold">
                  You&apos;re all set!
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-theme-muted">
                  Your dashboard is ready. Add your cats and connect your device when you&apos;re ready.
                </p>
              </div>
              <button
                type="button"
                onClick={finishOnboarding}
                disabled={isFinishing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-litter-primary px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isFinishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Go to Dashboard
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PreferenceToggle({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 border-b border-litter-border p-4 last:border-b-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-litter-primary-light">
        <Icon className="h-5 w-5 text-litter-primary" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-theme-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-litter-primary"
      />
    </label>
  );
}
