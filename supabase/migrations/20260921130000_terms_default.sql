-- One contract template can be the default; a new quote starts with it selected.
-- See docs/specs/default-terms-template.md.
ALTER TABLE public."TermsAndConditions"
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- At most one default, enforced here rather than trusted to the code that sets it: a unique index
-- on the expression, restricted to the rows that claim it. Any number of false rows are fine.
-- Soft-deleted rows are excluded, so deleting the default frees the slot.
CREATE UNIQUE INDEX IF NOT EXISTS terms_and_conditions_single_default
  ON public."TermsAndConditions" ((is_default))
  WHERE is_default AND NOT deleted;
