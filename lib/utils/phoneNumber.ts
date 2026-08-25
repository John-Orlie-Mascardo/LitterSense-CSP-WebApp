export function normalizePhoneNumber(countryCode: string, nationalNumber: string) {
  if (!nationalNumber.trim()) return "";

  const localDigits = nationalNumber.replace(/[\s()-]/g, "").replace(/^0/, "");
  const phoneNumber = `${countryCode}${localDigits}`;

  if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
    throw new Error("Enter a valid phone number");
  }

  return phoneNumber;
}

export function getNationalPhoneNumber(phoneNumber: string, countryCode: string) {
  return phoneNumber.startsWith(countryCode)
    ? phoneNumber.slice(countryCode.length)
    : phoneNumber;
}
