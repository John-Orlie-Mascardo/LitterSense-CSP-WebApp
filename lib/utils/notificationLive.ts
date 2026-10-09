export function subscribeNotificationLive(getToken: () => Promise<string>, changed: () => void) {
  const controller = new AbortController();
  let stopped = false, timer: ReturnType<typeof setTimeout>, failures = 0;
  async function connect() {
    try {
      const response = await fetch('/api/notifications/live', { headers: { Authorization: `Bearer ${await getToken()}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
      if (!response.ok || !response.body) throw new Error('Notification live connection unavailable');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let pending = '', received = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || stopped) break;
          pending += decoder.decode(value, { stream: true });
          let boundary;
          while ((boundary = pending.indexOf('\n\n')) >= 0) {
            const frame = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
            if (frame === 'data: changed' && !stopped) { received = true; failures = 0; changed(); }
            if (frame === 'data: visits' && !stopped) { received = true; failures = 0; visitListeners.forEach(listener => listener()); }
            if (frame === 'data: cats' && !stopped) { received = true; failures = 0; catalogListeners.forEach(listener => listener()); }
            if (frame === 'data: sensors' && !stopped) { received = true; failures = 0; sensorListeners.forEach(listener => listener()); }
          }
        }
      } finally { reader.releaseLock(); }
      if (!received && !stopped) throw new Error('Notification live stream unavailable');
    } catch { if (!stopped) ++failures; }
    if (!stopped) timer = setTimeout(connect, failures ? Math.min(30000, 1000 * 2 ** Math.min(failures, 5)) : 250);
  }
  void connect();
  return () => { stopped = true; clearTimeout(timer); controller.abort(); };
}
const catalogListeners = new Set<() => void>();
export function subscribeCatCatalogChanges(listener: () => void) {
  catalogListeners.add(listener);
  return () => { catalogListeners.delete(listener); };
}

const visitListeners = new Set<() => void>();
export function subscribeCatVisitChanges(listener: () => void) {
  visitListeners.add(listener);
  return () => { visitListeners.delete(listener); };
}

const sensorListeners = new Set<() => void>();
export function subscribeSensorChanges(listener: () => void) {
  sensorListeners.add(listener);
  return () => { sensorListeners.delete(listener); };
}
