import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCadUsdRates } from "./useCadUsdRates";

// docs/specs/dashboard-analytics-03-converter.md §2.6. The hook is a thin wrapper around
// startCadUsdRatesSession (tested in cadUsdRatesSession.test.ts). This project has no DOM test
// environment, so what is checked here is the first frame: it is the same on the server and in the
// browser, so it must not read the storage nor ask the API.

function Probe(props: { oldestCadDay: string | null }) {
  const { status, rateFor } = useCadUsdRates({
    oldestCadDay: props.oldestCadDay,
    today: "2026-11-25",
  });
  return createElement("p", {
    "data-status": status,
    "data-rate": String(rateFor("2026-11-20")),
    "data-is-function": String(typeof rateFor === "function"),
  });
}

const render = (oldestCadDay: string | null) =>
  renderToString(createElement(Probe, { oldestCadDay }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCadUsdRates: the first frame", () => {
  it("is idle, with no rate for any day, when there is no CAD repair", () => {
    const html = render(null);
    expect(html).toContain('data-status="idle"');
    expect(html).toContain('data-rate="null"');
    expect(html).toContain('data-is-function="true"');
  });

  it("is loading, with no rate for any day, when there is a CAD repair", () => {
    const html = render("2026-01-05");
    expect(html).toContain('data-status="loading"');
    expect(html).toContain('data-rate="null"');
    expect(html).toContain('data-is-function="true"');
  });

  it("does not read the storage and does not ask the API while rendering", () => {
    const getItem = vi.fn(() => null);
    const setItem = vi.fn();
    const fetchSpy = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem, setItem } });
    vi.stubGlobal("fetch", fetchSpy);

    render("2026-01-05");
    render(null);

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
