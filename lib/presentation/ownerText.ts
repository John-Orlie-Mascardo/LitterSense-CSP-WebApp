/** Present legacy alert wording without changing stored sensor or alert identifiers. */
export function ownerText(text: string) {
  return text
    .replace(/(Saved gas detection at [A-Za-z]{3} \d{1,2}, \d{4}) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d) \(UTC\+08:00\)/g,
      (_, date: string, hour: string, minute: string, second: string) => `${date}, ${Number(hour) % 12 || 12}:${minute}:${second} ${Number(hour) < 12 ? 'AM' : 'PM'}`)
    .replace(/RFID sessions?/gi, (value) => /s$/i.test(value) ? 'Litter Box Sessions' : 'Litter Box Session')
    .replace(/ammonia(?:\s*\(NH3\))?|NH3/gi, 'Urine')
    .replace(/hydrogen sulfide(?:\s*\(H2S\))?|H2S/gi, 'Stool')
    .replace(/\s*ppm\b/gi, '');
}
