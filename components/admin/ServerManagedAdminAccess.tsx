import { ShieldCheck } from "lucide-react";

export function ServerManagedAdminAccess() {
  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 overflow-auto">
      <div>
        <h1 className="font-display font-bold text-2xl text-litter-text">
          Administrator Access
        </h1>
        <p className="text-sm text-litter-muted mt-0.5">
          Admin access is managed on the server using Firebase custom claims.
        </p>
      </div>

      <section className="max-w-3xl bg-litter-card rounded-2xl border border-litter-border shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-litter-primary-light flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-litter-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-litter-text">
              Server-managed only
            </h2>
            <p className="text-sm text-litter-muted mt-1 leading-relaxed">
              Browser controls cannot grant or revoke administrator access. Run
              the audited commands below from a trusted local checkout with the
              server credential configured.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-litter-muted mb-1">
              Grant
            </p>
            <code className="block overflow-x-auto rounded-xl bg-litter-bg border border-litter-border px-4 py-3 text-sm text-litter-text">
              npm run admin:grant -- admin@example.com
            </code>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-litter-muted mb-1">
              Revoke
            </p>
            <code className="block overflow-x-auto rounded-xl bg-litter-bg border border-litter-border px-4 py-3 text-sm text-litter-text">
              npm run admin:revoke -- admin@example.com
            </code>
          </div>
        </div>
      </section>
    </main>
  );
}
