/** Present legacy alert wording without changing stored sensor or alert identifiers. */
export function ownerText(text: string) {
  return text
    .replace(/Saved gas detection at /gi, 'Odor detected at ')
    .replace(/\. Uploaded after the event(?:; check gas history for the recorded readings)?\./gi, '. Check the litter box and ventilation.')
    .replace(/\s*\(saved detection\)/gi, '')
    .replace(/RFID sessions?/gi, (value) => /s$/i.test(value) ? 'Litter Box Sessions' : 'Litter Box Session')
    .replace(/ammonia(?:\s*\(NH3\))?|NH3/gi, 'Urine')
    .replace(/hydrogen sulfide(?:\s*\(H2S\))?|H2S/gi, 'Stool')
    .replace(/\s*ppm\b/gi, '');
}

/** One display format for gas history, live alerts and push; never use replay receipt time. */
export function gasNotificationText(source: unknown, occurredAt: string | number | null | undefined) {
  const title = source === 'ammonia_alert' || source === 'Ammonia detected' ? 'Urine detected'
    : source === 'h2s_alert' || source === 'Hydrogen sulfide detected' ? 'Stool detected' : null;
  if (!title) return null;
  const milliseconds = typeof occurredAt === 'number' ? occurredAt : typeof occurredAt === 'string' ? Date.parse(occurredAt) : NaN;
  const date = new Date(milliseconds);
  const time = milliseconds > 0 && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date).replace(/[\u00a0\u202f]/g, ' ')
    : null;
  return { title, message: `${time ? `Odor detected at ${time}.` : 'Odor detected. Detection time unavailable.'} Check the litter box and ventilation.` };
}
