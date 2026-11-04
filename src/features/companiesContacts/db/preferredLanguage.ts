/**
 * The `preferred_language` enum on Contacts, as stored in Postgres.
 *
 * PowerSync mirrors enums as plain text locally, so reads go through
 * toPreferredLanguage() rather than being cast. The quote renderers map this
 * onto a QuoteLanguage ("en" | "fr") — see
 * src/features/quotesAndBookings/pdf/quoteLanguage.ts and
 * docs/specs/quote-preferred-language.md.
 *
 * Adding a language: ALTER TYPE ... ADD VALUE, extend this union and
 * PREFERRED_LANGUAGE_OPTIONS, then add the `fr`-style entries in
 * pdf/quoteStrings.ts (TypeScript will point at every one that's missing).
 */
export type PreferredLanguage = "english" | "french";

/** Options for the language picker on the contact forms. */
export const PREFERRED_LANGUAGE_OPTIONS: { label: string; value: PreferredLanguage }[] = [
  { label: "English", value: "english" },
  { label: "French", value: "french" },
];

/** The two-letter code shown on a contact's overview. */
export function preferredLanguageBadge(value: PreferredLanguage): "EN" | "FR" {
  return value === "french" ? "FR" : "EN";
}

/** Narrow a local text value to the enum, defaulting to English. */
export function toPreferredLanguage(value: string | null | undefined): PreferredLanguage {
  return value === "french" ? "french" : "english";
}
