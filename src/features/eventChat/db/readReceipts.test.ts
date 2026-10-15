import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  createFakePowerSyncDb,
  type FakePowerSyncDb,
} from "@/lib/powersync/testing/fakePowerSyncDb";

// Spec: docs/specs/slow-local-db-step2-fewer-calls.md §3.1, §6 and §7.

const { holder } = vi.hoisted(() => ({ holder: { current: null as unknown } }));

vi.mock("@/components/providers/SystemProvider", async () => {
  const kysely = await import("kysely");
  const fake = () => holder.current as FakePowerSyncDb;
  return {
    db: new kysely.Kysely({
      dialect: {
        createAdapter: () => new kysely.SqliteAdapter(),
        createDriver: () => new kysely.DummyDriver(),
        createIntrospector: (db) => new kysely.SqliteIntrospector(db),
        createQueryCompiler: () => new kysely.SqliteQueryCompiler(),
      },
    }),
    powerSyncDb: {
      getAll: (...args: Parameters<FakePowerSyncDb["getAll"]>) => fake().getAll(...args),
      execute: (...args: Parameters<FakePowerSyncDb["execute"]>) => fake().execute(...args),
      writeTransaction: (...args: Parameters<FakePowerSyncDb["writeTransaction"]>) =>
        fake().writeTransaction(...args),
    },
  };
});

import { markEventMessagesRead } from "./readReceipts";

const ME = "me";
const OTHER = "other";

let sqlite: DatabaseSync;
let fake: FakePowerSyncDb;

const message = (id: string, over: Record<string, unknown> = {}) => {
  const row = {
    event_uuid: "ev1",
    user_uuid: OTHER,
    body: "hi",
    is_system: 0,
    created_at: "2026-01-01",
    ...over,
  };
  sqlite
    .prepare(
      `insert into "EventMessages" (id, event_uuid, user_uuid, body, is_system, created_at)
       values (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, row.event_uuid, row.user_uuid, row.body, row.is_system, row.created_at);
};
const receipt = (id: string, messageId: string, userUuid: string) =>
  sqlite
    .prepare(`insert into "EventMessageReadReceipts" (id, message_id, user_uuid) values (?, ?, ?)`)
    .run(id, messageId, userUuid);
const subscription = (eventUuid: string, userUuid: string, unread: number | null) =>
  sqlite
    .prepare(
      `insert into "EventSubscriptions" (id, event_uuid, user_uuid, unread) values (?, ?, ?, ?)`,
    )
    .run(`s-${eventUuid}-${userUuid}`, eventUuid, userUuid, unread);

const receipts = () =>
  sqlite
    .prepare(
      `select message_id, user_uuid, read_at from "EventMessageReadReceipts" order by message_id, user_uuid`,
    )
    .all() as { message_id: string; user_uuid: string; read_at: string | null }[];
const unreadOf = (eventUuid: string, userUuid: string) =>
  (
    sqlite
      .prepare(`select unread from "EventSubscriptions" where event_uuid = ? and user_uuid = ?`)
      .get(eventUuid, userUuid) as { unread: number | null }
  ).unread;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "EventMessages" (id text primary key, event_uuid text, user_uuid text,
      body text, is_system integer, reply_to_message_id text, created_at text, edited_at text);
    create table "EventMessageReadReceipts" (id text primary key, message_id text,
      user_uuid text, read_at text);
    create unique index receipts_unique on "EventMessageReadReceipts"(message_id, user_uuid);
    create table "EventSubscriptions" (id text primary key, event_uuid text, user_uuid text,
      created_at text, unread integer);
  `);
  fake = createFakePowerSyncDb(sqlite);
  holder.current = fake;
});

