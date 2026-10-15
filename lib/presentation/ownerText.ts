/** Present legacy alert wording without changing stored sensor or alert identifiers. */
export function ownerText(text: string) {
  return text
    .replace(/Saved gas detection at [^\n]*/gi, 'Odor detected near the litter box. Check the litter box and ventilation.')
    .replace(/Odor detected at [A-Za-z]{3} \d{1,2}, \d{4},? \d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)\. Check the litter box and ventilation\./gi,
      'Odor detected near the litter box. Check the litter box and ventilation.')
    .replace(/\s*\(saved detection\)/gi, '')
    .replace(/RFID sessions?/gi, (value) => /s$/i.test(value) ? 'Litter Box Sessions' : 'Litter Box Session')
    .replace(/ammonia(?:\s*\(NH3\))?|NH3/gi, 'Urine')
    .replace(/hydrogen sulfide(?:\s*\(H2S\))?|H2S/gi, 'Stool')
    .replace(/\s*ppm\b/gi, '');
}
