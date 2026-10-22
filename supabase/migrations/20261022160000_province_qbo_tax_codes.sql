-- =============================================================
-- QuickBooks invoice: the QuickBooks tax code of each Canadian province
-- (docs/specs/qbo-invoice-03a-province-tax-codes.md)
--
-- The Canadian QuickBooks file does not calculate tax: it applies whichever tax code the invoice
-- carries. One row per QuickBooks connection and province says which code that is. Maintained by an
-- admin on /quickbooks (signed-in, so the policies below decide); read by the invoice route with the
-- service role. Online-only: not in AppSchema.ts and not synced.
-- =============================================================

CREATE TABLE IF NOT EXISTS public."ProvinceQboTaxCodes" (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  qbo_connection_uuid uuid        NOT NULL REFERENCES public."QboConnections"(id) ON DELETE CASCADE,
  province            text        NOT NULL,
  qbo_tax_code_id     text        NOT NULL,
  CONSTRAINT ProvinceQboTaxCodes_province_check
    CHECK (province IN ('AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT')),
  CONSTRAINT ProvinceQboTaxCodes_connection_province_unique UNIQUE (qbo_connection_uuid, province)
);

ALTER TABLE public."ProvinceQboTaxCodes" ENABLE ROW LEVEL SECURITY;

-- Admin only, the same rule as QboConnections' own writes. No other role has a policy.
CREATE POLICY rbac_select ON public."ProvinceQboTaxCodes"
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ('admin' = any(public.get_user_roles()));

CREATE POLICY rbac_insert ON public."ProvinceQboTaxCodes"
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ('admin' = any(public.get_user_roles()));

CREATE POLICY rbac_update ON public."ProvinceQboTaxCodes"
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ('admin' = any(public.get_user_roles()))
  WITH CHECK ('admin' = any(public.get_user_roles()));

CREATE POLICY rbac_delete ON public."ProvinceQboTaxCodes"
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ('admin' = any(public.get_user_roles()));
