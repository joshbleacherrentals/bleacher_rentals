export const DRIVER_SCORECARD_STAT_KEYS = {
  MAINTENANCE_COST_PER_YEAR: "maintenance_cost_per_year",
} as const;

export type DriverScorecardStatKey =
  (typeof DRIVER_SCORECARD_STAT_KEYS)[keyof typeof DRIVER_SCORECARD_STAT_KEYS];
