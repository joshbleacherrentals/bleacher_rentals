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
