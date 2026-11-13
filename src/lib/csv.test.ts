import { describe, it, expect, vi, afterEach } from "vitest";
import { buildCsv, csvFilename, csvTextField, downloadCsv, escapeCsvField } from "./csv";

const BOM = "﻿";

describe("escapeCsvField", () => {
  it("leaves plain text alone", () => {
    expect(escapeCsvField("Homecoming")).toBe("Homecoming");
  });

  it("quotes a field with a comma", () => {
    expect(escapeCsvField("Smith, Jones & Co")).toBe('"Smith, Jones & Co"');
  });

  it("doubles the quotes inside a quoted field", () => {
    expect(escapeCsvField('The "Big" Game')).toBe('"The ""Big"" Game"');
  });

  it("quotes a field with a line break", () => {
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
  });
});

describe("csvTextField", () => {
  it("escapes like any field", () => {
    expect(csvTextField("Smith, Jones")).toBe('"Smith, Jones"');
  });

  it("defuses text that a spreadsheet would run as a formula", () => {
    for (const text of ["=SUM(A1)", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"]) {
      // A leading apostrophe makes the spreadsheet read the cell as text.
      expect(csvTextField(text)).toBe(`'${text}`);
    }
  });

  it("quotes the defused text when it also needs quoting", () => {
    expect(csvTextField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });

  it("does not touch text that only has such a character inside", () => {
    expect(csvTextField("A-1 = B")).toBe("A-1 = B");
  });
});

describe("buildCsv", () => {
  it("starts with a byte-order mark so Excel reads accents as UTF-8", () => {
    expect(buildCsv(["A"], []).startsWith(BOM)).toBe(true);
  });

  it("writes the headers, then one CRLF-ended record per row", () => {
    expect(
      buildCsv(
        ["A", "B"],
        [
          ["1", "2"],
          ["3", "4"],
        ],
      ).replace(BOM, ""),
    ).toBe("A,B\r\n1,2\r\n3,4");
  });

  it("writes only the headers for no rows", () => {
    expect(buildCsv(["A", "B"], []).replace(BOM, "")).toBe("A,B");
  });

  it("takes the cells as they are, already escaped by their writer", () => {
    expect(buildCsv(["A"], [['"a,b"']]).replace(BOM, "")).toBe('A\r\n"a,b"');
  });
});

describe("csvFilename", () => {
  it("is the name and the date, so two exports do not overwrite each other", () => {
    expect(csvFilename("quotes-bookings", new Date(2026, 10, 13))).toBe(
      "quotes-bookings-2026-11-13.csv",
    );
  });
});

describe("downloadCsv", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clicks a temporary link to the file and cleans up after itself", async () => {
    vi.useFakeTimers();
    // The unit tests run in Node, so the page's document is a stand-in that records what is done.
    const link = { href: "", download: "", click: vi.fn() };
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(link),
      body: { appendChild, removeChild },
    });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    downloadCsv("export.csv", "a,b");

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await blob.text()).toBe("a,b");
    expect(link.href).toBe("blob:csv");
    expect(link.download).toBe("export.csv");
    expect(link.click).toHaveBeenCalledOnce();
    // The link is on the page only for the click.
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(removeChild).toHaveBeenCalledWith(link);
    // The URL is let go of once the download has started, not before.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv");
  });
});
