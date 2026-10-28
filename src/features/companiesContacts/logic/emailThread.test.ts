import { describe, expect, it } from "vitest";
import { messageIdsIn, selectThread, threadRoot, type ThreadRow } from "./emailThread";

const row = (over: Partial<ThreadRow> & { id: string }): ThreadRow => ({
  mailbox: "paul@co.com",
  google_message_id: null,
  google_thread_id: `thread-${over.id}`,
  google_in_reply_to: null,
  google_references: null,
  from_address: "Pat <pat@xyz.com>",
  to_addresses: "paul@co.com",
  cc_addresses: null,
  subject: "Quote",
  date: null,
  snippet: "",
  direction: "received",
  ...over,
});

const ids = (rows: ThreadRow[]) => rows.map((r) => r.id);

describe("messageIdsIn", () => {
  it("lists the Message-IDs in a header, lowercased, in order", () => {
    expect(messageIdsIn("<A@x.com>\n <b@x.com> <C@x.com>")).toEqual([
      "<a@x.com>",
      "<b@x.com>",
      "<c@x.com>",
    ]);
  });

  it("reads a lone ID that has no angle brackets, and nothing from an empty header", () => {
    expect(messageIdsIn("  abc@x.com ")).toEqual(["abc@x.com"]);
    expect(messageIdsIn("   ")).toEqual([]);
    expect(messageIdsIn(null)).toEqual([]);
  });
});

describe("threadRoot", () => {
  it("is the first ID in References, the email that started the thread", () => {
    expect(
      threadRoot({
        google_message_id: "<c@x>",
        google_in_reply_to: "<b@x>",
        google_references: "<a@x> <b@x>",
      }),
    ).toBe("<a@x>");
  });

  it("falls back to In-Reply-To, then to the email's own ID", () => {
    expect(
      threadRoot({
        google_message_id: "<b@x>",
        google_in_reply_to: "<a@x>",
        google_references: null,
      }),
    ).toBe("<a@x>");
    expect(
      threadRoot({ google_message_id: "<A@x>", google_in_reply_to: null, google_references: null }),
    ).toBe("<a@x>");
  });

  it("is null when the email has none of them", () => {
    expect(
      threadRoot({ google_message_id: null, google_in_reply_to: null, google_references: null }),
    ).toBeNull();
  });
});

describe("selectThread", () => {
  const first = row({ id: "r1", google_message_id: "<a@x>", date: "2026-10-26T09:00:00.000Z" });
  const second = row({
    id: "r2",
    google_message_id: "<b@x>",
    google_in_reply_to: "<a@x>",
    google_references: "<a@x>",
    date: "2026-10-26T10:00:00.000Z",
  });
  const third = row({
    id: "r3",
    google_message_id: "<c@x>",
    google_in_reply_to: "<b@x>",
    google_references: "<a@x> <b@x>",
    date: "2026-10-26T11:00:00.000Z",
  });
  const stranger = row({
    id: "r9",
    google_message_id: "<z@x>",
    google_references: "<y@x>",
    date: "2026-10-26T10:30:00.000Z",
  });

  it("returns the whole thread, oldest first, whichever message is opened", () => {
    const all = [third, stranger, first, second];

    expect(ids(selectThread("r3", all))).toEqual(["r1", "r2", "r3"]);
    expect(ids(selectThread("r1", all))).toEqual(["r1", "r2", "r3"]); // later replies too
  });

  it("shows an email that is a thread of one on its own", () => {
    expect(ids(selectThread("r9", [first, second, stranger]))).toEqual(["r9"]);
  });

  it("counts an email that sits in two mailboxes once, keeping the copy that was opened", () => {
    const copyInOtherMailbox = { ...second, id: "r2b", mailbox: "josh@co.com" };

    expect(ids(selectThread("r2b", [first, second, copyInOtherMailbox]))).toEqual(["r1", "r2b"]);
    expect(ids(selectThread("r1", [first, second, copyInOtherMailbox]))).toEqual(["r1", "r2"]);
  });

  it("matches IDs whatever their case", () => {
    const shouting = { ...second, google_references: "<A@X>" };

    expect(ids(selectThread("r1", [first, shouting]))).toEqual(["r1", "r2"]);
  });

  it("groups emails saved before the headers were kept by their Gmail thread, in the same mailbox", () => {
    const old1 = row({ id: "o1", google_thread_id: "T", date: "2026-10-01T09:00:00.000Z" });
    const old2 = row({ id: "o2", google_thread_id: "T", date: "2026-10-01T10:00:00.000Z" });
    const sameIdOtherMailbox = row({ id: "o3", google_thread_id: "T", mailbox: "josh@co.com" });

    expect(ids(selectThread("o2", [old2, sameIdOtherMailbox, old1]))).toEqual(["o1", "o2"]);
  });

  it("always includes the opened email, and puts emails with no date first, then by id", () => {
    const undated = row({ id: "b", google_message_id: "<q@x>" });
    const alsoUndated = row({ id: "a", google_message_id: "<q@x>", google_thread_id: "same" });
    const dated = row({
      id: "c",
      google_message_id: "<r@x>",
      google_references: "<q@x>",
      date: "2026-10-26T09:00:00.000Z",
    });

    // Same Message-ID in the same mailbox twice: one is kept, and it is the one opened.
    expect(ids(selectThread("b", [dated, alsoUndated, undated]))).toEqual(["b", "c"]);
    expect(ids(selectThread("zzz", [first]))).toEqual([]); // not saved: nothing to show
  });
});
