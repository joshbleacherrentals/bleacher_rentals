import { describe, expect, it } from "vitest";
import {
  buildRepairFileRows,
  canReadRepairFiles,
  formatVendorAddress,
  repairCreatedLine,
  repairFileKind,
  repairWindowTitle,
} from "./repairWindow";
import { repairRow } from "./repairRowFixture";

// docs/specs/repairs-07-repair-window.md §2.2, §2.3, §2.5, §3 and §7 (D97, D100, D102, D103).

describe("repairWindowTitle (D97)", () => {
  it("joins the invoice number and the vendor's name with a dot", () => {
    const row = repairRow({
      id: "r",
      invoiceNumber: "DTR-2377",
      vendorName: "Dallas Trailer Repair",
    });
    expect(repairWindowTitle(row)).toBe("DTR-2377 · Dallas Trailer Repair");
  });

  it("writes the invoice number alone, or the vendor alone, without the dot", () => {
    expect(repairWindowTitle(repairRow({ id: "r", invoiceNumber: "JJ-5" }))).toBe("JJ-5");
    expect(repairWindowTitle(repairRow({ id: "r", vendorName: "Caprock Tire" }))).toBe(
      "Caprock Tire",
    );
  });

  it("counts a blank invoice number or vendor as missing", () => {
    const row = repairRow({ id: "r", invoiceNumber: "   ", vendorName: " Caprock Tire " });
    expect(repairWindowTitle(row)).toBe("Caprock Tire");
  });

  it("falls back to the bleachers: one in the singular, several in the plural", () => {
    const one = repairRow({ id: "r", bleachers: [{ uuid: "b1", number: 52 }] });
    expect(repairWindowTitle(one)).toBe("Bleacher #52");
    const several = repairRow({
      id: "r",
      bleachers: [
        { uuid: "b1", number: 52 },
        { uuid: "b2", number: 53 },
      ],
    });
    expect(repairWindowTitle(several)).toBe("Bleachers #52, #53");
  });

  it("writes #? for a bleacher whose number is unknown", () => {
    const row = repairRow({
      id: "r",
      bleachers: [
        { uuid: "b1", number: 52 },
        { uuid: "b2", number: null },
      ],
    });
    expect(repairWindowTitle(row)).toBe("Bleachers #52, #?");
    expect(
      repairWindowTitle(repairRow({ id: "r", bleachers: [{ uuid: "b", number: null }] })),
    ).toBe("Bleacher #?");
  });

  it("is just Repair when there is no invoice, no vendor and no bleacher", () => {
    expect(repairWindowTitle(repairRow({ id: "r" }))).toBe("Repair");
  });
});

describe("repairCreatedLine", () => {
  it("writes the day the repair was created", () => {
    const row = repairRow({ id: "r", createdAt: "2026-09-17T16:00:00Z" });
    expect(repairCreatedLine(row, "America/Toronto")).toBe("Created 2026-09-17");
  });

  it("takes the day in the given time zone (a time near midnight moves with it)", () => {
    const row = repairRow({ id: "r", createdAt: "2026-09-17T01:30:00Z" });
    expect(repairCreatedLine(row, "UTC")).toBe("Created 2026-09-17");
    expect(repairCreatedLine(row, "America/Toronto")).toBe("Created 2026-09-16");
  });

  it("is null when the repair has no creation time or the time is not a date", () => {
    expect(repairCreatedLine(repairRow({ id: "r", createdAt: null }), "UTC")).toBeNull();
    expect(repairCreatedLine(repairRow({ id: "r", createdAt: "soon" }), "UTC")).toBeNull();
  });
});

describe("formatVendorAddress (D100)", () => {
  it("joins the city, the state and the country with commas", () => {
    expect(formatVendorAddress({ city: "Dallas", stateProvince: "TX", country: "US" })).toBe(
      "Dallas, TX, US",
    );
  });

  it("leaves out the parts that are missing", () => {
    expect(formatVendorAddress({ city: "Dallas", stateProvince: null, country: "US" })).toBe(
      "Dallas, US",
    );
    expect(formatVendorAddress({ city: null, stateProvince: null, country: "CA" })).toBe("CA");
  });

  it("trims every part and counts a blank one as missing", () => {
    expect(formatVendorAddress({ city: " Dallas ", stateProvince: "  ", country: " US" })).toBe(
      "Dallas, US",
    );
  });

  it("is null when there is no address or no part of it", () => {
    expect(formatVendorAddress(null)).toBeNull();
    expect(formatVendorAddress({ city: null, stateProvince: " ", country: "" })).toBeNull();
  });
});

