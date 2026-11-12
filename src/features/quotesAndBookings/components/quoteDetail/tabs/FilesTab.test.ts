import { beforeEach, describe, it, expect, vi } from "vitest";

// Spec: docs/specs/event-change-log-02-file-upload-delete.md §3 and §5 (A1). The first part of this
// file re-implements the tab's pure helpers; the last part calls `FilesTab` itself, because the
// Log rows of an upload and of a delete are written by the helpers it calls and the tab has to hand
// them the event, the user's Users.id and the file's name. The project has no DOM environment and no
// testing-library, and `renderToStaticMarkup` cannot press a button, so the component is called as a
// function with stubbed hooks and its handlers are taken from the element tree.
type HookStubs = Partial<
  Record<"useState" | "useMemo" | "useRef" | "useCallback" | "useEffect", unknown>
>;

const mocks = vi.hoisted(() => ({
  supabase: {} as object,
  /** `Users.id` of the signed-in user, as `usePermissionsStore` holds it. */
  userUuid: "user-uuid-5" as string | null,
  uploadEventFile: vi.fn(),
  removeEventFile: vi.fn(),
  /** While set, the component's hooks are these stubs (see `callComponent`); otherwise the real ones. */
  hooks: null as HookStubs | null,
}));

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
    useCallback: hook("useCallback"),
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
  useTypedQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "user_clerk_7" }) }));
vi.mock("@/utils/supabase/useClerkSupabaseClient", () => ({
  useClerkSupabaseClient: () => mocks.supabase,
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (select: (s: { userId: string | null }) => unknown) =>
    select({ userId: mocks.userUuid }),
}));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));
vi.mock("../../../utils/eventFileUpload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../utils/eventFileUpload")>()),
  uploadEventFile: (p: unknown) => mocks.uploadEventFile(p),
}));
vi.mock("../../../utils/eventFileStorage", () => ({
  createEventFileUrl: vi.fn(),
  removeEventFile: (...args: unknown[]) => mocks.removeEventFile(...args),
}));

import { AlertDialogAction } from "@/components/ui/alert-dialog";
import { FilesTab } from "./FilesTab";

// Re-implement pure helpers from FilesTab for unit testing
// (they're module-scoped, so we test the logic directly)

const IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];

const ACCEPTED_TYPES = [
  ...IMAGE_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

const MAX_SIZE_MB = 20;

const isImageType = (mime: string | null) => !!mime && IMAGE_TYPES.includes(mime);

const isImagePath = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "heic", "heif", "webp"].includes(ext);
};

const formatBytes = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const sourceLabel = (source: string | null) => {
  switch (source) {
    case "sent_quote":
      return "Sent Quote PDF";
    case "signed_contract":
      return "Signed Contract";
    case "upload":
    default:
      return "Upload";
  }
};

describe("isImageType", () => {
  it("returns true for image MIME types", () => {
    expect(isImageType("image/jpeg")).toBe(true);
    expect(isImageType("image/png")).toBe(true);
    expect(isImageType("image/webp")).toBe(true);
    expect(isImageType("image/heic")).toBe(true);
  });

  it("returns false for non-image MIME types", () => {
    expect(isImageType("application/pdf")).toBe(false);
    expect(isImageType("text/csv")).toBe(false);
    expect(isImageType(null)).toBe(false);
  });
});

describe("isImagePath", () => {
  it("detects image extensions", () => {
    expect(isImagePath("event-id/abc.jpg")).toBe(true);
    expect(isImagePath("event-id/abc.jpeg")).toBe(true);
    expect(isImagePath("event-id/abc.png")).toBe(true);
    expect(isImagePath("event-id/abc.webp")).toBe(true);
    expect(isImagePath("event-id/abc.HEIF")).toBe(true); // toLowerCase handles uppercase
    expect(isImagePath("event-id/abc.heif")).toBe(true);
  });

  it("rejects non-image extensions", () => {
    expect(isImagePath("event-id/abc.pdf")).toBe(false);
    expect(isImagePath("event-id/abc.docx")).toBe(false);
    expect(isImagePath("event-id/abc.csv")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("returns dash for null/zero", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(0)).toBe("—");
  });

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(5242880)).toBe("5.0 MB");
  });
});

describe("sourceLabel", () => {
  it("maps source values to human labels", () => {
    expect(sourceLabel("upload")).toBe("Upload");
    expect(sourceLabel("sent_quote")).toBe("Sent Quote PDF");
    expect(sourceLabel("signed_contract")).toBe("Signed Contract");
  });

  it("defaults to Upload for null or unknown", () => {
    expect(sourceLabel(null)).toBe("Upload");
    expect(sourceLabel("something_else")).toBe("Upload");
  });
});

