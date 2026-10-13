/** Present legacy alert wording without changing stored sensor or alert identifiers. */
export function ownerText(text: string) {
  return text
    .replace(/Saved gas detection at ([A-Za-z]{3} \d{1,2}, \d{4})[ ,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?(?:\s*\(UTC\+08:00\))?\.?[^\n]*/gi,
      (_, date: string, hour: string, minute: string, meridiem?: string) => {
        const hourNumber = Number(hour);
        const period = meridiem ?? (hourNumber >= 12 ? 'PM' : 'AM');
        return `Odor detected at ${date}, ${hourNumber % 12 || 12}:${minute} ${period}. Check the litter box and ventilation.`;
      })
    .replace(/\s*\(saved detection\)/gi, '')
    .replace(/RFID sessions?/gi, (value) => /s$/i.test(value) ? 'Litter Box Sessions' : 'Litter Box Session')
    .replace(/ammonia(?:\s*\(NH3\))?|NH3/gi, 'Urine')
    .replace(/hydrogen sulfide(?:\s*\(H2S\))?|H2S/gi, 'Stool')
    .replace(/\s*ppm\b/gi, '');
}
