-- =============================================================
-- QuickBooks invoice: the Product/Service of each event type, per QuickBooks connection
-- (docs/specs/qbo-invoice-12-event-type-services.md)
--
-- The invoice line used to be sold as the Item named "Bleacher Rental - {event type}". It is now the
-- Product/Service assigned here: one row per event type and QuickBooks connection, holding
-- QuickBooks' own id of the Item. Maintained by an admin or an accountant on the Quote Types page
-- (signed-in, so the policies below decide); read by the invoice routes with the service role.
-- Online-only: not in AppSchema.ts and not synced.
-- =============================================================

CREATE TABLE IF NOT EXISTS public."EventTypeQboServices" (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  event_type_uuid     uuid        NOT NULL REFERENCES public."EventTypes"(id) ON DELETE CASCADE,
  qbo_connection_uuid uuid        NOT NULL REFERENCES public."QboConnections"(id) ON DELETE CASCADE,
  qbo_service_id      text        NOT NULL,
  CONSTRAINT EventTypeQboServices_type_connection_unique UNIQUE (event_type_uuid, qbo_connection_uuid)
);

COMMENT ON COLUMN public."EventTypeQboServices".qbo_service_id IS
  'QuickBooks'' own id of the Product/Service (Item) an invoice line of this event type is sold as, in this connection''s company.';

ALTER TABLE public."EventTypeQboServices" ENABLE ROW LEVEL SECURITY;

-- Admin and accountant. No other role has a policy.
CREATE POLICY rbac_select ON public."EventTypeQboServices"
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.get_user_roles() && '{admin,accountant}'::text[]);

CREATE POLICY rbac_insert ON public."EventTypeQboServices"
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (public.get_user_roles() && '{admin,accountant}'::text[]);

CREATE POLICY rbac_update ON public."EventTypeQboServices"
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.get_user_roles() && '{admin,accountant}'::text[])
  WITH CHECK (public.get_user_roles() && '{admin,accountant}'::text[]);

CREATE POLICY rbac_delete ON public."EventTypeQboServices"
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (public.get_user_roles() && '{admin,accountant}'::text[]);
