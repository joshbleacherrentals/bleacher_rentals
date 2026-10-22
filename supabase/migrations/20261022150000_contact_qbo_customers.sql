-- =============================================================
-- QuickBooks invoice: which QuickBooks customer a contact is
-- (docs/specs/qbo-invoice-02-customer.md)
--
-- One row per contact and QuickBooks connection, so the accountant is not asked again which
-- customer a contact is. Written and read only by the server with the service role.
--
-- Row level security is enabled with NO policy: no signed-in user can read or write it, and it is
-- not synced (same precedent as QboConnections' tokens).
-- =============================================================

CREATE TABLE IF NOT EXISTS public."ContactQboCustomers" (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_uuid        uuid        NOT NULL REFERENCES public."Contacts"(id) ON DELETE CASCADE,
  qbo_connection_uuid uuid        NOT NULL REFERENCES public."QboConnections"(id) ON DELETE CASCADE,
  qbo_customer_id     text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ContactQboCustomers_contact_connection_unique UNIQUE (contact_uuid, qbo_connection_uuid)
);

ALTER TABLE public."ContactQboCustomers" ENABLE ROW LEVEL SECURITY;
