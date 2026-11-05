import { beforeEach, describe, expect, it, vi } from "vitest";

// Spec: docs/specs/event-change-log-02-file-upload-delete.md §3 and §5 (A1). The Log row of a delete
// is written by `logFileDeleted` once the EventFiles row is gone; here it and the toast are captured.
const mocks = vi.hoisted(() => ({ logFileDeleted: vi.fn(), toast: vi.fn() }));

vi.mock("../db/logEventFile", () => ({
  logFileDeleted: (p: unknown) => mocks.logFileDeleted(p),
}));
vi.mock("@/components/toasts/ErrorToast", () => ({
  createErrorToastNoThrow: (lines: string[]) => mocks.toast(lines),
}));

import { createEventFileUrl, eventFileLocation, removeEventFile } from "./eventFileStorage";

beforeEach(() => {
  mocks.logFileDeleted.mockReset();
  mocks.logFileDeleted.mockResolvedValue(undefined);
  mocks.toast.mockReset();
});

// Spec: docs/specs/accountant-collections-13-task-history-and-files.md §3 and §5. The three
// storage steps of the quote card's Files tab, now shared with the invoice page.

type Answer = { error: unknown };

/** A Supabase client that records which bucket each call went to and in what order. */
function fakeClient({
  signed = { data: { signedUrl: "https://signed.example/file" }, error: null },
  remove = { error: null } as Answer,
  rowDelete = { error: null } as Answer,
}: {
  signed?: { data: { signedUrl: string } | null; error: unknown };
  remove?: Answer;
  rowDelete?: Answer;
} = {}) {
  const calls: string[] = [];
  const createSignedUrl = vi.fn(async () => signed);
  const removeObjects = vi.fn(async () => remove);
  const eq = vi.fn(async () => rowDelete);
  const client = {
    storage: {
      from: vi.fn((bucket: string) => {
        calls.push(`bucket:${bucket}`);
        return {
          createSignedUrl: (...args: unknown[]) => {
            calls.push("signed");
            return (createSignedUrl as (...a: unknown[]) => unknown)(...args);
          },
          remove: (...args: unknown[]) => {
            calls.push("remove");
            return (removeObjects as (...a: unknown[]) => unknown)(...args);
          },
        };
      }),
    },
    from: vi.fn((table: string) => ({
      delete: () => {
        calls.push(`delete:${table}`);
        return { eq };
      },
    })),
  };
  return { client: client as never, calls, createSignedUrl, removeObjects, eq };
}

describe("eventFileLocation", () => {
  it("sends a contracts/ path to the contracts bucket, without the prefix", () => {
    expect(eventFileLocation("contracts/x/y.pdf")).toEqual({
      bucket: "contracts",
      path: "x/y.pdf",
    });
  });

  it("sends any other path to event-files, unchanged", () => {
    expect(eventFileLocation("evt-1/abc.png")).toEqual({
      bucket: "event-files",
      path: "evt-1/abc.png",
    });
  });

  it("looks only at the start of the path", () => {
    expect(eventFileLocation("evt-1/contracts/y.pdf").bucket).toBe("event-files");
    expect(eventFileLocation("contractsx/y.pdf").bucket).toBe("event-files");
  });
});

describe("createEventFileUrl", () => {
  it("asks the right bucket for a link that lives 3600 seconds", async () => {
    const { client, calls, createSignedUrl } = fakeClient();
    const url = await createEventFileUrl(client, "contracts/x/y.pdf");
    expect(url).toBe("https://signed.example/file");
    expect(calls).toEqual(["bucket:contracts", "signed"]);
    expect(createSignedUrl).toHaveBeenCalledWith("x/y.pdf", 3600);
  });

  it("uses event-files for an ordinary path", async () => {
    const { client, calls, createSignedUrl } = fakeClient();
    await createEventFileUrl(client, "evt-1/abc.pdf");
    expect(calls).toEqual(["bucket:event-files", "signed"]);
    expect(createSignedUrl).toHaveBeenCalledWith("evt-1/abc.pdf", 3600);
  });

  it("throws the storage error", async () => {
    const boom = new Error("Object not found");
    const { client } = fakeClient({ signed: { data: null, error: boom } });
    await expect(createEventFileUrl(client, "evt-1/abc.pdf")).rejects.toBe(boom);
  });
});

