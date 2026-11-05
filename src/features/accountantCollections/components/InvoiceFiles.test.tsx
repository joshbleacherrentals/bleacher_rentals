import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/accountant-collections-13-task-history-and-files.md §1, §3, §5 and §7. Static
// markup: the query it asks, the section, the table, the staged list. What storage does is tested
// with `eventFileStorage.test.ts` and `eventFileUpload.test.ts`.

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
  createEventFileUrl: vi.fn(),
  removeEventFile: (...args: unknown[]) => mocks.removeEventFile(...args),
}));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToastNoThrow: vi.fn() }));

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

  it("writes the file name as plain text: no link, and no name inside a button", () => {
    const html = table();
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).toMatch(/<span[^>]*>Signed_Contract\.pdf<\/span>/);
    for (const [, inner] of html.matchAll(/<button[^>]*>([^]*?)<\/button>/g)) {
      expect(inner).not.toContain("Signed_Contract.pdf");
      expect(inner).not.toContain("Check_Scan.pdf");
    }
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
