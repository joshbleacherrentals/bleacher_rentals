/**
 * A 10-digit North American number as 555-555-5555, however it was typed ("5555555555",
 * "(555) 555-5555", "555.555.5555"). Anything else — an extension, a country code, a short
 * number — comes back untouched, so nothing a person entered is ever hidden or mangled.
 * Display only: the stored value is not changed.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
