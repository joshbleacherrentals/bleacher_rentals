-- =============================================================
-- QuickBooks invoice: the link columns and the mismatch flag on Events
-- (docs/specs/qbo-invoice-01-link-and-hash.md)
--
-- The app keeps, on each quote, which QuickBooks invoice it made and whether that invoice still
-- matches the quote. This migration adds six columns on Events:
--   * qbo_invoice_id, qbo_invoice_connection_uuid — the link;
--   * qbo_invoice_mismatch, qbo_invoice_mismatch_reasons — the result of the last comparison of the
--     invoice with the quote (a flag, and a JSON array of reason codes behind it);
--   * qbo_invoice_checked_at, qbo_invoice_check_failed_at — when the last comparison finished, and
--     when the last one that could not finish was tried.
--
-- All six are written by the server with the service role. The accountant guard skips every caller
-- that is not `authenticated`, so it needs no change; a browser may write these columns like any
-- other Events column (only the accountant is fenced).
--
-- There is no invoice hash: the app asks QuickBooks instead (spec 06). recompute_quote_hashes() and
-- the Contacts trigger are not touched, and content_hash and contract_hash are computed exactly as
-- before.
--
-- No RLS policy, no guard, no sync rule changes: Events already syncs whole-row.
-- =============================================================

ALTER TABLE public."Events"
  ADD COLUMN IF NOT EXISTS qbo_invoice_id text NULL,
  ADD COLUMN IF NOT EXISTS qbo_invoice_connection_uuid uuid NULL
    REFERENCES public."QboConnections"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS qbo_invoice_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qbo_invoice_mismatch_reasons text NULL,
  ADD COLUMN IF NOT EXISTS qbo_invoice_checked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS qbo_invoice_check_failed_at timestamptz NULL;

COMMENT ON COLUMN public."Events".qbo_invoice_id IS
  'QuickBooks'' own id of the invoice made from this quote. Null until an invoice is created. Written by the server.';
COMMENT ON COLUMN public."Events".qbo_invoice_connection_uuid IS
  'The QuickBooks file (QboConnections) the invoice lives in. Written by the server.';
COMMENT ON COLUMN public."Events".qbo_invoice_mismatch IS
  'True while the last comparison found a difference between the quote and its QuickBooks invoice. Written by the server.';
COMMENT ON COLUMN public."Events".qbo_invoice_mismatch_reasons IS
  'JSON array of the reason codes behind qbo_invoice_mismatch, for example ["dates","totals"]. Null whenever the flag is false. Written by the server in the same statement as the flag.';
COMMENT ON COLUMN public."Events".qbo_invoice_checked_at IS
  'When the last comparison of the invoice with the quote finished. Null until the first one. Written by the server.';
COMMENT ON COLUMN public."Events".qbo_invoice_check_failed_at IS
  'When the last comparison that could not finish was tried (QuickBooks unreachable, the invoice missing, the quote not comparable). Cleared by the next successful one. Written by the server.';
