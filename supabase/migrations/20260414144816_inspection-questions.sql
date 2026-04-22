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
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_uuid            UUID NOT NULL REFERENCES "WorkTrackerInspections"(id),
  bleacher_uuid              UUID NOT NULL REFERENCES "Bleachers"(id),
  is_safe_to_sit             BOOLEAN NOT NULL DEFAULT TRUE,
  is_safe_to_haul            BOOLEAN NOT NULL DEFAULT TRUE,
  note                       TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at                TIMESTAMPTZ,
  maintenance_event_uuid     UUID  -- FK added after MaintenanceEvents table is created
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

-- Maintenance Events
CREATE TABLE "MaintenanceEvents" (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name             TEXT NOT NULL DEFAULT 'Maintenance / Repair',
  event_start            DATE NOT NULL,
  event_end              DATE NOT NULL,
  cost_cents             INTEGER,
  address_uuid           UUID REFERENCES "Addresses"(id),
  notes                  TEXT,
  created_by_user_uuid   UUID REFERENCES "Users"(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

alter table public."MaintenanceEvents" enable row level security;

create policy "Allow All for Auth"
  on public."MaintenanceEvents"
  as permissive
  for all
  to authenticated
using (true);

-- Junction: Bleacher <-> MaintenanceEvent
CREATE TABLE "BleacherMaintEvents" (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bleacher_uuid           UUID NOT NULL REFERENCES "Bleachers"(id),
  maintenance_event_uuid  UUID NOT NULL REFERENCES "MaintenanceEvents"(id) ON DELETE CASCADE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

alter table public."BleacherMaintEvents" enable row level security;

create policy "Allow All for Auth"
  on public."BleacherMaintEvents"
  as permissive
  for all
  to authenticated
using (true);

-- Add FK from DamageReports to MaintenanceEvents now that the table exists
ALTER TABLE "DamageReports"
  ADD CONSTRAINT "DamageReports_maintenance_event_uuid_fkey"
  FOREIGN KEY (maintenance_event_uuid) REFERENCES "MaintenanceEvents"(id);

-- Maintenance Event Photos
CREATE TABLE "MaintenancePhotos" (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_event_uuid   UUID NOT NULL REFERENCES "MaintenanceEvents"(id) ON DELETE CASCADE,
  photo_path               TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

alter table public."MaintenancePhotos" enable row level security;

create policy "Allow All for Auth"
  on public."MaintenancePhotos"
  as permissive
  for all
  to authenticated
using (true);

-- Create storage bucket for damage report photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'damage-report-photos',
  'damage-report-photos',
  true,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for damage-report-photos bucket
CREATE POLICY "damage-report-photos: select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'damage-report-photos');

CREATE POLICY "damage-report-photos: insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'damage-report-photos');

CREATE POLICY "damage-report-photos: update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'damage-report-photos');

CREATE POLICY "damage-report-photos: delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'damage-report-photos');

-- Create storage bucket for maintenance photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'maintenance-photos',
  'maintenance-photos',
  true,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "maintenance-photos: select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'maintenance-photos');

CREATE POLICY "maintenance-photos: insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'maintenance-photos');

CREATE POLICY "maintenance-photos: update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'maintenance-photos');

CREATE POLICY "maintenance-photos: delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'maintenance-photos');