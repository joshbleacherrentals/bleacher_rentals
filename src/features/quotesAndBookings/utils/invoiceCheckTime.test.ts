import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Settings } from "luxon";
import { describeInvoiceCheck } from "./invoiceCheckTime";

// Spec: docs/specs/qbo-invoice-08-view-and-check.md §4 (the check time). The times are shown in the
// viewer's local time; here the local zone is fixed to UTC so that the text does not depend on the
// machine running the tests.

describe("describeInvoiceCheck", () => {
  const previousZone = Settings.defaultZone;
  beforeAll(() => {
    Settings.defaultZone = "UTC";
  });
  afterAll(() => {
    Settings.defaultZone = previousZone;
  });

  const NOT_CHECKED = { failed: false, lines: ["Not checked yet"] };

  describe("neither time is set", () => {
    it("says 'Not checked yet'", () => {
      expect(describeInvoiceCheck(null, null)).toEqual(NOT_CHECKED);
    });

    it("treats undefined the same way", () => {
      expect(describeInvoiceCheck(undefined, undefined)).toEqual(NOT_CHECKED);
    });
  });

  describe("a check time and no later failure", () => {
    it("says when it was checked", () => {
      expect(describeInvoiceCheck("2026-10-23T14:05:00.000Z", null)).toEqual({
        failed: false,
        lines: ["Checked 23 Oct 2026, 14:05"],
      });
    });

    it("writes a single-digit day without a leading zero and the hour in 24-hour time", () => {
      expect(describeInvoiceCheck("2026-11-02T08:09:30.000Z", null).lines).toEqual([
        "Checked 2 Nov 2026, 08:09",
      ]);
      expect(describeInvoiceCheck("2026-11-02T20:09:30.000Z", null).lines).toEqual([
        "Checked 2 Nov 2026, 20:09",
      ]);
    });

    it("reads the Postgres spelling of a timestamp as well as the ISO one", () => {
      expect(describeInvoiceCheck("2026-10-23 14:05:00.123456+00", null).lines).toEqual([
        "Checked 23 Oct 2026, 14:05",
      ]);
    });

    it("shows the time in the viewer's local zone", () => {
      Settings.defaultZone = "America/Toronto";
      try {
        // 14:05 UTC is 10:05 in Toronto in October (daylight time, UTC-4).
        expect(describeInvoiceCheck("2026-10-23T14:05:00.000Z", null).lines).toEqual([
          "Checked 23 Oct 2026, 10:05",
        ]);
      } finally {
        Settings.defaultZone = "UTC";
      }
    });

    it("a failure that is earlier than the check time is not shown", () => {
      expect(describeInvoiceCheck("2026-10-23T14:05:00.000Z", "2026-10-23T09:00:00.000Z")).toEqual({
        failed: false,
        lines: ["Checked 23 Oct 2026, 14:05"],
      });
    });

    it("equal times count as checked", () => {
      expect(describeInvoiceCheck("2026-10-23T14:05:00.000Z", "2026-10-23T14:05:00.000Z")).toEqual({
        failed: false,
        lines: ["Checked 23 Oct 2026, 14:05"],
      });
    });

    it("equal instants written in different spellings count as checked", () => {
      expect(
        describeInvoiceCheck("2026-10-23T14:05:00.000Z", "2026-10-23 14:05:00+00").failed,
      ).toBe(false);
    });
  });

  describe("a failure later than the check time", () => {
    it("says the last check failed, and when the last successful one was", () => {
      expect(describeInvoiceCheck("2026-10-23T14:05:00.000Z", "2026-10-23T14:30:00.000Z")).toEqual({
        failed: true,
        lines: [
          "The last check failed (23 Oct 2026, 14:30). Press Check again.",
          "Last successful check 23 Oct 2026, 14:05",
        ],
      });
    });

    it("a failure one second later still counts as later", () => {
      expect(
        describeInvoiceCheck("2026-10-23T14:05:00.000Z", "2026-10-23T14:05:01.000Z").failed,
      ).toBe(true);
    });
  });

  describe("a failure with no check time", () => {
    it("says the last check failed and has no 'Last successful check' line", () => {
      expect(describeInvoiceCheck(null, "2026-10-23T14:30:00.000Z")).toEqual({
        failed: true,
        lines: ["The last check failed (23 Oct 2026, 14:30). Press Check again."],
      });
    });
  });

  describe("invalid or missing timestamps", () => {
    it.each([
      ["both invalid", "garbage", "also garbage"],
      ["both empty", "", ""],
      ["an invalid check time and no failure", "garbage", null],
      ["no check time and an invalid failure", null, "garbage"],
    ])("%s: 'Not checked yet'", (_name, checkedAt, failedAt) => {
      expect(describeInvoiceCheck(checkedAt, failedAt)).toEqual(NOT_CHECKED);
    });

    it("an invalid failure time is ignored: the check time is shown", () => {
      expect(describeInvoiceCheck("2026-10-23T14:05:00.000Z", "garbage")).toEqual({
        failed: false,
        lines: ["Checked 23 Oct 2026, 14:05"],
      });
    });

    it("an invalid check time with a valid failure: the failure alone, with no successful check", () => {
      expect(describeInvoiceCheck("garbage", "2026-10-23T14:30:00.000Z")).toEqual({
        failed: true,
        lines: ["The last check failed (23 Oct 2026, 14:30). Press Check again."],
      });
    });
  });
});
