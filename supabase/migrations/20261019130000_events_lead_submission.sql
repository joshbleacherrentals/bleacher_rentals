-- =============================================================
-- Events.lead_submission: the website form submission a quote was made from
--
-- POST /api/webhooks/wpforms-lead creates a quote from a WPForms submission, but most of the form's
-- fields are free text and cannot be relied on to fill the quote's own columns neatly (a seat
-- range, a postal code with odd spacing, a comment). The submission is kept exactly as received so
-- staff can read what the person actually wrote, on the quote's "Submission" tab.
--
-- jsonb, null for every quote that did not come from the website form. It is not part of any quote
-- hash: it is a record of the request, not of the contract.
-- =============================================================

alter table public."Events"
  add column if not exists lead_submission jsonb;

comment on column public."Events".lead_submission is
  'The raw website form submission this quote was created from (WPForms via Make.com). Null for quotes created in the app.';