describe("ACCEPTED_TYPES", () => {
  it("includes all expected MIME types", () => {
    expect(ACCEPTED_TYPES).toContain("application/pdf");
    expect(ACCEPTED_TYPES).toContain("image/jpeg");
    expect(ACCEPTED_TYPES).toContain("text/csv");
    expect(ACCEPTED_TYPES).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("does not include disallowed types", () => {
    expect(ACCEPTED_TYPES).not.toContain("application/zip");
    expect(ACCEPTED_TYPES).not.toContain("video/mp4");
    expect(ACCEPTED_TYPES).not.toContain("application/javascript");
  });
});

describe("MAX_SIZE_MB", () => {
  it("is 20MB", () => {
    expect(MAX_SIZE_MB).toBe(20);
  });
});

// ── The Log row of an upload and of a delete (spec 02, §3 and §5, A1) ──

/** Every element of the tree that `matches`, without rendering any child component. */
function findAll(node: unknown, matches: (el: any) => boolean): any[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, matches));
  if (!node || typeof node !== "object") return [];
  const el = node as { props?: { children?: unknown } };
  return [...(matches(el) ? [el] : []), ...findAll(el.props?.children, matches)];
}

function textOf(node: unknown): string {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node && typeof node === "object") return textOf((node as any).props?.children);
  return "";
}

/**
 * Calls `FilesTab` as a function with its hooks stubbed: `useState` returns the given values by the
 * order of the component's `useState` calls (0 staged, 1 saving, 2 dragging, 3 deleteTarget,
 * 4 deleting, 5 lightboxUrl), and its setters do nothing.
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
    useCallback: (fn: unknown) => fn,
    useEffect: () => undefined,
  };
  try {
    return FilesTab({ quoteId: "evt-1" });
  } finally {
    mocks.hooks = null;
  }
}

const pdf = (name: string) => new File(["x"], name, { type: "application/pdf" });

beforeEach(() => {
  mocks.userUuid = "user-uuid-5";
  mocks.uploadEventFile.mockReset();
  mocks.uploadEventFile.mockResolvedValue("new-file-id");
  mocks.removeEventFile.mockReset();
  mocks.removeEventFile.mockResolvedValue(undefined);
});

describe("FilesTab: Save writes the Log row through uploadEventFile", () => {
  const save = (state: Record<number, unknown>) => {
    const [button] = findAll(
      callComponent(state),
      (el) => el.type === "button" && textOf(el).trim() === "Save",
    );
    return button.props.onClick() as Promise<void>;
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
  });

  it("passes a null author when the user id is not loaded", async () => {
    mocks.userUuid = null;
    await save({ 0: [{ id: "s-1", file: pdf("a.pdf") }] });
    expect(mocks.uploadEventFile.mock.calls[0][0].changedByUserUuid).toBeNull();
  });
});

describe("FilesTab: Delete writes the Log row through removeEventFile", () => {
  const target = {
    id: "f-scan",
    event_uuid: "evt-1",
    file_name: "Check_Scan.pdf",
    storage_path: "evt-1/s.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 1,
    source: "upload",
    uploaded_by: "user_clerk_7",
    created_at: "2026-10-22T16:00:00.000Z",
  };
  const confirmDelete = (state: Record<number, unknown>) => {
    const [action] = findAll(callComponent(state), (el) => el.type === AlertDialogAction);
    return action.props.onClick() as Promise<void>;
  };

  it("hands the file, with its name, and the quote and the user's Users.id to removeEventFile", async () => {
    await confirmDelete({ 3: target });
    expect(mocks.removeEventFile).toHaveBeenCalledTimes(1);
    expect(mocks.removeEventFile).toHaveBeenCalledWith(
      mocks.supabase,
      { id: "f-scan", storage_path: "evt-1/s.pdf", file_name: "Check_Scan.pdf" },
      { eventId: "evt-1", changedByUserUuid: "user-uuid-5" },
    );
  });

  it("passes a null author when the user id is not loaded", async () => {
    mocks.userUuid = null;
    await confirmDelete({ 3: target });
    expect(mocks.removeEventFile.mock.calls[0][2]).toEqual({
      eventId: "evt-1",
      changedByUserUuid: null,
    });
  });

  it("deletes nothing for a file with no storage path", async () => {
    await confirmDelete({ 3: { ...target, storage_path: null } });
    expect(mocks.removeEventFile).not.toHaveBeenCalled();
  });
});
