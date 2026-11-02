export type DashboardTourState = "with-cats" | "zero-cats";

export type TourTarget =
  | "add-first-cat"
  | "cat-chips"
  | "cat-stats"
  | "environment"
  | "recent-activity"
  | "nav-cats"
  | "bell"
  | "predictive-health"
  | "nav-settings";

export interface TourStep {
  id: string;
  target: TourTarget | null;
  title: string;
  description: string;
}

const welcomeStep: TourStep = {
  id: "welcome",
  target: null,
  title: "Welcome to LitterSense",
  description:
    "Here's a quick tour of the main parts of the app. It takes under a minute.",
};

const navigationSteps: TourStep[] = [
  {
    id: "my-cats",
    target: "nav-cats",
    title: "My Cats",
    description:
      "Add cats, register their collar tags, and see each cat's history.",
  },
  {
    id: "notifications",
    target: "bell",
    title: "Notifications",
    description: "Alerts about your cats and the litter box show up here.",
  },
];

const settingsStep: TourStep = {
  id: "settings",
  target: "nav-settings",
  title: "Settings",
  description:
    "Turn on alerts for this device and choose which ones you get. You can replay this tour here anytime.",
};

export const TOUR_STEPS_WITH_CATS: TourStep[] = [
  welcomeStep,
  {
    id: "your-cats",
    target: "cat-chips",
    title: "Your cats",
    description: "Pick a cat here to see their day.",
  },
  {
    id: "today-at-a-glance",
    target: "cat-stats",
    title: "Today at a glance",
    description:
      "Today's visits and average visit length for the selected cat.",
  },
  {
    id: "litter-box-environment",
    target: "environment",
    title: "Litter box environment",
    description: "Shows if urine or stool odor is detected in the box.",
  },
  {
    id: "recent-visits",
    target: "recent-activity",
    title: "Recent visits",
    description:
      "Each visit appears here. Tap VIEW ALL for the full history.",
  },
  ...navigationSteps,
  {
    id: "predictive-health",
    target: "predictive-health",
    title: "Predictive Health",
    description:
      "See your cat's usual pattern and ask for an AI summary. It needs about 7 days of visits first.",
  },
  settingsStep,
];

export const TOUR_STEPS_ZERO_CATS: TourStep[] = [
  welcomeStep,
  {
    id: "your-cats",
    target: "add-first-cat",
    title: "Your cats",
    description: "Start by adding your cat and scanning their collar tag.",
  },
  ...navigationSteps,
  settingsStep,
];

export function getTourSteps(state: DashboardTourState): TourStep[] {
  return state === "with-cats" ? TOUR_STEPS_WITH_CATS : TOUR_STEPS_ZERO_CATS;
}

export function getDashboardTourState(
  catalogReady: boolean,
  catCount: number,
): DashboardTourState | null {
  if (!catalogReady) return null;
  return catCount === 0 ? "zero-cats" : "with-cats";
}
