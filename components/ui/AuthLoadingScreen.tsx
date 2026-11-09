/**
 * AuthLoadingScreen.tsx
 *
 * Full-screen "Signing you in…" state shown while Firebase restores a saved session.
 * Also reused as a blocking overlay for other short waits (e.g. "Deleting your account…").
 *
 * DONE: accessible status message, theme-aware colors
 * PLACEHOLDER: none
 */

interface AuthLoadingScreenProps {
  /** Main line. Defaults to the sign-in wording. */
  readonly message?: string;
  /** Optional smaller second line. */
  readonly detail?: string;
  /** Cover the current page (fixed, above everything) instead of filling the layout. */
  readonly overlay?: boolean;
}

export function AuthLoadingScreen({ message = "Signing you in…", detail, overlay = false }: AuthLoadingScreenProps = {}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${overlay ? "fixed inset-0 z-[100]" : "min-h-screen"} flex flex-col items-center justify-center gap-4 bg-litter-bg px-6 text-center`}
    >
      <svg className="animate-spin h-8 w-8 text-litter-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <p className="text-sm font-medium text-litter-muted">{message}</p>
      {detail && <p className="max-w-xs text-xs text-litter-muted">{detail}</p>}
    </div>
  );
}
