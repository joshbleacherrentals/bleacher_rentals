import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import type { PulledEmail } from "@/features/companiesContacts/logic/emailActivity";
import {
  checkOwnUnsentEmail,
  findEmailRow,
  recordFailedEmail,
  recordSentEmail,
  sentEmailColumns,
  type UnsentEmailRow,
} from "./unsentEmail";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };
type Call = { op: string; args: unknown[] };

/**
 * A stand-in for the Supabase client. Every query ends in one awaited result, taken in order from
 * `results`; every call on the way is recorded.
 */
function fakeAdmin(results: Result[]) {
  const calls: Call[] = [];
  const next = (): Result => results.shift() ?? { data: null, error: null };
  const chain: any = {};
  for (const op of ["select", "update", "delete", "eq"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(next());
  chain.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(next()).then(resolve, reject);
  const admin = {
    from: (table: string) => {
      calls.push({ op: "from", args: [table] });
      return chain;
    },
  } as unknown as SupabaseClient<any>;
  return { admin, calls };
}

const row = (over: Partial<UnsentEmailRow> = {}): UnsentEmailRow => ({
  id: "m-1",
  mailbox: "josh@bleacherrentals.com",
  direction: "sent",
  status: "sending",
  google_id: null,
  ...over,
});

const noSleep = async () => {};

const pulled: PulledEmail = {
  messageId: " <sent@mail.gmail.com> ",
  inReplyTo: "<b@x>",
  references: "<a@x> <b@x>",
  copies: [{ mailbox: "josh@bleacherrentals.com", id: "18c0ffee", threadId: "18c0beef" }],
  from: '"Josh Redgrift" <josh@bleacherrentals.com>',
  to: "pat@xyz.com",
  cc: null,
  subject: "Re: Quote",
  date: "Mon, 26 Oct 2026 10:00:00 -0600",
  internalDate: 1761494400000,
  snippet: "Sounds good.",
  direction: "sent",
};

describe("sentEmailColumns", () => {
  it("turns what Gmail says about the sent email into the columns of its row", () => {
    expect(sentEmailColumns(pulled)).toEqual({
      google_message_id: "<sent@mail.gmail.com>",
      google_id: "18c0ffee",
      google_thread_id: "18c0beef",
      google_in_reply_to: "<b@x>",
      google_references: "<a@x> <b@x>",
      from_address: '"Josh Redgrift" <josh@bleacherrentals.com>',
      to_addresses: "pat@xyz.com",
      cc_addresses: null,
      subject: "Re: Quote",
      date: new Date(1761494400000).toISOString(),
      snippet: "Sounds good.",
    });
  });
});

describe("checkOwnUnsentEmail", () => {
  it("has no complaint about the sender's own email still to be sent", () => {
    expect(checkOwnUnsentEmail(row(), "josh@bleacherrentals.com")).toBeNull();
    expect(
      checkOwnUnsentEmail(row({ mailbox: "Josh@BleacherRentals.com" }), "josh@bleacherrentals.com"),
    ).toBeNull();
  });

  it("refuses someone else's email, and one that was received", () => {
    expect(
      checkOwnUnsentEmail(row({ mailbox: "mike@bleacherrentals.com" }), "josh@bleacherrentals.com"),
    ).toMatch(/not yours/i);
    expect(checkOwnUnsentEmail(row({ direction: "received" }), "josh@bleacherrentals.com")).toMatch(
      /not yours/i,
    );
  });

  it("says so when the email was already sent, which is what stops a second send", () => {
    expect(checkOwnUnsentEmail(row({ status: "success" }), "josh@bleacherrentals.com")).toMatch(
      /already sent/i,
    );
    expect(checkOwnUnsentEmail(row({ google_id: "18c0ffee" }), "josh@bleacherrentals.com")).toMatch(
      /already sent/i,
    );
  });

  it("refuses a draft or a failed email, which must be sent again first", () => {
    for (const status of ["draft", "error"]) {
      expect(checkOwnUnsentEmail(row({ status }), "josh@bleacherrentals.com"), status).toMatch(
        /not waiting/i,
      );
    }
  });
});

describe("findEmailRow", () => {
  it("returns the row", async () => {
    const { admin, calls } = fakeAdmin([{ data: row() }]);

    expect(await findEmailRow(admin, "m-1")).toEqual(row());
    expect(calls).toContainEqual({ op: "from", args: ["EmailMessages"] });
    expect(calls).toContainEqual({ op: "eq", args: ["id", "m-1"] });
  });

  it("does not wait unless asked to", async () => {
    const { admin } = fakeAdmin([{ data: null }]);
    const sleep = vi.fn(noSleep);

    expect(await findEmailRow(admin, "m-1", undefined, sleep)).toBeNull();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("looks again until the page's upload has landed", async () => {
    const { admin } = fakeAdmin([{ data: null }, { data: null }, { data: row() }]);
    const sleep = vi.fn(noSleep);

    const found = await findEmailRow(admin, "m-1", { totalMs: 900, everyMs: 300 }, sleep);

    expect(found).toEqual(row());
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(300);
  });

  it("gives up once the time is up", async () => {
    const { admin } = fakeAdmin([]);
    const sleep = vi.fn(noSleep);

    expect(await findEmailRow(admin, "m-1", { totalMs: 900, everyMs: 300 }, sleep)).toBeNull();
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("throws when the database fails", async () => {
    const { admin } = fakeAdmin([{ error: { message: "connection lost" } }]);

    await expect(findEmailRow(admin, "m-1")).rejects.toMatchObject({ message: "connection lost" });
  });
});

describe("recordSentEmail", () => {
  const columns = sentEmailColumns(pulled);
  const params = { id: "m-1", sender: "josh@bleacherrentals.com", columns, sleep: noSleep };

  it("marks the sender's email as sent and fills in what Gmail knows", async () => {
    const { admin, calls } = fakeAdmin([{ data: row() }, { data: [{ id: "m-1" }] }]);

    expect(await recordSentEmail(admin, params)).toBe("updated");

    const update = calls.find((call) => call.op === "update");
    expect(update?.args[0]).toEqual({ ...columns, status: "success", error_text: null });
    // Only this email, in this mailbox, and only while it is still being sent.
    expect(calls).toContainEqual({ op: "eq", args: ["mailbox", "josh@bleacherrentals.com"] });
    expect(calls.filter((c) => c.op === "eq" && c.args[0] === "status")).toEqual([
      { op: "eq", args: ["status", "sending"] },
    ]);
  });

  it("changes nothing when the row never arrived", async () => {
    const { admin, calls } = fakeAdmin([{ data: null }]);

    expect(await recordSentEmail(admin, params)).toBe("missing");
    expect(calls.some((call) => call.op === "update")).toBe(false);
  });

  it("changes nothing in someone else's email, or one already sent", async () => {
    for (const other of [
      row({ mailbox: "mike@bleacherrentals.com" }),
      row({ status: "success" }),
    ]) {
      const { admin, calls } = fakeAdmin([{ data: other }]);

      expect(await recordSentEmail(admin, params)).toBe("missing");
      expect(calls.some((call) => call.op === "update")).toBe(false);
    }
  });

  it("drops the pending row when a pull had already saved the same email", async () => {
    const { admin, calls } = fakeAdmin([
      { data: row() },
      { error: { code: "23505", message: "duplicate key" } },
      { data: null },
    ]);

    expect(await recordSentEmail(admin, params)).toBe("duplicate");
    expect(calls.some((call) => call.op === "delete")).toBe(true);
  });

  it("reports missing when the update matched no row", async () => {
    const { admin } = fakeAdmin([{ data: row() }, { data: [] }]);

    expect(await recordSentEmail(admin, params)).toBe("missing");
  });

  it("throws any other database failure", async () => {
    const { admin } = fakeAdmin([{ data: row() }, { error: { code: "XX000", message: "boom" } }]);

    await expect(recordSentEmail(admin, params)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("recordFailedEmail", () => {
  const params = {
    id: "m-1",
    sender: "josh@bleacherrentals.com",
    reason: "Gmail could not send it: Invalid To header",
    sleep: noSleep,
  };

  it("marks the sender's email as failed with the reason, while it is still being sent", async () => {
    const { admin, calls } = fakeAdmin([{ data: row() }, { error: null }]);

    await recordFailedEmail(admin, params);

    const update = calls.find((call) => call.op === "update");
    expect(update?.args[0]).toEqual({ status: "error", error_text: params.reason });
    expect(calls).toContainEqual({ op: "eq", args: ["status", "sending"] });
  });

  it("keeps a very long reason to a sensible length", async () => {
    const { admin, calls } = fakeAdmin([{ data: row() }, { error: null }]);

    await recordFailedEmail(admin, { ...params, reason: "x".repeat(5000) });

    const update = calls.find((call) => call.op === "update");
    expect((update?.args[0] as { error_text: string }).error_text).toHaveLength(1000);
  });

  it("leaves a missing, foreign or already-sent email alone", async () => {
    for (const found of [
      null,
      row({ mailbox: "mike@bleacherrentals.com" }),
      row({ status: "success" }),
    ]) {
      const { admin, calls } = fakeAdmin([{ data: found }]);

      await recordFailedEmail(admin, params);

      expect(calls.some((call) => call.op === "update")).toBe(false);
    }
  });
});
