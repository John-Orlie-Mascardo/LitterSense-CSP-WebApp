# Sensor fallback release recovery

Production before this release:

- Deployment: `dpl_cnCzNzx33WwZ5T9PAvD9Xoei1bQw`
- URL: `https://litter-sense-csp-web-509uxayce-john-orlie-mascardos-projects.vercel.app`
- Git source: `26b77c335b84e5bf47ccf86ea7a0cb8027c14ce4` (its source tree matches local `bf95f87`).
- Existing Vercel project: `litter-sense-csp-web-app`.

For an app rollback, restore that previous Vercel deployment to production. This removes both mirror uploads and fallback reads without changing firmware or SMS data. Keep the sensor table during an app-only rollback so accepted mirror readings remain recoverable.

Only if database removal is also needed, restore the previous app first, then review and execute `docs/sensor-snapshot-rollback.sql`. That SQL drops mirror snapshots and functions and restores the previous mapping-sync function. It retains the existing SMS tables and recipient settings. Do not apply it while the new app is serving production.

Release checks include lint, app tests, camera relay regressions, production build, transactional database assertions, authenticated live readings, independent real source receipts, and quota/recovery simulation. Simulations do not consume the actual Firestore quota or send synthetic SMS.

This is a sensor-display release. It does not provide full database replication or protection for history, enrollment, profile loading, or Firebase Auth.
