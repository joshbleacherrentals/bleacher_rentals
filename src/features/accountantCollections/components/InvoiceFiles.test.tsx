import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/accountant-collections-13-task-history-and-files.md §1, §3, §5 and §7. Static
// markup: the query it asks, the section, the table, the staged list. What storage does is tested
// with `eventFileStorage.test.ts` and `eventFileUpload.test.ts`.
// Spec: docs/specs/accountant-collections-21-files-row-click.md §1, §3 and §5 (the row is a
// click target, Download really downloads): the markup of the row, and the two handlers.

type Compiled = { sql: string; parameters: unknown[] };

type HookStubs = Partial<Record<"useState" | "useMemo" | "useRef" | "useEffect", unknown>>;

const mocks = vi.hoisted(() => ({
  compiled: [] as Compiled[],
  answer: { data: [] as unknown[], isLoading: false },
  supabase: {} as object,
  /** `Users.id` of the signed-in user, as `usePermissionsStore` holds it. */
  userUuid: "user-uuid-5" as string | null,
  uploadEventFile: vi.fn(),
  removeEventFile: vi.fn(),
  createEventFileUrl: vi.fn(),
  /** The lines of every `createErrorToastNoThrow` call. */
  toast: vi.fn(),
  /** While set, the component's hooks are these stubs (see `callComponent`); otherwise the real ones. */
  hooks: null as HookStubs | null,
}));

// Spec: docs/specs/event-change-log-02-file-upload-delete.md §3 and §5. The project has no DOM
// environment and no testing-library, and `renderToStaticMarkup` cannot press a button, so the
// handlers are reached by calling the component itself with stubbed hooks. Every other test of this
// file renders with the real ones: the stubs delegate unless `mocks.hooks` is set.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const hook =
    (name: keyof HookStubs) =>
    (...args: unknown[]) =>
      ((mocks.hooks?.[name] ?? actual[name]) as (...a: unknown[]) => unknown)(...args);
  return {
    ...actual,
    useState: hook("useState"),
    useMemo: hook("useMemo"),
    useRef: hook("useRef"),
    useEffect: hook("useEffect"),
  };
});

vi.mock("@/components/providers/SystemProvider", async () => {
  const { DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } =
    await import("kysely");
  return {
    db: new Kysely({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new SqliteIntrospector(kysely),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      },
    }),
  };
});
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: (compiled: Compiled) => {
    mocks.compiled.push(compiled);
    return mocks.answer;
  },
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "user_clerk_7" }) }));
vi.mock("@/utils/supabase/useClerkSupabaseClient", () => ({
  useClerkSupabaseClient: () => mocks.supabase,
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (select: (s: { userId: string | null }) => unknown) =>
    select({ userId: mocks.userUuid }),
}));
vi.mock("@/features/quotesAndBookings/utils/eventFileUpload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/quotesAndBookings/utils/eventFileUpload")>()),
  uploadEventFile: (p: unknown) => mocks.uploadEventFile(p),
}));
vi.mock("@/features/quotesAndBookings/utils/eventFileStorage", () => ({
  createEventFileUrl: (...args: unknown[]) => mocks.createEventFileUrl(...args),
  removeEventFile: (...args: unknown[]) => mocks.removeEventFile(...args),
}));
vi.mock("@/components/toasts/ErrorToast", () => ({
  createErrorToastNoThrow: (lines: string[]) => mocks.toast(lines),
}));

import {
  FilesTable,
  InvoiceFiles,
  splitRefused,
  StagedFilesList,
  type StagedFile,
} from "./InvoiceFiles";
import { AlertDialogAction } from "@/components/ui/alert-dialog";
import { buildFileRows, type InvoiceFileRow } from "../utils/invoiceFiles";

const TZ = "America/Toronto";

const FILES: InvoiceFileRow[] = [
  {
    id: "f-contract",
    file_name: "Signed_Contract.pdf",
    storage_path: "contracts/evt-1/c.pdf",
    source: "signed_contract",
    created_at: "2026-10-22T15:00:00.000Z",
  },
  {
    id: "f-scan",
    file_name: "Check_Scan.pdf",
    storage_path: "evt-1/s.pdf",
    source: "upload",
    created_at: "2026-10-22T16:00:00.000Z",
  },
];

