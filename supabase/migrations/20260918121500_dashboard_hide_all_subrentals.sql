-- Per-user dashboard option: hide every subrental ("ghost") row on the grid.
-- Off by default, so existing users keep seeing subrental rows until they opt out.
ALTER TABLE public."DashboardFilterSettings"
  ADD COLUMN IF NOT EXISTS hide_all_subrentals boolean NOT NULL DEFAULT false;
