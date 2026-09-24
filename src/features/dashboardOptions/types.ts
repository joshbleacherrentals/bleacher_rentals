export type YAxis = "Bleachers" | "Events";

// quick-toggle: 10 rows, 15 rows, or all
export type RowsQuickFilter = 10 | 15 | null;

export type DashboardFilterState = {
  yAxis: YAxis;

  // row counts to include (e.g. [7, 10, 15])
  rows: number[];

  // indices into STATES+PROVINCES
  stateProvinces: number[];

  onlyShowMyEvents: boolean;
  optimizationMode: boolean;
  showAddressTooltip: boolean;
  showDistanceTooltip: boolean;

  // convenience UI toggle (also persisted)
  rowsQuickFilter: RowsQuickFilter;

  // selected Zone ids for the dashboard zone filter
  zoneUuids: string[];
  // whether the "Unassigned" pseudo-zone is selected
  showUnassignedZone: boolean;

  // hide every subrental ("ghost") row on the grid, whatever the dates
  hideAllSubrentals: boolean;
};
