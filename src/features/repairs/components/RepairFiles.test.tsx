import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RepairFileRow } from "../utils/repairWindow";
import { RepairFilesContent, type RepairFilesContentProps } from "./RepairFiles";

// docs/specs/repairs-07-repair-window.md §2.5 and §7 (D99, D103, D104). The content is rendered on
// the server: what is under test is which words and links each state gets. The read itself (React
// Query and Supabase) and the new tab are covered by e2e.

const files: RepairFileRow[] = [
  { id: "f1", name: "Photo 1", kind: "photo", day: "2026-09-18", path: "r1/aaa.jpg" },
  { id: "f2", name: "PDF 1", kind: "pdf", day: "2026-09-19", path: "r1/bbb.pdf" },
  { id: "f3", name: "Word 1", kind: "word", day: null, path: "r1/ccc.docx" },
];

const render = (over: Partial<RepairFilesContentProps> = {}) =>
  renderToStaticMarkup(
    <RepairFilesContent
      state="ready"
      files={files}
      fileUrl={(path) => `https://files.test/maintenance-photos/${path}`}
      {...over}
    />,
  );

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The markup of each file row, in order (a row opens with its test id). */
function fileRows(markup: string): string[] {
  const open = 'data-testid="repair-file"';
  return markup
    .split(open)
    .slice(1)
    .map((p) => open + p);
}

describe("RepairFilesContent frame", () => {
  it("is a section named Files", () => {
    const markup = render();
    expect(markup).toContain('data-testid="repair-files"');
    expect(markup).toMatch(/<h3[^>]*>Files<\/h3>/);
  });

  it("says Loading... while the list loads, and draws no row", () => {
    const markup = render({ state: "loading" });
    expect(text(markup)).toContain("Loading...");
    expect(fileRows(markup)).toHaveLength(0);
    expect(text(markup)).not.toContain("No files.");
  });

  it("says the files could not be loaded when the request failed, and draws no row", () => {
    const markup = render({ state: "error" });
    expect(text(markup)).toContain("Files could not be loaded. They need a connection.");
    expect(fileRows(markup)).toHaveLength(0);
    expect(text(markup)).not.toContain("No files.");
  });

  it("says No files. when the repair has none", () => {
    const markup = render({ files: [] });
    expect(text(markup)).toContain("No files.");
    expect(fileRows(markup)).toHaveLength(0);
    expect(text(markup)).not.toContain("Loading...");
  });
});

describe("RepairFilesContent rows (D103, D104)", () => {
  const rows = fileRows(render());

  it("draws one row per file, in the order given, with its name", () => {
    expect(rows).toHaveLength(3);
    expect(text(rows[0])).toContain("Photo 1");
    expect(text(rows[1])).toContain("PDF 1");
    expect(text(rows[2])).toContain("Word 1");
  });

  it("writes the day added, and nothing when the day is not known", () => {
    expect(text(rows[0])).toContain("Added 2026-09-18");
    expect(text(rows[1])).toContain("Added 2026-09-19");
    expect(text(rows[2])).not.toContain("Added");
  });

  it("links the name and the open button to the public URL, in a new tab", () => {
    const links = [...rows[0].matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toContain('href="https://files.test/maintenance-photos/r1/aaa.jpg"');
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
    }
  });

  it("labels the open button with the name of the file", () => {
    expect(rows[0]).toContain('aria-label="Open Photo 1"');
    expect(rows[1]).toContain('aria-label="Open PDF 1"');
  });

  it("links each file to its own path", () => {
    expect(rows[1]).toContain('href="https://files.test/maintenance-photos/r1/bbb.pdf"');
    expect(rows[2]).toContain('href="https://files.test/maintenance-photos/r1/ccc.docx"');
  });
});

describe("RepairFilesContent is read-only (spec 09 owns the writes)", () => {
  it("has no delete button, no upload control and no drop zone", () => {
    const markup = render();
    const words = text(markup);
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<input");
    expect(words).not.toContain("Delete");
    expect(words).not.toContain("Drag files");
    expect(words).not.toContain("choose files");
  });
});

