-- Maintainer: read, submit and edit roadmap backlog tickets (/roadmap/backlog).
--
-- Same rights as an account manager has on the tickets: select + insert + update, NOT delete.
-- rbac_delete is left exactly as it is on every table below (admin on RoadmapTasks, admin and
-- developer on the task-scope tables). Sprints, quarters and features are not opened: the
-- maintainer gets the backlog only.
--
-- Deploy before the app change and the sync rules: a write the database refuses is dropped by the
-- PowerSync upload queue and only shows up as an error toast. Every PowerSync PUT is uploaded as
-- INSERT ... ON CONFLICT DO UPDATE, which needs the SELECT policy as well as INSERT and UPDATE.

ALTER POLICY rbac_select ON public."RoadmapTasks"
  USING (public.get_user_roles() && '{admin,developer,account_manager,viewer,maintainer}'::text[]);
ALTER POLICY rbac_insert ON public."RoadmapTasks"
  WITH CHECK (public.get_user_roles() && '{admin,developer,account_manager,maintainer}'::text[]);
ALTER POLICY rbac_update ON public."RoadmapTasks"
  USING (public.get_user_roles() && '{admin,developer,account_manager,maintainer}'::text[]);

-- The ticket's subscribers, chat (with its read receipts and typing indicators) and attachments.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'RoadmapTaskSubscriptions',
    'RoadmapTaskMessages',
    'RoadmapTaskMessageReadReceipts',
    'RoadmapTaskTypingIndicators',
    'RoadmapAttachments'
  ] LOOP
    EXECUTE format(
      'ALTER POLICY rbac_select ON public.%I USING (public.get_user_roles() && %L::text[])',
      tbl, '{admin,developer,account_manager,viewer,maintainer}'
    );
    EXECUTE format(
      'ALTER POLICY rbac_insert ON public.%I WITH CHECK (public.get_user_roles() && %L::text[])',
      tbl, '{admin,developer,account_manager,maintainer}'
    );
    EXECUTE format(
      'ALTER POLICY rbac_update ON public.%I USING (public.get_user_roles() && %L::text[])',
      tbl, '{admin,developer,account_manager,maintainer}'
    );
  END LOOP;
END;
$$;
