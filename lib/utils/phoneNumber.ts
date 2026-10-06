export function normalizePhoneNumber(countryCode: string, nationalNumber: string) {
  if (!nationalNumber.trim()) return "";

  const digits = nationalNumber.replace(/[\s()-]/g, "");
  const phoneNumber = digits.startsWith("+") ? digits : `${countryCode}${digits.replace(/^0/, "")}`;

  if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
    throw new Error("Enter a valid phone number");
  }

  if (countryCode === "+63" && !/^\+639\d{9}$/.test(phoneNumber)) {
    throw new Error("Enter a valid Philippine mobile number (+639 followed by 9 digits)");
  }

  return phoneNumber;
}

export function getNationalPhoneNumber(phoneNumber: string, countryCode: string) {
  return phoneNumber.startsWith(countryCode)
    ? phoneNumber.slice(countryCode.length)
    : phoneNumber;
}
