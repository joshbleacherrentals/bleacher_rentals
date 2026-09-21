/**
 * What a developer sees in the Sync Health table.
 *
 * The rows arrive already sorted and flagged (buildSyncHealthRows); the table's
 * job is to show them without blurring the one distinction that matters most:
 * a driver whose build never reported shows "—" with "no report yet", never a
 * 0. A real zero shows as 0.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SyncHealthTable } from "./SyncHealthTable";
import type { SyncHealthRow } from "../utils/buildSyncHealthRows";

const NOW = new Date("2026-09-21T12:00:00Z");

const row = (over: Partial<SyncHealthRow> & { driverId: string }): SyncHealthRow => ({
  name: "Pat Driver",
  bucketCount: 500,
  limit: 2000,
  percentOfLimit: 25,
  isNearLimit: false,
  hasReport: true,
  appVersion: "1.10.4",
  appPlatform: "ios",
  syncVersion: 2,
  reportedAt: "2026-09-21T10:00:00Z",
  ...over,
});

const render = (rows: SyncHealthRow[]) =>
  renderToStaticMarkup(<SyncHealthTable rows={rows} now={NOW} />);

// The <tr> for one driver, so assertions about one row cannot pass on another.
const rowHtml = (html: string, driverId: string) => {
  const match = html.match(new RegExp(`<tr[^>]*data-driver-id="${driverId}"[^>]*>.*?</tr>`));
  if (!match) throw new Error(`no row for ${driverId}`);
  return match[0];
};

describe("SyncHealthTable", () => {
  it("has the six columns", () => {
    const html = render([row({ driverId: "d1" })]);
    for (const header of [
      "Driver",
      "Buckets",
      "Limit",
      "% of limit",
      "App version",
      "Last report",
    ]) {
      expect(html).toContain(`>${header}<`);
    }
  });

  it("shows a reporting driver's count, limit, percent, version and report age", () => {
    const html = rowHtml(render([row({ driverId: "d1" })]), "d1");
    expect(html).toContain("Pat Driver");
    expect(html).toContain(">500<");
    expect(html).toContain(">2000<");
    expect(html).toContain(">25%<");
    expect(html).toContain("1.10.4");
    expect(html).toContain("2h ago");
  });

  it("shows — and 'no report yet' for a driver who never reported, not 0", () => {
    const html = rowHtml(
      render([
        row({
          driverId: "d1",
          hasReport: false,
          bucketCount: null,
          percentOfLimit: null,
          syncVersion: null,
          reportedAt: null,
          appVersion: "1.10.2",
        }),
      ]),
      "d1",
    );
    expect(html).toContain("—");
    expect(html).toContain("no report yet");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("0%");
  });

  it("shows a real zero as 0", () => {
    const html = rowHtml(
      render([row({ driverId: "d1", bucketCount: 0, percentOfLimit: 0 })]),
      "d1",
    );
    expect(html).toContain(">0<");
    expect(html).toContain(">0%<");
    expect(html).not.toContain("no report yet");
  });

  it("highlights a driver near the limit, and only that driver", () => {
    const html = render([
      row({ driverId: "hot", bucketCount: 1500, percentOfLimit: 75, isNearLimit: true }),
      row({ driverId: "calm", bucketCount: 100, percentOfLimit: 5 }),
    ]);
    expect(rowHtml(html, "hot")).toContain('data-near-limit="true"');
    expect(rowHtml(html, "calm")).toContain('data-near-limit="false"');
  });

  it("keeps the order it is given", () => {
    const html = render([row({ driverId: "first" }), row({ driverId: "second" })]);
    expect(html.indexOf('data-driver-id="first"')).toBeLessThan(
      html.indexOf('data-driver-id="second"'),
    );
  });

  it("shows — for a driver with no known app version", () => {
    const html = rowHtml(
      render([row({ driverId: "d1", appVersion: null, appPlatform: null })]),
      "d1",
    );
    expect(html).toContain("—");
  });

  it("says so when there are no drivers at all", () => {
    expect(render([])).toContain("No drivers to show");
  });
});
