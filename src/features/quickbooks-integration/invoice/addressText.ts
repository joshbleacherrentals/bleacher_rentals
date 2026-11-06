import { ABBREV_TO_NAME, NAME_TO_ABBREV } from "@/app/zones/_components/mapData";
import { normalizeCanadianProvince } from "@/features/quotesAndBookings/utils/canadianTaxRates";

/**
 * The ship-to address read as text. When someone presses Save in QuickBooks it keeps the street in
 * Line1 and moves the city, province and postal code into free-text lines, so the separate City /
 * CountrySubDivisionCode / PostalCode fields come back empty. The invoice check therefore looks for
 * each part of the quote's address in everything QuickBooks holds, not in one field.
 * Pure.
 */

/** Lower case, accents and punctuation removed, one space between words. */
export function normalizeAddressText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Whether `value` appears in the parts, read as one text in order. Whole words only ("1 Main St" is
 * not in "11 Main St"). `compact` also ignores spaces, for a postal code ("N0J 1P0" is "N0J1P0").
 * A blank value is nothing to look for, so it is found.
 */
export function appearsIn(
  value: string,
  parts: readonly string[],
  options: { compact?: boolean } = {},
): boolean {
  const needle = normalizeAddressText(value);
  if (needle === "") return true;

  const haystack = normalizeAddressText(parts.join(" "));
  if (options.compact) return haystack.replace(/ /g, "").includes(needle.replace(/ /g, ""));
  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * The ways a state or province is written: what was given, its code and its name. A value that is
 * not a known region is only itself; a blank one has no form.
 */
export function regionForms(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed === "") return [];

  const forms = new Set([trimmed]);
  const upper = trimmed.toUpperCase();
  const lower = normalizeAddressText(trimmed);

  if (upper in ABBREV_TO_NAME) {
    forms.add(ABBREV_TO_NAME[upper]);
  }
  const abbreviation = Object.entries(NAME_TO_ABBREV).find(
    ([name]) => normalizeAddressText(name) === lower,
  )?.[1];
  if (abbreviation) forms.add(abbreviation);

  // "Québec" and other spellings the province table knows.
  const province = normalizeCanadianProvince(trimmed);
  if (province) {
    forms.add(province);
    forms.add(ABBREV_TO_NAME[province] ?? province);
  }
  return [...forms];
}

/** The parts on one line, without the empty ones or repeats: what is shown for a difference. */
export function addressText(parts: readonly string[]): string {
  const seen = new Set<string>();
  const shown: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    shown.push(trimmed);
  }
  return shown.join(", ");
}
