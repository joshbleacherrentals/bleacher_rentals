-- Whether a quote's tax amount was typed by hand.
--
-- Events.tax_amount_cents is written on every save, whether the user typed it or it was worked out
-- from the rate and the line items, so it cannot say which one it is. The edit page therefore
-- treated every saved quote as overridden and stopped re-calculating tax when a price changed.
--
--   true  -> keep tax_amount_cents exactly as typed.
--   false -> tax follows tax_percent and the subtotal, and re-calculates on every edit.
--
-- Every existing quote starts as false (automatic): the next edit of one re-calculates its tax.
-- Not part of the quote or contract hashes (tax_amount_cents already is), so flipping it alone
-- never invalidates a signature.
alter table public."Events"
  add column is_tax_overridden boolean not null default false;
