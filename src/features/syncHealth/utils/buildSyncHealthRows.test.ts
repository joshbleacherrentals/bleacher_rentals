/**
 * Turning synced rows into the Sync Health table.
 *
 * What the table must get right:
 *  * the limit is the one in br_powersync/config/powersync.yaml
 *    (max_parameter_query_results: 2000), and percent is measured against it;
 *  * biggest first — the page exists to show who is closest to the limit;
 *  * a row is flagged from 70% of the limit, the point to act before a driver
 *    hits PSYNC_S2305;
 *  * "no report" (NULL — a build that predates reporting) is not zero: it gets
 *    no number, no percent, no flag, and sorts after every real report. A real
 *    zero is a report and is shown as 0.
 */

import { describe, it, expect } from "vitest";
import { NEAR_LIMIT_RATIO, SYNC_BUCKET_LIMIT } from "../constants";
import { buildSyncHealthRows, type SyncHealthSourceRow } from "./buildSyncHealthRows";

const source = (over: Partial<SyncHealthSourceRow> & { id: string }): SyncHealthSourceRow => ({
  first_name: "Pat",
  last_name: "Driver",
  app_version: "1.10.4",
  app_platform: "ios",
  bucket_count: null,
  sync_version: null,
  bucket_count_reported_at: null,
  ...over,
});

describe("buildSyncHealthRows", () => {
  it("uses the server limit of 2000 and flags from 70%", () => {
    expect(SYNC_BUCKET_LIMIT).toBe(2000);
    expect(NEAR_LIMIT_RATIO).toBe(0.7);
  });

  it("carries the count, the limit and the percent of the limit", () => {
    const [row] = buildSyncHealthRows([
      source({
        id: "d1",
        bucket_count: 500,
        sync_version: 2,
        bucket_count_reported_at: "2026-09-21T10:00:00Z",
      }),
    ]);
    expect(row).toMatchObject({
      driverId: "d1",
      name: "Pat Driver",
      bucketCount: 500,
      limit: 2000,
      percentOfLimit: 25,
      appVersion: "1.10.4",
      syncVersion: 2,
      reportedAt: "2026-09-21T10:00:00Z",
      hasReport: true,
    });
  });

  it("sorts by bucket count, biggest first", () => {
    const rows = buildSyncHealthRows([
      source({ id: "small", bucket_count: 10 }),
      source({ id: "big", bucket_count: 1500 }),
      source({ id: "mid", bucket_count: 300 }),
    ]);
    expect(rows.map((r) => r.driverId)).toEqual(["big", "mid", "small"]);
  });

  it("puts drivers with no report after every real report, even a zero", () => {
    const rows = buildSyncHealthRows([
      source({ id: "none", bucket_count: null }),
      source({ id: "zero", bucket_count: 0 }),
      source({ id: "some", bucket_count: 40 }),
    ]);
    expect(rows.map((r) => r.driverId)).toEqual(["some", "zero", "none"]);
  });

  it("orders drivers with no report by name", () => {
    const rows = buildSyncHealthRows([
      source({ id: "z", first_name: "Zoe", bucket_count: null }),
      source({ id: "a", first_name: "Amy", bucket_count: null }),
    ]);
    expect(rows.map((r) => r.driverId)).toEqual(["a", "z"]);
  });

  it("keeps a real zero as a report", () => {
    const [row] = buildSyncHealthRows([source({ id: "d1", bucket_count: 0 })]);
    expect(row.hasReport).toBe(true);
    expect(row.bucketCount).toBe(0);
    expect(row.percentOfLimit).toBe(0);
  });

  it("gives a driver with no report no number, no percent and no flag", () => {
    const [row] = buildSyncHealthRows([source({ id: "d1", bucket_count: null })]);
    expect(row.hasReport).toBe(false);
    expect(row.bucketCount).toBeNull();
    expect(row.percentOfLimit).toBeNull();
    expect(row.isNearLimit).toBe(false);
  });

  it("flags a driver at 70% of the limit", () => {
    const [row] = buildSyncHealthRows([source({ id: "d1", bucket_count: 1400 })]);
    expect(row.isNearLimit).toBe(true);
  });

  it("does not flag a driver just under 70%", () => {
    const [row] = buildSyncHealthRows([source({ id: "d1", bucket_count: 1399 })]);
    expect(row.isNearLimit).toBe(false);
  });

  it("flags and reports over 100% for a driver past the limit", () => {
    const [row] = buildSyncHealthRows([source({ id: "d1", bucket_count: 2200 })]);
    expect(row.isNearLimit).toBe(true);
    expect(row.percentOfLimit).toBe(110);
  });

  it("names a driver whose user row is missing", () => {
    const [row] = buildSyncHealthRows([source({ id: "d1", first_name: null, last_name: null })]);
    expect(row.name).toBe("Unknown driver");
  });

  it("names a driver with only one name part", () => {
    const [row] = buildSyncHealthRows([source({ id: "d1", first_name: "Cher", last_name: null })]);
    expect(row.name).toBe("Cher");
  });
});
