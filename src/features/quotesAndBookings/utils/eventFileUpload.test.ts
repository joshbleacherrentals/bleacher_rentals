import { describe, it, expect, vi } from "vitest";
import {
  errorMessage,
  fileRefusal,
  uploadEventFile,
  uploadEventFileObject,
  removeUnrecordedEventFileObjects,
  isOwnEventFilePath,
  EVENT_FILES_BUCKET,
} from "./eventFileUpload";

describe("fileRefusal", () => {
  it("accepts a PDF under the limit", () => {
    expect(fileRefusal({ type: "application/pdf", size: 1000 })).toBeNull();
  });
  it("refuses an unknown type", () => {
    expect(fileRefusal({ type: "application/x-msdownload", size: 10 })?.title).toBe(
      "Invalid file type",
    );
  });
  it("refuses a file over 20 MB", () => {
    expect(fileRefusal({ type: "application/pdf", size: 21 * 1024 * 1024 })?.title).toBe(
      "File too large",
    );
    expect(fileRefusal({ type: "application/pdf", size: 20 * 1024 * 1024 })).toBeNull();
  });
});

describe("uploadEventFile", () => {
  const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
  function fakeSupabase(over: { upload?: unknown; insert?: unknown } = {}) {
    const upload = vi.fn(async () => over.upload ?? { error: null });
    const remove = vi.fn(async () => ({ error: null }));
    const insert = vi.fn(async () => over.insert ?? { error: null });
    const supabase = {
      storage: { from: vi.fn(() => ({ upload, remove })) },
      from: vi.fn(() => ({ insert })),
    };
    return { supabase: supabase as any, upload, insert, remove };
  }

  it("uploads to event-files, inserts the row with the given source, and returns its id", async () => {
    const { supabase, upload, insert } = fakeSupabase();
    const id = await uploadEventFile({
      supabase,
      eventId: "ev1",
      file,
      source: "email_attachment",
      uploadedBy: "user_1",
    });
    expect(supabase.storage.from).toHaveBeenCalledWith(EVENT_FILES_BUCKET);
    expect((upload.mock.calls[0] as any[])[0]).toMatch(/^ev1\/[0-9a-f-]+\.pdf$/);
    const row = (insert.mock.calls[0] as any[])[0];
    expect(row).toMatchObject({
      id,
      event_uuid: "ev1",
      file_name: "doc.pdf",
      mime_type: "application/pdf",
      file_size_bytes: 1,
      source: "email_attachment",
      uploaded_by: "user_1",
    });
  });

  it("throws on a storage error and inserts no row", async () => {
    const { supabase, insert } = fakeSupabase({ upload: { error: new Error("full") } });
    await expect(
      uploadEventFile({ supabase, eventId: "ev1", file, source: "upload", uploadedBy: null }),
    ).rejects.toThrow("full");
    expect(insert).not.toHaveBeenCalled();
  });

  it("throws on an insert error and removes the orphaned storage object", async () => {
    const { supabase, upload, remove } = fakeSupabase({ insert: { error: new Error("rls") } });
    await expect(
      uploadEventFile({ supabase, eventId: "ev1", file, source: "upload", uploadedBy: null }),
    ).rejects.toThrow("rls");
    const stored = (upload.mock.calls[0] as any[])[0];
    expect(remove).toHaveBeenCalledWith([stored]);
  });

  it("still reports the insert error when removing the orphan fails too", async () => {
    const { supabase, remove } = fakeSupabase({ insert: { error: new Error("rls") } });
    remove.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      uploadEventFile({ supabase, eventId: "ev1", file, source: "upload", uploadedBy: null }),
    ).rejects.toThrow("rls");
  });

  it("turns a PostgrestError-like object into an Error that keeps its message", async () => {
    const { supabase } = fakeSupabase({
      insert: { error: { message: "row violates policy", code: "42501" } },
    });
    await expect(
      uploadEventFile({ supabase, eventId: "ev1", file, source: "upload", uploadedBy: null }),
    ).rejects.toThrow("row violates policy");
  });
});

