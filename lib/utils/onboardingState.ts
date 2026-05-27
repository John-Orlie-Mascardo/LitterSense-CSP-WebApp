export const defaultOnboardingNotificationPreferences = {
  ammoniaAlerts: true,
  h2sAlerts: true,
  rfidVisitAlerts: false,
};

export function resolveOnboardingComplete(value: unknown) {
  return value === false ? false : true;
}

export function shouldShowDashboardOnboarding({
  onboardingComplete,
  isAdmin,
}: {
  onboardingComplete: boolean;
  isAdmin: boolean;
}) {
  if (isAdmin) return false;
  return onboardingComplete === false;
}
