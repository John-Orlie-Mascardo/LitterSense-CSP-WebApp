export const ALERT_REASONS = ["Ammonia detected", "Hydrogen sulfide detected", "Frequent visits", "Extended duration", "No exit timeout", "Abnormal activity", "Test SMS"] as const;

export type AlertContext = { catName?: string; occurredAt?: string; visitCount?: number; durationSecs?: number };

export function buildAlertMessage(reason: string, context: AlertContext = {}) {
  const name = (context.catName ?? "Your cat").normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[\[\]]/g, "").trim().slice(0, 24) || "Your cat";
  const date = new Date(context.occurredAt ?? Date.now());
  const time = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(date).replace(/[\u00a0\u202f]/g, " ") : "time unavailable";
  const count = Number.isFinite(context.visitCount) ? Math.max(0, Math.round(context.visitCount!)) : null;
  const duration = Number.isFinite(context.durationSecs) ? Math.round(context.durationSecs! / 60 * 10) / 10 : null;
  switch (reason) {
    case "Ammonia detected": return `LitterSense: Urine odor detected near the litter box (${time}). Scoop the box and air out the room.`;
    case "Hydrogen sulfide detected": return `LitterSense: Stool odor detected near the litter box (${time}). Clean the box and check ventilation.`;
    case "Frequent visits": return `LitterSense: ${name} ${count === null ? "made frequent visits" : `used the box ${count} times today`} (${time}). Watch for straining. Contact a vet if it continues.`;
    case "Extended duration": return `LitterSense: ${name} stayed in the box${duration === null ? " longer than the limit" : ` for ${duration} min`} (${time}). Check your cat. Contact a vet if straining.`;
    case "No exit timeout": return `LitterSense: No exit was confirmed for ${name} (${time}). Check your cat and the reader now.`;
    case "Test SMS": return "LitterSense: Test message. SMS alerts are working. Continue normal monitoring.";
    default: return `LitterSense: Unusual box activity recorded for ${name} (${time}). Check your cat. Contact a vet if discomfort continues.`;
  }
}
