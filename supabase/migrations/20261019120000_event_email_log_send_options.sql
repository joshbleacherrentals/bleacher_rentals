-- What a quote email actually contained, beyond the To line.
--
-- The review dialog lets the sender add Cc and Bcc addresses, change the subject and remove or add
-- attachments for one send. The email log recorded only `to_email`, so the Log tab could not say
-- who else received it, what the subject was, or which files went with it.
--
--   cc_emails         the Cc line, in the same comma separated form as to_email
--   bcc_emails        the Bcc line
--   subject           the subject that was sent (after the empty-subject fallback)
--   attachment_names  the names of the attached files, as one comma separated text
--
-- All nullable: rows written before this have none of them, and a failed attempt may not have
-- reached the point where they are known. The body is deliberately not stored.
alter table public."EventEmailLog"
  add column cc_emails text,
  add column bcc_emails text,
  add column subject text,
  add column attachment_names text;
