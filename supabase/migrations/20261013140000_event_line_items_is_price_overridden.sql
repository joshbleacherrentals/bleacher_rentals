-- Whether a quote line's price was typed by hand.
--
-- A bleacher line starts at the pricing-matrix price. When the account manager changes it, that
-- price is theirs and must survive every later edit of the quote. Nothing used to remember the
-- difference, so every saved line came back from the database as "follow the matrix" and the edit
-- form re-priced it: on 2026-10-11 two bleachers at $5,400 became $1,800 each, and the client
-- signed the lower contract.
--
--   true  -> the price is exactly what was typed; only an explicit "reset to matrix price" changes it.
--   false -> the price was taken from the matrix when the line was added and has not been edited.
--
-- Every existing line starts as true (hand-priced): there is no way to tell, after the fact, which
-- saved prices were typed and which were looked up, and keeping a price is the safe mistake — a
-- line that should have followed the matrix just needs one click to reset. New lines that do not
-- say otherwise are also true, for the same reason.
--
-- Not part of the quote or contract hashes (value_cents already is), so flipping it alone never
-- invalidates a signature. Adding the column fires no row trigger, so nothing is recomputed.
alter table public."EventLineItems"
  add column is_price_overridden boolean not null default true;