describe("removeEventFile", () => {
  const file = { id: "file-1", storage_path: "evt-1/abc.pdf", file_name: "abc.pdf" };
  const log = { eventId: "evt-1", changedByUserUuid: "user-9" };

  it("removes the stored object, then the row", async () => {
    const { client, calls, removeObjects, eq } = fakeClient();
    await removeEventFile(client, file, log);
    expect(calls).toEqual(["bucket:event-files", "remove", "delete:EventFiles"]);
    expect(removeObjects).toHaveBeenCalledWith(["evt-1/abc.pdf"]);
    expect(eq).toHaveBeenCalledWith("id", "file-1");
  });

  it("takes a contracts/ object from the contracts bucket", async () => {
    const { client, calls, removeObjects } = fakeClient();
    await removeEventFile(
      client,
      { id: "file-2", storage_path: "contracts/x/y.pdf", file_name: "y.pdf" },
      log,
    );
    expect(calls[0]).toBe("bucket:contracts");
    expect(removeObjects).toHaveBeenCalledWith(["x/y.pdf"]);
  });

  it("throws the error of the row delete", async () => {
    const boom = { message: "permission denied" };
    const { client } = fakeClient({ rowDelete: { error: boom } });
    await expect(removeEventFile(client, file, log)).rejects.toBe(boom);
  });

  // As the quote card has always done (the user's answer to the contradiction in spec 13): the
  // storage answer is not read, the row is deleted whatever it says.
  it("does not stop at a storage error: the row is still deleted", async () => {
    const { client, calls, eq } = fakeClient({ remove: { error: new Error("storage down") } });
    await expect(removeEventFile(client, file, log)).resolves.toBeUndefined();
    expect(calls).toContain("delete:EventFiles");
    expect(eq).toHaveBeenCalledWith("id", "file-1");
  });

  // ── The Log row (spec 02, R2, R4, A1) ──
  describe("the Log row", () => {
    it("R2: writes one row, with the given event, the file's name and the author, after the row delete", async () => {
      const { client, calls } = fakeClient();
      mocks.logFileDeleted.mockImplementation(async () => {
        calls.push("log");
      });

      await removeEventFile(client, file, log);

      expect(mocks.logFileDeleted).toHaveBeenCalledTimes(1);
      expect(mocks.logFileDeleted).toHaveBeenCalledWith({
        eventId: "evt-1",
        fileName: "abc.pdf",
        changedByUserUuid: "user-9",
      });
      expect(calls).toEqual(["bucket:event-files", "remove", "delete:EventFiles", "log"]);
    });

    it("A1: the event id comes from the third parameter, not from the file", async () => {
      const { client } = fakeClient();
      await removeEventFile(client, file, { eventId: "another-event", changedByUserUuid: null });
      expect(mocks.logFileDeleted).toHaveBeenCalledWith({
        eventId: "another-event",
        fileName: "abc.pdf",
        changedByUserUuid: null,
      });
    });

    it("writes no row when the row delete throws", async () => {
      const { client } = fakeClient({ rowDelete: { error: { message: "permission denied" } } });
      await expect(removeEventFile(client, file, log)).rejects.toBeDefined();
      expect(mocks.logFileDeleted).not.toHaveBeenCalled();
    });

    it("still writes the row when the storage step failed, because the row is what the user sees go", async () => {
      const { client } = fakeClient({ remove: { error: new Error("storage down") } });
      await removeEventFile(client, file, log);
      expect(mocks.logFileDeleted).toHaveBeenCalledTimes(1);
    });

    it("R4: a failing Log write does not throw and shows the toast", async () => {
      const { client, calls } = fakeClient();
      mocks.logFileDeleted.mockRejectedValueOnce(new Error("local db closed"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(removeEventFile(client, file, log)).resolves.toBeUndefined();

      expect(calls).toContain("delete:EventFiles");
      expect(mocks.toast).toHaveBeenCalledTimes(1);
      expect(mocks.toast).toHaveBeenCalledWith([
        "The file was deleted, but its Log row could not be written",
      ]);
      expect(errors).toHaveBeenCalled();
      errors.mockRestore();
    });

    it("shows no toast when the row is written", async () => {
      const { client } = fakeClient();
      await removeEventFile(client, file, log);
      expect(mocks.toast).not.toHaveBeenCalled();
    });
  });
});