// docs/specs/repairs-09b3-files.md §2.2, §3 and §7 (D191, D200, D201): the controls of a writer.
describe("RepairFilesContent with controls (09b3)", () => {
  const draftFile = (name: string, size: number, key = `k-${name}`) => {
    const file = new File([], name, { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: size });
    return { key, file };
  };
  const controls = (over: Partial<NonNullable<RepairFilesContentProps["controls"]>> = {}) => ({
    canAdd: true,
    busy: false,
    added: [],
    onPick: () => {},
    onRemoveDraft: () => {},
    onRemoveStored: () => {},
    ...over,
  });

  it("gives every stored row a bin labelled with its name, next to the open button", () => {
    const rows = fileRows(render({ controls: controls() }));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('data-testid="repair-file-delete"');
    expect(rows[0]).toContain('aria-label="Delete Photo 1"');
    expect(rows[1]).toContain('aria-label="Delete PDF 1"');
    expect(rows[0]).toContain('aria-label="Open Photo 1"');
  });

  it("draws Add file and a hidden input that takes several files, only when canAdd", () => {
    const markup = render({ controls: controls() });
    expect(markup).toContain('data-testid="repair-file-add"');
    expect(text(markup)).toContain("Add file");
    const input = markup.match(/<input[^>]*data-testid="repair-file-input"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('type="file"');
    expect(input).toContain("multiple");
    expect(input).toContain("application/pdf");
    expect(input).toContain("image/jpeg");

    const off = render({ controls: controls({ canAdd: false }) });
    expect(off).not.toContain('data-testid="repair-file-add"');
    expect(off).not.toContain('data-testid="repair-file-input"');
  });

  it("draws a draft row with the name on the disk and the size, no link, and its own bin", () => {
    const markup = render({
      controls: controls({ added: [draftFile("IMG_0412.jpg", 2_516_582)] }),
    });
    const draft = markup.split('data-testid="repair-file-draft"')[1] ?? "";
    expect(text(draft)).toContain("IMG_0412.jpg");
    expect(text(draft)).toContain("2.4 MB");
    expect(draft).toContain('data-testid="repair-file-draft-remove"');
    expect(draft).toContain('aria-label="Remove IMG_0412.jpg"');
    expect(draft).not.toContain("<a ");
    expect(draft).not.toContain("Added");
  });

  it("puts the draft rows after the stored rows, in the order picked", () => {
    const markup = render({
      controls: controls({ added: [draftFile("one.jpg", 10), draftFile("two.jpg", 10)] }),
    });
    expect(markup.indexOf("Word 1")).toBeLessThan(markup.indexOf("one.jpg"));
    expect(markup.indexOf("one.jpg")).toBeLessThan(markup.indexOf("two.jpg"));
  });

  it("says No files. only when there is neither a stored row nor a draft row", () => {
    expect(text(render({ files: [], controls: controls() }))).toContain("No files.");
    const withDraft = render({
      files: [],
      controls: controls({ added: [draftFile("one.jpg", 10)] }),
    });
    expect(text(withDraft)).not.toContain("No files.");
    expect(text(withDraft)).toContain("one.jpg");
  });

  it("says Uploading... and disables every button while busy", () => {
    const markup = render({
      controls: controls({ busy: true, added: [draftFile("one.jpg", 10)] }),
    });
    expect(text(markup)).toContain("Uploading...");
    const buttons = [...markup.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toContain("disabled");
    expect(markup).toMatch(/<input[^>]*data-testid="repair-file-input"[^>]*disabled/);
  });

  it("draws no Add file while the list loads or failed, and keeps the draft rows", () => {
    const loading = render({
      state: "loading",
      files: [],
      controls: controls({ canAdd: false, added: [draftFile("one.jpg", 10)] }),
    });
    expect(text(loading)).toContain("Loading...");
    expect(loading).not.toContain('data-testid="repair-file-add"');
    expect(loading).toContain('data-testid="repair-file-draft"');
  });
});
