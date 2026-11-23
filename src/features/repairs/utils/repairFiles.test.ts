import { describe, expect, it } from "vitest";
import {
  EMPTY_FILES_DRAFT,
  REPAIR_FILE_MAX_BYTES,
  REPAIR_FILE_MESSAGES,
  REPAIR_FILE_MIME_TYPES,
  addDraftFiles,
  checkPickedFiles,
  deleteFileDialogText,
  fileExtension,
  filesFailureLines,
  formatFileSize,
  isFilesDraftChanged,
  refusedFilesLines,
  removeDraftFile,
  removeStoredFile,
  repairFilePath,
  storedRowsAfterRemovals,
  type FilesDraft,
} from "./repairFiles";
import { buildRepairFileRows, type RawRepairFileRow, type RepairFileRow } from "./repairWindow";

// docs/specs/repairs-09b3-files.md §2.2 to §2.6, §3 and §7 (D191 to D204). The rules of the files
// and their words, with no React and no network.

/** A file of a given size without allocating its bytes (the check reads only name, type, size). */
function pick(name: string, type: string, size = 1000): File {
  const file = new File([], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const stored = (id: string, name: string, path: string): RepairFileRow => ({
  id,
  name,
  kind: "photo",
  day: "2026-09-18",
  path,
});

describe("the limits (D197)", () => {
  it("is 10 x 1024 x 1024 bytes and the 13 MIME types of the bucket", () => {
    expect(REPAIR_FILE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(REPAIR_FILE_MIME_TYPES).toHaveLength(13);
  });
});

describe("checkPickedFiles (D197, D198)", () => {
  it.each([...REPAIR_FILE_MIME_TYPES])("accepts %s", (type) => {
    const file = pick("a.bin", type);
    expect(checkPickedFiles([file])).toEqual({ accepted: [file], refused: [] });
  });

  it("refuses an empty type and a type that is not allowed, as type", () => {
    const empty = pick("photo.heic", "");
    const zip = pick("a.zip", "application/zip");
    expect(checkPickedFiles([empty, zip])).toEqual({
      accepted: [],
      refused: [
        { name: "photo.heic", reason: "type" },
        { name: "a.zip", reason: "type" },
      ],
    });
  });

  it("accepts exactly 10 485 760 bytes and refuses one byte more, as size", () => {
    const edge = pick("edge.pdf", "application/pdf", 10_485_760);
    const over = pick("over.pdf", "application/pdf", 10_485_761);
    expect(checkPickedFiles([edge, over])).toEqual({
      accepted: [edge],
      refused: [{ name: "over.pdf", reason: "size" }],
    });
  });

  it("says type when a file is both the wrong type and too large", () => {
    expect(checkPickedFiles([pick("big.zip", "application/zip", 99_999_999)]).refused).toEqual([
      { name: "big.zip", reason: "type" },
    ]);
  });

  it("keeps the order and splits a mixed pick", () => {
    const a = pick("a.png", "image/png");
    const b = pick("b.zip", "application/zip");
    const c = pick("c.pdf", "application/pdf");
    const result = checkPickedFiles([a, b, c]);
    expect(result.accepted).toEqual([a, c]);
    expect(result.refused).toEqual([{ name: "b.zip", reason: "type" }]);
  });
});

describe("refusedFilesLines (§2.3)", () => {
  it("writes one line for each file with the text of its reason", () => {
    expect(
      refusedFilesLines([
        { name: "IMG_0412.zip", reason: "type" },
        { name: "scan.pdf", reason: "size" },
      ]),
    ).toEqual(["IMG_0412.zip: this type of file is not allowed.", "scan.pdf: larger than 10 MB."]);
  });
});

describe("the draft (D191, D200)", () => {
  it("has nothing in the empty draft, and that is not a change", () => {
    expect(EMPTY_FILES_DRAFT).toEqual({ added: [], removed: [] });
    expect(isFilesDraftChanged(EMPTY_FILES_DRAFT)).toBe(false);
  });

  it("adds files in the order picked and makes a key for each", () => {
    let n = 0;
    const a = pick("a.png", "image/png");
    const b = pick("b.png", "image/png");
    const draft = addDraftFiles(EMPTY_FILES_DRAFT, [a, b], () => `k${++n}`);
    expect(draft.added).toEqual([
      { key: "k1", file: a },
      { key: "k2", file: b },
    ]);
    expect(isFilesDraftChanged(draft)).toBe(true);
    // The draft it was made from is untouched.
    expect(EMPTY_FILES_DRAFT.added).toHaveLength(0);
  });

  it("takes a file out by its key, and a file added and then removed is no change", () => {
    const draft = addDraftFiles(
      EMPTY_FILES_DRAFT,
      [pick("a.png", "image/png"), pick("b.png", "image/png")],
      (() => {
        let n = 0;
        return () => `k${++n}`;
      })(),
    );
    const one = removeDraftFile(draft, "k1");
    expect(one.added.map((entry) => entry.key)).toEqual(["k2"]);
    expect(isFilesDraftChanged(removeDraftFile(one, "k2"))).toBe(false);
  });

  it("marks a stored file removed once, and a second call changes nothing", () => {
    const row = stored("f1", "Photo 1", "r/a.jpg");
    const once = removeStoredFile(EMPTY_FILES_DRAFT, row);
    expect(once.removed).toEqual([row]);
    expect(removeStoredFile(once, row).removed).toEqual([row]);
    expect(isFilesDraftChanged(once)).toBe(true);
  });
});

describe("storedRowsAfterRemovals (D202)", () => {
  const raw: RawRepairFileRow[] = [
    { id: "f1", photo_path: "r/a.jpg", created_at: "2026-09-18T10:00:00Z" },
    { id: "f2", photo_path: "r/b.pdf", created_at: "2026-09-19T10:00:00Z" },
    { id: "f3", photo_path: "r/c.png", created_at: "2026-09-20T10:00:00Z" },
  ];

  it("leaves out the removed ids and keeps the rest as they were", () => {
    const draft: FilesDraft = { added: [], removed: [stored("f2", "PDF 1", "r/b.pdf")] };
    expect(storedRowsAfterRemovals(raw, draft).map((row) => row.id)).toEqual(["f1", "f3"]);
  });

  it("names the next photo Photo 1 after Photo 1 is removed", () => {
    const draft: FilesDraft = { added: [], removed: [stored("f1", "Photo 1", "r/a.jpg")] };
    const names = buildRepairFileRows(storedRowsAfterRemovals(raw, draft), "America/Toronto").map(
      (row) => row.name,
    );
    expect(names).toEqual(["PDF 1", "Photo 1"]);
  });
});

describe("fileExtension and repairFilePath (§2.4)", () => {
  it("takes the text after the last dot, in lower case", () => {
    expect(fileExtension({ name: "report.v2.PDF", type: "application/pdf" })).toBe("pdf");
    expect(fileExtension({ name: "IMG_0412.JPG", type: "image/jpeg" })).toBe("jpg");
  });

  it("takes the extension of the MIME type when the name has none", () => {
    expect(fileExtension({ name: "scan", type: "image/jpeg" })).toBe("jpg");
    expect(fileExtension({ name: "scan", type: "image/jpg" })).toBe("jpg");
    expect(fileExtension({ name: "scan", type: "image/png" })).toBe("png");
    expect(fileExtension({ name: "scan", type: "application/pdf" })).toBe("pdf");
    expect(fileExtension({ name: "scan", type: "text/csv" })).toBe("csv");
    expect(fileExtension({ name: "scan", type: "application/msword" })).toBe("doc");
    expect(
      fileExtension({
        name: "scan",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("docx");
  });

  it("takes the MIME type's extension when the tail is not letters and digits", () => {
    expect(fileExtension({ name: "a. odd tail", type: "image/png" })).toBe("png");
    expect(fileExtension({ name: "trailing.", type: "application/pdf" })).toBe("pdf");
  });

  it("builds <repair id>/<object id>.<extension>", () => {
    expect(repairFilePath("r-1", "o-1", { name: "IMG_0412.JPG", type: "image/jpeg" })).toBe(
      "r-1/o-1.jpg",
    );
  });
});

describe("formatFileSize (D200)", () => {
  it.each([
    [12, "12 B"],
    [1023, "1023 B"],
    [1024, "1 KB"],
    [348_160, "340 KB"],
    [2_516_582, "2.4 MB"],
    [10_485_760, "10 MB"],
  ])("writes %i bytes as %s", (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });
});

describe("deleteFileDialogText (D202)", () => {
  it("has the title of the other delete dialogs", () => {
    expect(deleteFileDialogText("Photo 2", "now").title).toBe("Are you absolutely sure?");
    expect(deleteFileDialogText("Photo 2", "onSave").title).toBe("Are you absolutely sure?");
  });

  it("says in the view mode that it cannot be undone, and in Edit that it goes at Save", () => {
    expect(deleteFileDialogText("Photo 2", "now").description).toBe(
      "This removes Photo 2 from the repair. It cannot be undone in the app.",
    );
    expect(deleteFileDialogText("Photo 2", "onSave").description).toBe(
      "Photo 2 will be removed from the repair when you save.",
    );
  });
});

describe("filesFailureLines (§2.4 step 6, §2.5)", () => {
  const added = [
    { name: "a.jpg", message: "Storage said no" },
    { name: "b.pdf", message: "other" },
  ];
  const removed = [{ name: "Photo 2", message: "row refused" }];

  it("is null when nothing failed", () => {
    expect(filesFailureLines({ notAdded: [], notRemoved: [] }, "save")).toBeNull();
    expect(filesFailureLines({ notAdded: [], notRemoved: [] }, "view")).toBeNull();
  });

  it("titles a Save by what failed: not added, not removed, or both", () => {
    expect(filesFailureLines({ notAdded: added, notRemoved: [] }, "save")?.[0]).toBe(
      REPAIR_FILE_MESSAGES.savedNotAdded,
    );
    expect(filesFailureLines({ notAdded: [], notRemoved: removed }, "save")?.[0]).toBe(
      REPAIR_FILE_MESSAGES.savedNotRemoved,
    );
    expect(filesFailureLines({ notAdded: added, notRemoved: removed }, "save")?.[0]).toBe(
      REPAIR_FILE_MESSAGES.savedNotUpdated,
    );
    expect(REPAIR_FILE_MESSAGES.savedNotAdded).toBe(
      "The repair was saved, but some files could not be added.",
    );
  });

  it("has the titles of the view mode", () => {
    expect(filesFailureLines({ notAdded: added, notRemoved: [] }, "view")?.[0]).toBe(
      "Some files could not be added.",
    );
    expect(filesFailureLines({ notAdded: [], notRemoved: removed }, "view")?.[0]).toBe(
      "Failed to delete the file.",
    );
  });

  it("names the files not added by their disk names, and the files not removed by their names", () => {
    const lines = filesFailureLines({ notAdded: added, notRemoved: removed }, "save") ?? [];
    expect(lines).toContain("Not added: a.jpg, b.pdf");
    expect(lines).toContain("Not removed: Photo 2");
  });

  it("ends with the text of the first failure", () => {
    const lines = filesFailureLines({ notAdded: added, notRemoved: removed }, "save") ?? [];
    expect(lines[lines.length - 1]).toBe("Storage said no");
    const onlyRemoved = filesFailureLines({ notAdded: [], notRemoved: removed }, "view") ?? [];
    expect(onlyRemoved[onlyRemoved.length - 1]).toBe("row refused");
  });
});