describe("errorMessage", () => {
  it("reads Error, string and message-bearing objects, else uses the fallback", () => {
    expect(errorMessage(new Error("a"))).toBe("a");
    expect(errorMessage("b")).toBe("b");
    expect(errorMessage({ message: "c", code: "1" })).toBe("c");
    expect(errorMessage({ code: "1" })).toBe("unknown error");
    expect(errorMessage(null, "x")).toBe("x");
  });
});

describe("isOwnEventFilePath", () => {
  const U = "11111111-1111-4111-8111-111111111111";
  it("accepts <event>/<uuid>.<ext> only", () => {
    expect(isOwnEventFilePath("ev1", `ev1/${U}.pdf`)).toBe(true);
    expect(isOwnEventFilePath("ev1", `ev1/${U}.bin`)).toBe(true);
  });
  it("rejects other events, traversal, nesting and other names", () => {
    for (const p of [
      `ev2/${U}.pdf`,
      `ev1/../ev2/${U}.pdf`,
      `ev1/..%2Fx.pdf`,
      `ev1/a/${U}.pdf`,
      `ev1/sent-quote-1.pdf`,
      `ev1/${U}`,
      `ev1/${U}.pdf/`,
      `ev1x/${U}.pdf`,
      `/ev1/${U}.pdf`,
      "",
    ]) {
      expect(isOwnEventFilePath("ev1", p)).toBe(false);
    }
    expect(isOwnEventFilePath("", `/${U}.pdf`)).toBe(false);
  });
});

describe("uploadEventFileObject", () => {
  const file = new File(["x"], "My Doc.PDF", { type: "application/pdf" });
  it("uploads under the event's folder, inserts no EventFiles row, returns the future row's data", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const from = vi.fn();
    const supabase = { storage: { from: vi.fn(() => ({ upload })) }, from } as any;
    const r = await uploadEventFileObject({ supabase, eventId: "ev1", file });
    expect(from).not.toHaveBeenCalled();
    expect(supabase.storage.from).toHaveBeenCalledWith(EVENT_FILES_BUCKET);
    expect(isOwnEventFilePath("ev1", r.storagePath)).toBe(true);
    expect(r.storagePath.endsWith(".pdf")).toBe(true);
    expect(r).toMatchObject({ name: "My Doc.PDF", mimeType: "application/pdf", sizeBytes: 1 });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("falls back to .bin for an odd extension, and throws on a storage error", async () => {
    const ok = { storage: { from: () => ({ upload: async () => ({ error: null }) }) } } as any;
    const r = await uploadEventFileObject({
      supabase: ok,
      eventId: "ev1",
      file: new File(["x"], "weird.p/d f", { type: "application/pdf" }),
    });
    expect(r.storagePath.endsWith(".bin")).toBe(true);
    const bad = {
      storage: { from: () => ({ upload: async () => ({ error: { message: "full" } }) }) },
    } as any;
    await expect(uploadEventFileObject({ supabase: bad, eventId: "ev1", file })).rejects.toThrow(
      "full",
    );
  });
});

describe("removeUnrecordedEventFileObjects", () => {
  function fake(rows: { id: string }[], selectError: unknown = null) {
    const remove = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: () => ({ select: () => ({ in: async () => ({ data: rows, error: selectError }) }) }),
      storage: { from: vi.fn(() => ({ remove })) },
    } as any;
    return { supabase, remove };
  }
  const files = [
    { id: "a", storagePath: "ev1/a.pdf" },
    { id: "b", storagePath: "ev1/b.pdf" },
  ];
  it("deletes the objects that have no EventFiles row and keeps recorded ones", async () => {
    const { supabase, remove } = fake([{ id: "b" }]);
    await removeUnrecordedEventFileObjects(supabase, files);
    expect(supabase.storage.from).toHaveBeenCalledWith(EVENT_FILES_BUCKET);
    expect(remove).toHaveBeenCalledWith(["ev1/a.pdf"]);
  });
  it("does nothing for an empty list and deletes nothing when the check fails", async () => {
    const { supabase, remove } = fake([], { message: "offline" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await removeUnrecordedEventFileObjects(supabase, []);
    await removeUnrecordedEventFileObjects(supabase, files);
    expect(remove).not.toHaveBeenCalled();
  });
});
