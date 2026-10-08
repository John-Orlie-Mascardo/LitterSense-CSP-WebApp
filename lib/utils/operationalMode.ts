let mode: Promise<boolean> | undefined;
// One mode per page lifetime. A cutover requires reload; an unavailable mode never falls back to Firestore.
export function operationalPrimary() {
  return mode ??= fetch('/api/operational/mode', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    .then(async response => {
      if (!response.ok) throw new Error('Database mode unavailable');
      const data = await response.json();
      if (typeof data.primary !== 'boolean') throw new Error('Invalid database mode');
      console.info(`[LitterSense] App records use ${data.primary ? 'Supabase primary' : 'the existing database mode'}.`);
      return data.primary;
    })
    .catch(error => { mode = undefined; throw error; });
}
