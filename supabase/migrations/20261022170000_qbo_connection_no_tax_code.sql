-- =============================================================
-- QuickBooks invoice: the "no tax" code of a connection
-- (docs/specs/qbo-invoice-03c-no-tax-code.md)
--
-- A Canadian QuickBooks file does not accept TAX or NON on an invoice line: a line that carries no
-- tax still needs a real tax code of the file. An admin picks it per connection on /quickbooks; the
-- invoice route reads it with the service role. The column follows QboConnections' own rules (no
-- policy, trigger or index changes). Online-only: not in AppSchema.ts and not synced.
-- =============================================================

ALTER TABLE public."QboConnections"
  ADD COLUMN IF NOT EXISTS qbo_no_tax_code_id text;

COMMENT ON COLUMN public."QboConnections".qbo_no_tax_code_id IS
  'QuickBooks'' own id of the tax code a Canadian invoice line carries when it has no tax. Chosen by an admin on /quickbooks.';
