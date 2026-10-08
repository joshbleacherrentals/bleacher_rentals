/**
 * Whether a quote's tax was typed by hand, as the edit form and the Events table see it.
 *
 * In the form the override is `taxOverrideCents`: null means the tax is worked out from the rate and
 * the line items; a number means the user typed that amount. `Events.is_tax_overridden` is what
 * remembers which, because `tax_amount_cents` is saved either way.
 */

/** The form's override for a quote being opened: the saved amount only if it was typed by hand. */
export function taxOverrideFromSaved(
  isTaxOverridden: boolean,
  taxAmountCents: number | null,
): number | null {
  return isTaxOverridden ? taxAmountCents : null;
}

/** What to store in `Events.is_tax_overridden` (0/1, as PowerSync holds booleans) on save. */
export function taxOverrideFlag(taxOverrideCents: number | null): 0 | 1 {
  return taxOverrideCents !== null ? 1 : 0;
}
