import { describe, expect, it } from "vitest";
import { buildFileRows, canDeleteFile, fileTypeLabel, type InvoiceFileRow } from "./invoiceFiles";

// Spec: docs/specs/accountant-collections-13-task-history-and-files.md §1, §3 and §5.

const TZ = "America/Toronto";

function file(over: Partial<InvoiceFileRow> & { id: string }): InvoiceFileRow {
  return {
    file_name: "Check_Scan.pdf",
    storage_path: "evt-1/abc.pdf",
    source: "upload",
    created_at: "2026-10-22T15:00:00.000Z",
    ...over,
  };
}

describe("fileTypeLabel", () => {
  it("is the extension in capitals", () => {
    expect(fileTypeLabel("a.pdf")).toBe("PDF");
    expect(fileTypeLabel("a.PDF")).toBe("PDF");
    expect(fileTypeLabel("scan.Png")).toBe("PNG");
    expect(fileTypeLabel("contract.docx")).toBe("DOCX");
  });

  it("takes the last extension of a name with several dots", () => {
    expect(fileTypeLabel("Invoice.2026.final.xlsx")).toBe("XLSX");
  });

  it("is a dash without an extension", () => {
    expect(fileTypeLabel("README")).toBe("—");
    expect(fileTypeLabel("ends-with-dot.")).toBe("—");
    expect(fileTypeLabel("")).toBe("—");
    expect(fileTypeLabel(null)).toBe("—");
  });
});

describe("canDeleteFile", () => {
  it("allows only a file attached by hand", () => {
    expect(canDeleteFile("upload")).toBe(true);
  });

  it.each(["signed_contract", "sent_quote", "email_attachment", "", null, "something_else"])(
    "refuses %j",
    (source) => {
      expect(canDeleteFile(source)).toBe(false);
    },
  );
});

describe("buildFileRows", () => {
  it("is empty for an event with no files", () => {
    expect(buildFileRows([], TZ)).toEqual([]);
  });

  it("numbers the files 1 to n, oldest first", () => {
    const rows = buildFileRows(
      [
        file({ id: "f-new", created_at: "2026-10-25T10:00:00.000Z" }),
        file({ id: "f-old", created_at: "2026-10-20T10:00:00.000Z" }),
        file({ id: "f-mid", created_at: "2026-10-22T10:00:00.000Z" }),
      ],
      TZ,
    );
    expect(rows.map((r) => [r.number, r.id])).toEqual([
      [1, "f-old"],
      [2, "f-mid"],
      [3, "f-new"],
    ]);
  });

  it("puts equal times in id order, so the order never flips", () => {
    const same = "2026-10-22T10:00:00.000Z";
    const rows = buildFileRows(
      [file({ id: "f-b", created_at: same }), file({ id: "f-a", created_at: same })],
      TZ,
    );
    expect(rows.map((r) => r.id)).toEqual(["f-a", "f-b"]);
  });

  it("orders by the moment, whatever the text format of the timestamp", () => {
    const rows = buildFileRows(
      [
        file({ id: "f-later", created_at: "2026-10-22T12:00:00.000Z" }),
        file({ id: "f-earlier", created_at: "2026-10-22 11:00:00+00" }),
      ],
      TZ,
    );
    expect(rows.map((r) => r.id)).toEqual(["f-earlier", "f-later"]);
  });

  it("writes the date in the office's time zone, as MMM d, yyyy", () => {
    // 03:30 UTC is still the evening of Oct 21 in Toronto (EDT, UTC-4).
    const [toronto] = buildFileRows(
      [file({ id: "f-1", created_at: "2026-10-22T03:30:00.000Z" })],
      TZ,
    );
    expect(toronto.dateLabel).toBe("Oct 21, 2026");
    const [tokyo] = buildFileRows(
      [file({ id: "f-1", created_at: "2026-10-22T03:30:00.000Z" })],
      "Asia/Tokyo",
    );
    expect(tokyo.dateLabel).toBe("Oct 22, 2026");
  });

  it("shows a dash for a missing or unreadable date", () => {
    const rows = buildFileRows(
      [file({ id: "f-1", created_at: null }), file({ id: "f-2", created_at: "not a date" })],
      TZ,
    );
    expect(rows.map((r) => r.dateLabel)).toEqual(["—", "—"]);
  });

  it("carries the name, the type, the path and the delete rule of each file", () => {
    const rows = buildFileRows(
      [
        file({
          id: "f-contract",
          file_name: "Signed_Contract.pdf",
          storage_path: "contracts/evt-1/c.pdf",
          source: "signed_contract",
          created_at: "2026-10-20T10:00:00.000Z",
        }),
        file({
          id: "f-scan",
          file_name: "Check_Scan.PNG",
          storage_path: "evt-1/s.png",
          source: "upload",
          created_at: "2026-10-21T10:00:00.000Z",
        }),
      ],
      TZ,
    );
    expect(rows[0]).toMatchObject({
      id: "f-contract",
      name: "Signed_Contract.pdf",
      typeLabel: "PDF",
      storagePath: "contracts/evt-1/c.pdf",
      canDelete: false,
    });
    expect(rows[1]).toMatchObject({
      id: "f-scan",
      name: "Check_Scan.PNG",
      typeLabel: "PNG",
      storagePath: "evt-1/s.png",
      canDelete: true,
    });
  });

  it("keeps a row with no storage path or name, for the table to disable", () => {
    const [row] = buildFileRows([file({ id: "f-1", storage_path: null, file_name: null })], TZ);
    expect(row.storagePath).toBeNull();
    expect(row.name).toBe("");
    expect(row.typeLabel).toBe("—");
  });

  it("does not change the list it was given", () => {
    const input = [
      file({ id: "f-2", created_at: "2026-10-22T10:00:00.000Z" }),
      file({ id: "f-1", created_at: "2026-10-21T10:00:00.000Z" }),
    ];
    buildFileRows(input, TZ);
    expect(input.map((f) => f.id)).toEqual(["f-2", "f-1"]);
  });
});
