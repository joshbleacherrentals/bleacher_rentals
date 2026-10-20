import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

const executed: CompiledQuery[] = [];
let failOn: ((q: CompiledQuery) => boolean) | null = null;

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecute: (compiled: CompiledQuery) => {
    if (failOn?.(compiled)) return Promise.reject(new Error("insert failed"));
    executed.push(compiled);
    return Promise.resolve();
  },
}));

import { logQuoteSentLocal } from "./logQuoteSentLocal";

beforeEach(() => {
  executed.length = 0;
  failOn = null;
});

describe("logQuoteSentLocal", () => {
  it("inserts a 'send' EventChangeLog row for the current user", async () => {
    await logQuoteSentLocal({
      eventId: "event-1",
      recipients: { to: ["a@x.com", "b@x.com"], cc: ["c@x.com"], bcc: [] },
      currentUserUuid: "user-9",
    });

    expect(executed).toHaveLength(1);
    const { sql, parameters } = executed[0];
    expect(sql).toContain('insert into "EventChangeLog"');
    expect(parameters).toContain("event-1");
    expect(parameters).toContain("user-9"); // changed_by_user_uuid = sender
    expect(parameters).toContain("email_sent"); // field_name
    expect(parameters).toContain("send"); // action_type
    expect(parameters).toContain("To: a@x.com, b@x.com; Cc: c@x.com"); // next_value
  });

  it("allows a null current user uuid", async () => {
    await logQuoteSentLocal({
      eventId: "event-2",
      recipients: { to: ["c@x.com"], cc: [], bcc: [] },
      currentUserUuid: null,
    });
    expect(executed).toHaveLength(1);
    expect(executed[0].parameters).toContain(null);
  });

  it("writes the 'file_add' rows first in dialog order, then the email line last", async () => {
    await logQuoteSentLocal({
      eventId: "event-3",
      recipients: { to: ["a@x.com"], cc: [], bcc: [] },
      currentUserUuid: "user-9",
      addedFiles: [{ name: "site plan.pdf" }, { name: "photo.jpg" }],
    });
    expect(executed).toHaveLength(3);
    expect(executed[0].parameters).toEqual(
      expect.arrayContaining(["event-3", "user-9", "file", "site plan.pdf", "file_add"]),
    );
    expect(executed[1].parameters).toContain("photo.jpg");
    expect(executed[2].parameters).toContain("email_sent");
  });

  it("gives every row a strictly increasing changed_at, email line newest", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000); // same ms for all rows
    await logQuoteSentLocal({
      eventId: "event-5",
      recipients: { to: ["a@x.com"], cc: [], bcc: [] },
      currentUserUuid: "user-9",
      addedFiles: [{ name: "a.pdf" }, { name: "b.pdf" }],
    });
    const times = executed.map((q) =>
      q.parameters.find((p) => typeof p === "string" && /^\d{4}-\d{2}-\d{2}T/.test(p)),
    ) as string[];
    expect(times).toHaveLength(3);
    expect(Date.parse(times[0])).toBeLessThan(Date.parse(times[1]));
    expect(Date.parse(times[1])).toBeLessThan(Date.parse(times[2]));
    vi.restoreAllMocks();
  });

  it("keeps going when one file row fails: other files and the email row are still written", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    failOn = (q) => q.parameters.includes("bad.pdf");
    await logQuoteSentLocal({
      eventId: "event-6",
      recipients: { to: ["a@x.com"], cc: [], bcc: [] },
      currentUserUuid: "user-9",
      addedFiles: [{ name: "bad.pdf" }, { name: "good.pdf" }],
    });
    expect(executed).toHaveLength(2);
    expect(executed[0].parameters).toContain("good.pdf");
    expect(executed[1].parameters).toContain("email_sent");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("writes only the email line when no file was added", async () => {
    await logQuoteSentLocal({
      eventId: "event-4",
      recipients: { to: ["a@x.com"], cc: [], bcc: [] },
      currentUserUuid: "user-9",
      addedFiles: [],
    });
    expect(executed).toHaveLength(1);
  });
});
