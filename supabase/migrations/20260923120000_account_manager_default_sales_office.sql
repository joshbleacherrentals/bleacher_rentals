-- An account manager's default sales office. Prefills the sales office dropdown on a fresh
-- quote (docs/specs), sparing the common case of picking the same office every time.
ALTER TABLE public."AccountManagers"
  ADD COLUMN IF NOT EXISTS default_sales_office_uuid uuid REFERENCES public."SalesOffices"(id);
