/** Present legacy alert wording without changing stored sensor or alert identifiers. */
export function ownerText(text: string) {
  return text
    .replace(/RFID sessions?/gi, (value) => /s$/i.test(value) ? 'Litter Box Sessions' : 'Litter Box Session')
    .replace(/ammonia(?:\s*\(NH3\))?|NH3/gi, 'Urine')
    .replace(/hydrogen sulfide(?:\s*\(H2S\))?|H2S/gi, 'Stool')
    .replace(/\s*ppm\b/gi, '');
}