describe("repairFileKind (D103)", () => {
  it("knows the photo extensions", () => {
    for (const ext of ["jpg", "jpeg", "png", "heic", "heif", "webp"]) {
      expect(repairFileKind(`r1/abc.${ext}`), ext).toBe("photo");
    }
  });

  it("knows the document extensions", () => {
    expect(repairFileKind("r1/a.pdf")).toBe("pdf");
    expect(repairFileKind("r1/a.doc")).toBe("word");
    expect(repairFileKind("r1/a.docx")).toBe("word");
    expect(repairFileKind("r1/a.xls")).toBe("excel");
    expect(repairFileKind("r1/a.xlsx")).toBe("excel");
    expect(repairFileKind("r1/a.txt")).toBe("text");
    expect(repairFileKind("r1/a.csv")).toBe("csv");
  });

  it("ignores the case of the extension", () => {
    expect(repairFileKind("r1/A.JPG")).toBe("photo");
    expect(repairFileKind("r1/A.PdF")).toBe("pdf");
  });

  it("is file for an unknown extension and for no extension", () => {
    expect(repairFileKind("r1/a.zip")).toBe("file");
    expect(repairFileKind("r1/noextension")).toBe("file");
    expect(repairFileKind("")).toBe("file");
  });

  it("reads the extension of the last part of the path only", () => {
    expect(repairFileKind("v1.0/photo.png")).toBe("photo");
    expect(repairFileKind("photo.png/readme")).toBe("file");
  });
});

describe("buildRepairFileRows (D103)", () => {
  const raw = (id: string, path: string, createdAt: string) => ({
    id,
    photo_path: path,
    created_at: createdAt,
  });

  it("gives nothing for no rows", () => {
    expect(buildRepairFileRows([], "UTC")).toEqual([]);
  });

  it("orders the files earliest first, a tie by id, whatever order they come in", () => {
    const rows = buildRepairFileRows(
      [
        raw("c", "r/c.jpg", "2026-09-19T10:00:00Z"),
        raw("b", "r/b.jpg", "2026-09-18T10:00:00Z"),
        raw("a", "r/a.jpg", "2026-09-18T10:00:00Z"),
      ],
      "UTC",
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("names a file by its type and its number among the files of that type", () => {
    const rows = buildRepairFileRows(
      [
        raw("1", "r/1.jpg", "2026-09-18T10:00:00Z"),
        raw("2", "r/2.pdf", "2026-09-18T10:01:00Z"),
        raw("3", "r/3.png", "2026-09-18T10:02:00Z"),
        raw("4", "r/4.docx", "2026-09-18T10:03:00Z"),
        raw("5", "r/5.xlsx", "2026-09-18T10:04:00Z"),
        raw("6", "r/6.txt", "2026-09-18T10:05:00Z"),
        raw("7", "r/7.csv", "2026-09-18T10:06:00Z"),
        raw("8", "r/8.zip", "2026-09-18T10:07:00Z"),
        raw("9", "r/9.pdf", "2026-09-18T10:08:00Z"),
      ],
      "UTC",
    );
    expect(rows.map((r) => r.name)).toEqual([
      "Photo 1",
      "PDF 1",
      "Photo 2",
      "Word 1",
      "Excel 1",
      "Text 1",
      "CSV 1",
      "File 1",
      "PDF 2",
    ]);
    expect(rows.map((r) => r.kind)).toEqual([
      "photo",
      "pdf",
      "photo",
      "word",
      "excel",
      "text",
      "csv",
      "file",
      "pdf",
    ]);
  });

  it("keeps the path and writes the day in the given time zone", () => {
    const [row] = buildRepairFileRows([raw("1", "r/1.jpg", "2026-09-18T01:30:00Z")], "UTC");
    expect(row.path).toBe("r/1.jpg");
    expect(row.day).toBe("2026-09-18");
    const [toronto] = buildRepairFileRows(
      [raw("1", "r/1.jpg", "2026-09-18T01:30:00Z")],
      "America/Toronto",
    );
    expect(toronto.day).toBe("2026-09-17");
  });

  it("has no day for a time that is not a date, and still lists the file", () => {
    const [row] = buildRepairFileRows([raw("1", "r/1.jpg", "not a time")], "UTC");
    expect(row.day).toBeNull();
    expect(row.name).toBe("Photo 1");
  });

  it("puts a file with no readable time after the dated ones", () => {
    const rows = buildRepairFileRows(
      [raw("a", "r/a.jpg", "not a time"), raw("b", "r/b.jpg", "2026-09-18T10:00:00Z")],
      "UTC",
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("does not change its input", () => {
    const input = [
      raw("b", "r/b.jpg", "2026-09-19T10:00:00Z"),
      raw("a", "r/a.jpg", "2026-09-18T10:00:00Z"),
    ];
    const copy = JSON.parse(JSON.stringify(input));
    buildRepairFileRows(input, "UTC");
    expect(input).toEqual(copy);
  });
});

describe("canReadRepairFiles (D102)", () => {
  const roles = { isAdmin: false, isAccountManager: false, isMaintainer: false };

  it("lets an administrator, an account manager and a maintainer read files, each alone", () => {
    expect(canReadRepairFiles({ ...roles, isAdmin: true })).toBe(true);
    expect(canReadRepairFiles({ ...roles, isAccountManager: true })).toBe(true);
    expect(canReadRepairFiles({ ...roles, isMaintainer: true })).toBe(true);
  });

  it("does not let anyone else in, a viewer included (none of the three is set)", () => {
    expect(canReadRepairFiles(roles)).toBe(false);
  });
});
