CREATE TYPE question_type AS ENUM (
    'text',
    'checkbox',
    'photo'
);

CREATE TABLE "InspectionQuestions" (
  -- Primary key
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core fields
  question_text  TEXT        NOT NULL,  
  required       BOOLEAN     NOT NULL DEFAULT FALSE,
  question_type  question_type NOT NULL DEFAULT 'text',

  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,

  -- sorting fields
  sort_order     INTEGER     NOT NULL DEFAULT 0      -- controls display order in the app
);

-- Enable RLS
alter table public."InspectionQuestions" enable row level security;

create policy "Allow All for Auth"
  on public."InspectionQuestions"
  as permissive
  for all
  to authenticated
using (true);