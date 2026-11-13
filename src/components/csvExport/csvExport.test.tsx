import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CsvExportProvider, ExportCsvButton, runCsvExport } from "./CsvExport";

const NOW = new Date(2026, 10, 13);

describe("runCsvExport", () => {
  it("downloads the file the tab built, named for the tab and the day", async () => {
    const download = vi.fn();
    await runCsvExport(
      { filenamePrefix: "accountant-ar-deposits", disabled: false, getCsv: () => "a,b" },
      { download, now: NOW },
    );
    expect(download).toHaveBeenCalledWith("accountant-ar-deposits-2026-11-13.csv", "a,b");
  });

  it("waits for a tab that has to fetch its rows first", async () => {
    const download = vi.fn();
    await runCsvExport(
      {
        filenamePrefix: "accountant-audit-driver",
        disabled: false,
        getCsv: () => Promise.resolve("fetched"),
      },
      { download, now: NOW },
    );
    expect(download).toHaveBeenCalledWith("accountant-audit-driver-2026-11-13.csv", "fetched");
  });

  it("downloads nothing for a tab with nothing to export", async () => {
    const download = vi.fn();
    const getCsv = vi.fn();
    await runCsvExport({ filenamePrefix: "x", disabled: true, getCsv }, { download, now: NOW });
    expect(getCsv).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads nothing, and lets the caller know, when the rows cannot be read", async () => {
    const download = vi.fn();
    const failing = {
      filenamePrefix: "x",
      disabled: false,
      getCsv: () => Promise.reject(new Error("db down")),
    };
    await expect(runCsvExport(failing, { download, now: NOW })).rejects.toThrow("db down");
    expect(download).not.toHaveBeenCalled();
  });
});

describe("ExportCsvButton", () => {
  it("is drawn, and disabled until a tab has registered something to export", () => {
    const html = renderToStaticMarkup(
      <CsvExportProvider>
        <ExportCsvButton />
      </CsvExportProvider>,
    );
    expect(html).toContain("Export to CSV");
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});
