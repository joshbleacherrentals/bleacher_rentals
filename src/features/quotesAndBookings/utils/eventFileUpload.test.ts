import { describe, it, expect, vi } from "vitest";
import { errorMessage, fileRefusal, uploadEventFile, EVENT_FILES_BUCKET } from "./eventFileUpload";

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
