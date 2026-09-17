alter table public."BleacherTypes"
  add column if not exists description text;

comment on column public."BleacherTypes".description is
  'Free-text description of the bleacher type (1-2 paragraphs, may contain line breaks / bullet lines). Copied into EventLineItems.description when the type is added to a quote. NULL = none.';
