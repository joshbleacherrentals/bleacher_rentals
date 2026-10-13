import { describe, expect, it } from "vitest";
import { METRIC_NAMES } from "@/lib/perf/telemetryEvent";
import { UNKNOWN_METRIC_INFO, metricInfo } from "./metricInfo";

describe("metricInfo", () => {
  it.each([...METRIC_NAMES])("%s is explained", (name) => {
    const text = metricInfo(name);
    expect(text).not.toBe(UNKNOWN_METRIC_INFO);
    expect(text.length).toBeGreaterThan(30);
    expect(text.length).toBeLessThanOrEqual(420);
  });

  it("explains what each metric starts and stops at, in words a developer can act on", () => {
    expect(metricInfo("sqlite.open")).toMatch(/database/i);
    expect(metricInfo("powersync.credentials")).toMatch(/token/i);
    expect(metricInfo("powersync.connect")).toMatch(/connection/i);
    expect(metricInfo("sync.initial")).toMatch(/first/i);
    expect(metricInfo("sync.upload")).toMatch(/send|upload/i);
    expect(metricInfo("ui.first_data")).toMatch(/wait/i);
  });

  it("says plainly what a count-only metric is", () => {
    expect(metricInfo("app.start")).toMatch(/count|page load/i);
    expect(metricInfo("powersync.disconnect")).toMatch(/count/i);
  });

  it("says that a sqlite figure is what the caller waited, not the engine's time", () => {
    expect(metricInfo("sqlite.query")).toMatch(/waited/i);
  });

  it("is safe to put in an attribute: no apostrophe, quote, ampersand or angle bracket", () => {
    for (const name of METRIC_NAMES) expect(metricInfo(name)).not.toMatch(/['"&<>]/);
    expect(UNKNOWN_METRIC_INFO).not.toMatch(/['"&<>]/);
  });

  it("does not fail for a metric it does not know yet", () => {
    expect(metricInfo("something.new")).toBe(UNKNOWN_METRIC_INFO);
    expect(UNKNOWN_METRIC_INFO).toMatch(/no description/i);
  });
});