beforeEach(() => {
  mocks.compiled = [];
  mocks.answer = { data: FILES, isLoading: false };
  mocks.userUuid = "user-uuid-5";
  mocks.uploadEventFile.mockReset();
  mocks.uploadEventFile.mockResolvedValue("new-file-id");
  mocks.removeEventFile.mockReset();
  mocks.removeEventFile.mockResolvedValue(undefined);
  mocks.createEventFileUrl.mockReset();
  mocks.createEventFileUrl.mockResolvedValue("https://storage.example/signed?token=abc");
  mocks.toast.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const render = () => renderToStaticMarkup(<InvoiceFiles eventId="evt-1" timezone={TZ} />);

function bodyRows(html: string): string[][] {
  const body = /<tbody>([^]*)<\/tbody>/.exec(html)?.[1] ?? "";
  return [...body.matchAll(/<tr[^>]*>([^]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td[^>]*>([^]*?)<\/td>/g)].map((cell) =>
      cell[1].replace(/<[^>]+>/g, "").trim(),
    ),
  );
}

const rowOf = (html: string, name: string) =>
  new RegExp(`<tr[^>]*>(?:(?!</tr>)[^])*${name}(?:(?!</tr>)[^])*</tr>`).exec(html)?.[0] ?? "";

describe("InvoiceFiles: the query", () => {
  it("reads the event's EventFiles from the local database, nothing from Supabase", () => {
    render();
    expect(mocks.compiled).toHaveLength(1);
    expect(mocks.compiled[0].sql).toContain('from "EventFiles"');
    expect(mocks.compiled[0].sql).toContain('"event_uuid" = ?');
    expect(mocks.compiled[0].parameters).toEqual(["evt-1"]);
  });
});

describe("InvoiceFiles: the section", () => {
  it("is the section Files, with an Attach File button in its header", () => {
    const html = render();
    expect(html).toContain('aria-label="Files"');
    expect(html).toMatch(/<h3[^>]*>Files<\/h3>/);
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*>(?:(?!<\/button>)[^])*Attach File<\/button>/,
    );
    expect(html).toMatch(
      /<button[^>]*>(?:(?!<\/button>)[^])*<svg(?:(?!<\/button>)[^])*Attach File/,
    );
  });

  it("has a hidden file input that takes several files of the accepted types", () => {
    const input = /<input[^>]*type="file"[^>]*>/.exec(render())?.[0] ?? "";
    expect(input).toContain("multiple");
    expect(input).toContain("hidden");
    expect(input).toContain("application/pdf");
    expect(input).toContain("image/png");
    expect(input).toContain("text/csv");
  });

  it("has no drop zone", () => {
    const html = render();
    expect(html).not.toMatch(/drag|drop/i);
    expect(html).not.toContain("border-dashed");
  });

  it("starts with nothing staged", () => {
    expect(render()).not.toContain("Ready to Upload");
  });

  it("lists the files with the columns #, File Name, Type, Date and Action", () => {
    const html = render();
    const headers = [...html.matchAll(/<th[^>]*scope="col"[^>]*>([^<]*)</g)].map((m) =>
      m[1].trim(),
    );
    expect(headers).toEqual(["#", "File Name", "Type", "Date", "Action"]);
    expect(bodyRows(html)).toEqual([
      ["1", "Signed_Contract.pdf", "PDF", "Oct 22, 2026", ""],
      ["2", "Check_Scan.pdf", "PDF", "Oct 22, 2026", ""],
    ]);
  });
});

describe("FilesTable", () => {
  const rows = buildFileRows(FILES, TZ);
  const table = (props: Partial<React.ComponentProps<typeof FilesTable>> = {}) =>
    renderToStaticMarkup(
      <FilesTable
        rows={rows}
        isLoading={false}
        onOpen={vi.fn()}
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />,
    );

  it("gives every row a Download", () => {
    const html = table();
    expect(rowOf(html, "Signed_Contract.pdf")).toContain(
      'aria-label="Download Signed_Contract.pdf"',
    );
    expect(rowOf(html, "Check_Scan.pdf")).toContain('aria-label="Download Check_Scan.pdf"');
  });

  it("gives Delete to a file attached by hand only", () => {
    const html = table();
    expect(rowOf(html, "Check_Scan.pdf")).toContain('aria-label="Delete Check_Scan.pdf"');
    expect(rowOf(html, "Signed_Contract.pdf")).not.toContain("Delete");
    expect(html.match(/aria-label="Delete /g)).toHaveLength(1);
  });

  it("gives no Delete to a sent quote or an e-mail attachment", () => {
    const others = buildFileRows(
      [
        { ...FILES[0], id: "a", file_name: "Quote.pdf", source: "sent_quote" },
        { ...FILES[0], id: "b", file_name: "Mail.pdf", source: "email_attachment" },
      ],
      TZ,
    );
    const html = table({ rows: others });
    expect(html).toContain('aria-label="Download Quote.pdf"');
    expect(html).toContain('aria-label="Download Mail.pdf"');
    expect(html).not.toContain("Delete");
  });

  it("disables Download and Delete of a row with no storage path", () => {
    const broken = buildFileRows([{ ...FILES[1], storage_path: null }], TZ);
    const html = table({ rows: broken });
    const download = /<button[^>]*aria-label="Download Check_Scan.pdf"[^>]*>/.exec(html)?.[0] ?? "";
    const remove = /<button[^>]*aria-label="Delete Check_Scan.pdf"[^>]*>/.exec(html)?.[0] ?? "";
    expect(download).toMatch(/\sdisabled=""/);
    expect(remove).toMatch(/\sdisabled=""/);
  });

  it("does not disable the buttons of a row that has a path", () => {
    const download =
      /<button[^>]*aria-label="Download Check_Scan.pdf"[^>]*>/.exec(table())?.[0] ?? "";
    expect(download).not.toMatch(/\sdisabled=""/);
  });

  // ── The whole row opens the file (spec 21, §1, §3 and §5) ──

  const OPEN_TITLE = "Opens the file in a new tab";
  const trOf = (html: string, name: string) => /^<tr[^>]*>/.exec(rowOf(html, name))?.[0] ?? "";
  const classOf = (tag: string) => /class="([^"]*)"/.exec(tag)?.[1] ?? "";
  /** The `<button …>name</button>` that holds the file name, or "" when the name is not in one. */
  const nameButtonOf = (html: string, name: string) =>
    new RegExp(
      `<button(?![^>]*aria-label)[^>]*>(?:(?!</button>)[^])*${name}(?:(?!</button>)[^])*</button>`,
    ).exec(html)?.[0] ?? "";

  it("makes the file name a real button inside its row, not a link", () => {
    const html = table();
    expect(html).not.toMatch(/<a[\s>]/);
    for (const name of ["Signed_Contract.pdf", "Check_Scan.pdf"]) {
      const button = nameButtonOf(html, name);
      expect(button).toMatch(/^<button[^>]*type="button"/);
      expect(rowOf(html, name)).toContain(button);
    }
  });

  it("stretches the name button over the whole row with an overlay, and makes the row its box", () => {
    const html = table();
    const button = nameButtonOf(html, "Check_Scan.pdf");
    expect(classOf(button)).toContain("after:absolute");
    expect(classOf(button)).toContain("after:inset-0");
    // The button itself must not become the box of the overlay, or it covers only its own text.
    expect(classOf(button).split(/\s+/)).not.toContain("relative");
    expect(classOf(trOf(html, "Check_Scan.pdf")).split(/\s+/)).toContain("relative");
    expect(classOf(trOf(html, "Signed_Contract.pdf")).split(/\s+/)).toContain("relative");
  });

  it("puts the Action cell above the overlay, so Download and Delete do not also open the file", () => {
    const html = table();
    const row = rowOf(html, "Check_Scan.pdf");
    const cells = [...row.matchAll(/<td[^>]*>/g)].map((m) => m[0]);
    expect(cells).toHaveLength(5);
    const action = classOf(cells[4]).split(/\s+/);
    expect(action).toContain("relative");
    expect(action).toContain("z-10");
    // The Download and Delete buttons are inside that cell.
    const actionCell = row.slice(row.lastIndexOf(cells[4]));
    expect(actionCell).toContain('aria-label="Download Check_Scan.pdf"');
    expect(actionCell).toContain('aria-label="Delete Check_Scan.pdf"');
    // No other cell is above the overlay.
    for (const cell of cells.slice(0, 4)) expect(classOf(cell).split(/\s+/)).not.toContain("z-10");
  });

  it("titles the name button 'Opens the file in a new tab'", () => {
    const button = nameButtonOf(table(), "Check_Scan.pdf");
    expect(/<button[^>]*\stitle="([^"]*)"/.exec(button)?.[1]).toBe(OPEN_TITLE);
  });

  it("gives the clickable row a hand, a light grey hover, an underlined name and a blue focus ring", () => {
    const html = table();
    const row = classOf(trOf(html, "Check_Scan.pdf"));
    const button = classOf(nameButtonOf(html, "Check_Scan.pdf"));
    expect(row).toContain("hover:bg-gray-50");
    expect(button).toContain("cursor-pointer");
    expect(html).toContain("group-hover:underline");
    // Keyboard focus on the name: a 2 px outline in the page's blue, drawn around the whole row.
    expect(button).toContain("focus-visible:after:outline-2");
    expect(button).toContain("focus-visible:after:outline-lightBlue");
    expect(button).toContain("focus-visible:outline-none");
  });

  it("keeps the whole name in a title of its own and cuts a long one with an ellipsis, inside the button", () => {
    const long = "A_very_long_scanned_check_from_the_customers_bank_for_the_second_installment.pdf";
    const html = table({ rows: buildFileRows([{ ...FILES[1], file_name: long }], TZ) });
    const button = nameButtonOf(html, long);
    const span = new RegExp(`<span[^>]*>${long}</span>`).exec(button)?.[0] ?? "";
    expect(span).toContain(`title="${long}"`);
    expect(span).toContain("truncate");
  });

  it("calls onOpen with the row when the name button is clicked, and no other handler", () => {
    const onOpen = vi.fn();
    const onDownload = vi.fn();
    const onDelete = vi.fn();
    const tree = FilesTable({ rows, isLoading: false, onOpen, onDownload, onDelete });
    const opens = findAll(tree, (el) => el.type === "button" && el.props?.title === OPEN_TITLE);
    expect(opens).toHaveLength(2);
    opens[1].props.onClick();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(rows[1]);
    expect(onDownload).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("keeps Download and Delete wired to their own handlers, not to onOpen", () => {
    const onOpen = vi.fn();
    const onDownload = vi.fn();
    const onDelete = vi.fn();
    const tree = FilesTable({ rows, isLoading: false, onOpen, onDownload, onDelete });
    const named = (label: string) =>
      findAll(tree, (el) => el.type === "button" && el.props?.["aria-label"] === label)[0];
    named("Download Check_Scan.pdf").props.onClick();
    named("Delete Check_Scan.pdf").props.onClick();
    expect(onDownload).toHaveBeenCalledWith(rows[1]);
    expect(onDelete).toHaveBeenCalledWith(rows[1]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  describe("a row with no storage path", () => {
    const broken = buildFileRows([{ ...FILES[1], storage_path: null }], TZ);

    it("writes the name as plain text: no button around it, no title about opening", () => {
      const html = table({ rows: broken });
      expect(html).toMatch(/<span[^>]*>Check_Scan\.pdf<\/span>/);
      expect(nameButtonOf(html, "Check_Scan.pdf")).toBe("");
      expect(html).not.toContain(OPEN_TITLE);
      for (const [, inner] of html.matchAll(/<button[^>]*>([^]*?)<\/button>/g)) {
        expect(inner).not.toContain("Check_Scan.pdf");
      }
    });

    it("is not clickable and has no hover: no overlay, no hand, no grey, no underline", () => {
      const html = table({ rows: broken });
      expect(html).not.toContain("after:absolute");
      expect(html).not.toContain("hover:bg-gray-50");
      expect(html).not.toContain("group-hover:underline");
      // (The Download and Delete icons keep their own pointer; the row and the name have none.)
      expect(classOf(trOf(html, "Check_Scan.pdf"))).not.toContain("cursor-pointer");
      const nameSpan = /<span[^>]*>Check_Scan\.pdf<\/span>/.exec(html)?.[0] ?? "";
      expect(classOf(nameSpan)).not.toContain("cursor-pointer");
    });

    it("still has Download and Delete, disabled", () => {
      const html = table({ rows: broken });
      expect(/<button[^>]*aria-label="Download Check_Scan.pdf"[^>]*>/.exec(html)?.[0]).toMatch(
        /\sdisabled=""/,
      );
      expect(/<button[^>]*aria-label="Delete Check_Scan.pdf"[^>]*>/.exec(html)?.[0]).toMatch(
        /\sdisabled=""/,
      );
    });
  });

  it("cuts a long name and keeps the whole of it in a title", () => {
    const long = "A_very_long_scanned_check_from_the_customers_bank_for_the_second_installment.pdf";
    const html = table({ rows: buildFileRows([{ ...FILES[1], file_name: long }], TZ) });
    const span = new RegExp(`<span[^>]*>${long}</span>`).exec(html)?.[0] ?? "";
    expect(span).toContain(`title="${long}"`);
    expect(span).toContain("truncate");
  });

  it("says No files uploaded yet when there are none", () => {
    const html = table({ rows: [] });
    expect(bodyRows(html)).toEqual([["No files uploaded yet"]]);
  });

  it("shows no empty message while the list is loading", () => {
    const html = table({ rows: [], isLoading: true });
    expect(html).not.toContain("No files uploaded yet");
  });

  it("shows a dash for a missing name", () => {
    const html = table({ rows: buildFileRows([{ ...FILES[1], file_name: null }], TZ) });
    expect(bodyRows(html)[0].slice(0, 3)).toEqual(["1", "—", "—"]);
  });
});

describe("StagedFilesList", () => {
  const file = (name: string, type = "application/pdf") => ({ name, type, size: 1024 }) as File;
  const staged: StagedFile[] = [
    { id: "s-1", file: file("Check_Scan.pdf") },
    { id: "s-2", file: file("Photo.png", "image/png"), preview: "blob:photo" },
  ];
  const list = (props: Partial<React.ComponentProps<typeof StagedFilesList>> = {}) =>
    renderToStaticMarkup(
      <StagedFilesList
        staged={staged}
        saving={false}
        onRemove={vi.fn()}
        onClear={vi.fn()}
        onSave={vi.fn()}
        {...props}
      />,
    );

  it("counts the chosen files and offers Clear All and Save", () => {
    const html = list();
    expect(html).toContain("Ready to Upload (2)");
    expect(html).toContain("Clear All");
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[^])*Save<\/button>/);
  });

  it("shows a file's name, or a thumbnail for an image, and an X to drop each", () => {
    const html = list();
    expect(html).toContain("Check_Scan.pdf");
    expect(html).toMatch(/<img[^>]*src="blob:photo"[^>]*alt="Photo.png"/);
    expect(html).toContain('aria-label="Remove Check_Scan.pdf"');
    expect(html).toContain('aria-label="Remove Photo.png"');
  });

  it("is nothing when nothing is staged", () => {
    expect(list({ staged: [] })).toBe("");
  });

  it("dims Save and says Saving... while the files go up", () => {
    const html = list({ saving: true });
    expect(html).toContain("Saving...");
    expect(/<button[^>]*>(?:(?!<\/button>)[^])*Saving\.\.\./.exec(html)?.[0]).toMatch(
      /\sdisabled=""/,
    );
  });
});

describe("splitRefused", () => {
  const f = (name: string, type: string, mb = 1) => ({ name, type, size: mb * 1024 * 1024 });

  it("keeps the files the quote card accepts", () => {
    const { accepted, refused } = splitRefused([
      f("a.pdf", "application/pdf"),
      f("b.png", "image/png"),
      f("c.csv", "text/csv"),
    ]);
    expect(accepted.map((x) => x.name)).toEqual(["a.pdf", "b.png", "c.csv"]);
    expect(refused).toEqual([]);
  });

  it("refuses a wrong type with the quote card's wording", () => {
    const { accepted, refused } = splitRefused([f("a.zip", "application/zip")]);
    expect(accepted).toEqual([]);
    expect(refused).toEqual([
      { title: "Invalid file type", detail: "Accepted: PDF, DOC, XLS, CSV, images" },
    ]);
  });

  it("refuses a file over 20 MB", () => {
    const { accepted, refused } = splitRefused([f("big.pdf", "application/pdf", 21)]);
    expect(accepted).toEqual([]);
    expect(refused).toEqual([{ title: "File too large", detail: "Maximum size is 20MB" }]);
  });

  it("accepts exactly 20 MB", () => {
    expect(splitRefused([f("edge.pdf", "application/pdf", 20)]).accepted).toHaveLength(1);
  });

  it("still takes the good files of a batch that has a refused one", () => {
    const { accepted, refused } = splitRefused([
      f("a.pdf", "application/pdf"),
      f("a.zip", "application/zip"),
      f("b.pdf", "application/pdf"),
    ]);
    expect(accepted.map((x) => x.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(refused).toHaveLength(1);
  });
});

// ── The Log row of an upload and of a delete (spec 02, §3 and §5, A1) ──

type Node = { type?: unknown; props?: { children?: unknown } & Record<string, any> } | unknown;

/** Every element of the tree `component` returned that `matches`, without rendering any child. */
function findAll(node: Node, matches: (el: any) => boolean): any[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, matches));
  if (!node || typeof node !== "object") return [];
  const el = node as { props?: { children?: unknown } };
  return [...(matches(el) ? [el] : []), ...findAll(el.props?.children, matches)];
}

/**
 * Calls `InvoiceFiles` as a function with its hooks stubbed: `useState` returns the given values by
 * the order of the component's `useState` calls (0 staged, 1 saving, 2 deleteTarget, 3 deleting),
 * and its setters do nothing. Returns the element tree, whose handlers can then be called.
 */
function callComponent(state: Record<number, unknown>) {
  let next = 0;
  mocks.hooks = {
    useState: (initial: unknown) => {
      const index = next++;
      return [index in state ? state[index] : initial, vi.fn()];
    },
    useMemo: (compute: () => unknown) => compute(),
    useRef: (initial: unknown) => ({ current: initial }),
    useEffect: () => undefined,
  };
  try {
    return InvoiceFiles({ eventId: "evt-1", timezone: TZ });
  } finally {
    mocks.hooks = null;
  }
}

const pdf = (name: string) => new File(["x"], name, { type: "application/pdf" });

describe("InvoiceFiles: Save writes the Log row through uploadEventFile", () => {
  const save = (state: Record<number, unknown>) => {
    const [list] = findAll(callComponent(state), (el) => el.type === StagedFilesList);
    return list.props.onSave() as Promise<void>;
  };

  it("hands the event, the user's Users.id and the file to uploadEventFile, once per file", async () => {
    const a = pdf("a.pdf");
    const b = pdf("b.pdf");
    await save({
      0: [
        { id: "s-1", file: a },
        { id: "s-2", file: b },
      ],
    });
    expect(mocks.uploadEventFile).toHaveBeenCalledTimes(2);
    expect(mocks.uploadEventFile).toHaveBeenNthCalledWith(1, {
      supabase: mocks.supabase,
      eventId: "evt-1",
      file: a,
      source: "upload",
      uploadedBy: "user_clerk_7",
      changedByUserUuid: "user-uuid-5",
    });
    expect(mocks.uploadEventFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ file: b, changedByUserUuid: "user-uuid-5" }),
    );
  });

  it("keeps the Clerk id for EventFiles.uploaded_by and the Users.id for the Log, as two different values", async () => {
    await save({ 0: [{ id: "s-1", file: pdf("a.pdf") }] });
    const call = mocks.uploadEventFile.mock.calls[0][0];
    expect(call.uploadedBy).toBe("user_clerk_7");
    expect(call.changedByUserUuid).toBe("user-uuid-5");
    expect(call.changedByUserUuid).not.toBe(call.uploadedBy);
  });

  it("passes a null author when the user id is not loaded", async () => {
    mocks.userUuid = null;
    await save({ 0: [{ id: "s-1", file: pdf("a.pdf") }] });
    expect(mocks.uploadEventFile.mock.calls[0][0].changedByUserUuid).toBeNull();
  });

  it("uploads nothing when nothing is staged", async () => {
    await save({ 0: [] });
    expect(mocks.uploadEventFile).not.toHaveBeenCalled();
  });
});

describe("InvoiceFiles: Delete writes the Log row through removeEventFile", () => {
  const target = {
    number: 2,
    id: "f-scan",
    name: "Check_Scan.pdf",
    typeLabel: "PDF",
    dateLabel: "Oct 22, 2026",
    storagePath: "evt-1/s.pdf",
    canDelete: true,
  };
  const confirmDelete = (state: Record<number, unknown>) => {
    const [action] = findAll(callComponent(state), (el) => el.type === AlertDialogAction);
    return action.props.onClick() as Promise<void>;
  };

  it("hands the file, with its name, and the event and the user's Users.id to removeEventFile", async () => {
    await confirmDelete({ 2: target });
    expect(mocks.removeEventFile).toHaveBeenCalledTimes(1);
    expect(mocks.removeEventFile).toHaveBeenCalledWith(
      mocks.supabase,
      { id: "f-scan", storage_path: "evt-1/s.pdf", file_name: "Check_Scan.pdf" },
      { eventId: "evt-1", changedByUserUuid: "user-uuid-5" },
    );
  });

  it("passes a null author when the user id is not loaded", async () => {
    mocks.userUuid = null;
    await confirmDelete({ 2: target });
    expect(mocks.removeEventFile.mock.calls[0][2]).toEqual({
      eventId: "evt-1",
      changedByUserUuid: null,
    });
  });

  it("deletes nothing for a file with no storage path", async () => {
    await confirmDelete({ 2: { ...target, storagePath: null } });
    expect(mocks.removeEventFile).not.toHaveBeenCalled();
  });
});

// ── Open in a new tab, and Download that really downloads (spec 21, §1, §3 and §5) ──

/** The two handlers of the table, as `InvoiceFiles` hands them to `FilesTable`, and its rows. */
function tableHandlers() {
  const [element] = findAll(callComponent({}), (el) => el.type === FilesTable);
  return {
    rows: element.props.rows as ReturnType<typeof buildFileRows>,
    onOpen: element.props.onOpen as (row: unknown) => Promise<void>,
    onDownload: element.props.onDownload as (row: unknown) => Promise<void>,
  };
}

const SIGNED = "https://storage.example/signed?token=abc";

describe("InvoiceFiles: a click on the row opens the file in a new tab", () => {
  const fakeTab = () => ({
    opener: { stillThere: true } as unknown,
    location: { href: "about:blank" },
    close: vi.fn(),
  });

  it("opens a blank tab in the click itself and asks for the plain link in the same turn", async () => {
    const { rows, onOpen } = tableHandlers();
    const tab = fakeTab();
    const open = vi.fn(() => tab);
    vi.stubGlobal("window", { open });

    const pending = onOpen(rows[1]);
    // Before any await: a tab opened after one can be blocked by the browser.
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("", "_blank");
    // The same link as before, with no download flag: the browser shows what it can.
    expect(mocks.createEventFileUrl).toHaveBeenCalledTimes(1);
    expect(mocks.createEventFileUrl).toHaveBeenCalledWith(mocks.supabase, "evt-1/s.pdf");
    await pending;

    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe(SIGNED);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("opens a contracts/ file the same way, with its full storage path", async () => {
    const { rows, onOpen } = tableHandlers();
    vi.stubGlobal("window", { open: () => fakeTab() });
    await onOpen(rows[0]);
    expect(mocks.createEventFileUrl).toHaveBeenCalledWith(mocks.supabase, "contracts/evt-1/c.pdf");
  });

  it("closes the blank tab and shows the reason when the link cannot be made", async () => {
    const { rows, onOpen } = tableHandlers();
    const tab = fakeTab();
    vi.stubGlobal("window", { open: () => tab });
    mocks.createEventFileUrl.mockRejectedValueOnce({ message: "Object not found" });

    await onOpen(rows[1]);

    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe("about:blank");
    expect(mocks.toast).toHaveBeenCalledWith(["Could not open the file", "Object not found"]);
  });

  it("tells the user to allow pop-ups when the browser blocks the tab, and asks for no link", async () => {
    const { rows, onOpen } = tableHandlers();
    vi.stubGlobal("window", { open: () => null });

    await onOpen(rows[1]);

    expect(mocks.createEventFileUrl).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast.mock.calls[0][0].join(" ")).toMatch(/pop-?ups/i);
  });

  it("does nothing for a row with no storage path: no tab, no link, no toast", async () => {
    const { rows, onOpen } = tableHandlers();
    const open = vi.fn(() => fakeTab());
    vi.stubGlobal("window", { open });

    await onOpen({ ...rows[1], storagePath: null });

    expect(open).not.toHaveBeenCalled();
    expect(mocks.createEventFileUrl).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

describe("InvoiceFiles: Download really downloads", () => {
  /** An anchor like the browser's, minus the `download` attribute, which must never be set. */
  const stubAnchor = () => {
    const anchor = { href: "", click: vi.fn() };
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
    return anchor;
  };

  it("asks for the link with the storage download flag and the file's name", async () => {
    const { rows, onDownload } = tableHandlers();
    stubAnchor();

    await onDownload(rows[1]);

    expect(mocks.createEventFileUrl).toHaveBeenCalledTimes(1);
    expect(mocks.createEventFileUrl).toHaveBeenCalledWith(mocks.supabase, "evt-1/s.pdf", {
      download: "Check_Scan.pdf",
    });
  });

  it("asks for the bare flag when the file has no name", async () => {
    const { rows, onDownload } = tableHandlers();
    stubAnchor();

    await onDownload({ ...rows[1], name: "" });

    expect(mocks.createEventFileUrl).toHaveBeenCalledWith(mocks.supabase, "evt-1/s.pdf", {
      download: true,
    });
  });

  it("clicks a temporary anchor on the signed link, with no download attribute (the header does the work)", async () => {
    const { rows, onDownload } = tableHandlers();
    const anchor = stubAnchor();

    await onDownload(rows[1]);

    expect(anchor.href).toBe(SIGNED);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor).not.toHaveProperty("download");
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("opens no tab", async () => {
    const { rows, onDownload } = tableHandlers();
    stubAnchor();
    const open = vi.fn();
    vi.stubGlobal("window", { open });

    await onDownload(rows[1]);

    expect(open).not.toHaveBeenCalled();
  });

  it("shows the Download failed toast, and clicks nothing, when the link cannot be made", async () => {
    const { rows, onDownload } = tableHandlers();
    const anchor = stubAnchor();
    mocks.createEventFileUrl.mockRejectedValueOnce(new Error("Object not found"));

    await onDownload(rows[1]);

    expect(anchor.click).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(["Download failed", "Object not found"]);
  });

  it("asks for nothing for a row with no storage path", async () => {
    const { rows, onDownload } = tableHandlers();
    const anchor = stubAnchor();

    await onDownload({ ...rows[1], storagePath: null });

    expect(mocks.createEventFileUrl).not.toHaveBeenCalled();
    expect(anchor.click).not.toHaveBeenCalled();
  });
});
