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

-- Remove the separate answers table (if you already ran that migration)
DROP TABLE IF EXISTS "InspectionAnswers";

-- Add a JSON column to the inspections table
ALTER TABLE "WorkTrackerInspections"
  ADD COLUMN IF NOT EXISTS answers_json TEXT; -- TEXT works for PowerSync/SQLite compat

-- Damage Reports
CREATE TABLE "DamageReports" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_uuid   UUID NOT NULL REFERENCES "WorkTrackerInspections"(id),
  is_safe_to_sit    BOOLEAN NOT NULL DEFAULT TRUE,
  is_safe_to_haul   BOOLEAN NOT NULL DEFAULT TRUE,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

alter table public."DamageReports" enable row level security;

create policy "Allow All for Auth"
  on public."DamageReports"
  as permissive
  for all
  to authenticated
using (true);

-- Damage Report Photos
CREATE TABLE "DamageReportPhotos" (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  damage_report_uuid   UUID NOT NULL REFERENCES "DamageReports"(id) ON DELETE CASCADE,
  photo_path           TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

alter table public."DamageReportPhotos" enable row level security;

create policy "Allow All for Auth"
  on public."DamageReportPhotos"
  as permissive
  for all
  to authenticated
using (true);