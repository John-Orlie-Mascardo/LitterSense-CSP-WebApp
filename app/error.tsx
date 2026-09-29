"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">This page could not load</h1>
      <p>Please try again. If the problem continues, return to the dashboard.</p>
      <button type="button" onClick={reset} className="rounded-lg bg-litter-primary px-5 py-3 text-white">
        Try again
      </button>
      <a href="/dashboard" className="underline">Return to dashboard</a>
    </main>
  );
}
