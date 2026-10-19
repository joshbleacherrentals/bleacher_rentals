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

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecute: (compiled: CompiledQuery) => {
    executed.push(compiled);
    return Promise.resolve();
  },
}));

import { logQuoteSentLocal } from "./logQuoteSentLocal";

beforeEach(() => {
  executed.length = 0;
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
});
