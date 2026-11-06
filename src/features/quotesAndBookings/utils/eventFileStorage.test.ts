import { describe, expect, it, vi } from "vitest";
import { createEventFileUrl, eventFileLocation, removeEventFile } from "./eventFileStorage";

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
  const file = { id: "file-1", storage_path: "evt-1/abc.pdf" };

  it("removes the stored object, then the row", async () => {
    const { client, calls, removeObjects, eq } = fakeClient();
    await removeEventFile(client, file);
    expect(calls).toEqual(["bucket:event-files", "remove", "delete:EventFiles"]);
    expect(removeObjects).toHaveBeenCalledWith(["evt-1/abc.pdf"]);
    expect(eq).toHaveBeenCalledWith("id", "file-1");
  });

  it("takes a contracts/ object from the contracts bucket", async () => {
    const { client, calls, removeObjects } = fakeClient();
    await removeEventFile(client, { id: "file-2", storage_path: "contracts/x/y.pdf" });
    expect(calls[0]).toBe("bucket:contracts");
    expect(removeObjects).toHaveBeenCalledWith(["x/y.pdf"]);
  });

  it("throws the error of the row delete", async () => {
    const boom = { message: "permission denied" };
    const { client } = fakeClient({ rowDelete: { error: boom } });
    await expect(removeEventFile(client, file)).rejects.toBe(boom);
  });

  // As the quote card has always done (the user's answer to the contradiction in spec 13): the
  // storage answer is not read, the row is deleted whatever it says.
  it("does not stop at a storage error: the row is still deleted", async () => {
    const { client, calls, eq } = fakeClient({ remove: { error: new Error("storage down") } });
    await expect(removeEventFile(client, file)).resolves.toBeUndefined();
    expect(calls).toContain("delete:EventFiles");
    expect(eq).toHaveBeenCalledWith("id", "file-1");
  });
});
