-- Free-text payment instructions shown under "Make checks payable to" on the customer's quote,
-- e.g. "e-transfers to payments@bleacherrentals.com". Blank means nothing extra is shown.
ALTER TABLE public."SalesOffices" ADD COLUMN IF NOT EXISTS payment_info text;