describe("markEventMessagesRead", () => {
  it("gives a receipt to every message of the event that has none, and clears unread", async () => {
    message("m1", { user_uuid: OTHER });
    message("m2", { user_uuid: ME });
    message("m3", { user_uuid: OTHER, is_system: 1 });
    subscription("ev1", ME, 1);

    await markEventMessagesRead("ev1", ME);

    expect(receipts().map((r) => [r.message_id, r.user_uuid])).toEqual([
      ["m1", ME],
      ["m2", ME],
      ["m3", ME],
    ]);
    expect(unreadOf("ev1", ME)).toBe(0);
  });

  it("writes one timestamp for the whole run, and a distinct id for each receipt", async () => {
    message("m1");
    message("m2");
    subscription("ev1", ME, 1);

    await markEventMessagesRead("ev1", ME);

    const rows = receipts();
    expect(new Set(rows.map((r) => r.read_at)).size).toBe(1);
    expect(rows[0].read_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const ids = sqlite
      .prepare(`select id from "EventMessageReadReceipts"`)
      .all()
      .map((r) => (r as { id: string }).id);
    expect(new Set(ids).size).toBe(2);
  });

  it("does not repeat a receipt the user already has, and ignores other users' receipts", async () => {
    message("m1");
    message("m2");
    receipt("r1", "m1", ME);
    receipt("r2", "m2", OTHER);
    subscription("ev1", ME, 1);

    await markEventMessagesRead("ev1", ME);

    expect(receipts().map((r) => `${r.message_id}:${r.user_uuid}`)).toEqual([
      `m1:${ME}`,
      `m2:${ME}`,
      `m2:${OTHER}`,
    ]);
  });

  it("leaves the messages of other events alone", async () => {
    message("m1", { event_uuid: "ev1" });
    message("m2", { event_uuid: "ev2" });
    subscription("ev1", ME, 1);
    subscription("ev2", ME, 1);

    await markEventMessagesRead("ev1", ME);

    expect(receipts().map((r) => r.message_id)).toEqual(["m1"]);
    expect(unreadOf("ev2", ME)).toBe(1);
  });

  it("uses two write transactions for any number of unread messages", async () => {
    for (let i = 0; i < 25; i++) message(`m${i}`);
    subscription("ev1", ME, 1);

    await markEventMessagesRead("ev1", ME);

    expect(receipts()).toHaveLength(25);
    // One for all the receipts, one for the unread reset; the old code used 3 + 2N calls.
    expect(fake.stats.writeTransactions).toBe(2);
  });

  describe("when there is nothing to insert", () => {
    it("opens no receipts transaction for a chat with no messages, and still clears unread", async () => {
      subscription("ev1", ME, 1);

      await markEventMessagesRead("ev1", ME);

      expect(receipts()).toEqual([]);
      expect(unreadOf("ev1", ME)).toBe(0);
      expect(fake.stats.writeTransactions).toBe(1);
    });

    it("opens no receipts transaction when every message already has a receipt", async () => {
      message("m1");
      receipt("r1", "m1", ME);
      subscription("ev1", ME, 1);

      await markEventMessagesRead("ev1", ME);

      expect(receipts()).toHaveLength(1);
      expect(unreadOf("ev1", ME)).toBe(0);
      expect(fake.stats.writeTransactions).toBe(1);
    });
  });

  describe("when a statement fails", () => {
    it("writes no receipt, does not clear unread, and rejects", async () => {
      message("m1");
      message("m2");
      message("m3");
      subscription("ev1", ME, 1);
      // The second receipt insert of the run fails.
      sqlite.exec(`
        create trigger fail_second before insert on "EventMessageReadReceipts"
        when (select count(*) from "EventMessageReadReceipts") >= 1
        begin select raise(abort, 'boom'); end;
      `);

      await expect(markEventMessagesRead("ev1", ME)).rejects.toThrow("boom");

      expect(receipts()).toEqual([]);
      expect(unreadOf("ev1", ME)).toBe(1);
    });

    it("releases the in-flight guard, so a later run works", async () => {
      message("m1");
      message("m2");
      subscription("ev1", ME, 1);
      sqlite.exec(`
        create trigger fail_second before insert on "EventMessageReadReceipts"
        when (select count(*) from "EventMessageReadReceipts") >= 1
        begin select raise(abort, 'boom'); end;
      `);
      await expect(markEventMessagesRead("ev1", ME)).rejects.toThrow("boom");

      sqlite.exec(`drop trigger fail_second`);
      await markEventMessagesRead("ev1", ME);

      expect(receipts()).toHaveLength(2);
      expect(unreadOf("ev1", ME)).toBe(0);
    });
  });

  it("ignores a second run for the same chat and user while one is in flight", async () => {
    message("m1");
    message("m2");
    subscription("ev1", ME, 1);

    await Promise.all([markEventMessagesRead("ev1", ME), markEventMessagesRead("ev1", ME)]);

    expect(receipts()).toHaveLength(2);
    expect(fake.stats.writeTransactions).toBe(2);
  });
});
