import { describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  createFakePowerSyncDb,
  type FakePowerSyncDb,
} from "@/lib/powersync/testing/fakePowerSyncDb";

// Spec: docs/specs/slow-local-db-step2-fewer-calls.md §7.
//
// The old `markEventMessagesRead`, kept verbatim below, and the new one run on identical random
// databases and must leave the same receipts, the same unread flags and nothing else changed.

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

import { db } from "@/components/providers/SystemProvider";
import { expect as expectType, typedExecute, typedGetAll } from "@/lib/powersync/typedQuery";
import { clearEventChatUnread } from "./subscriptions";
import { markEventMessagesRead } from "./readReceipts";

// The old implementation, verbatim from `readReceipts.ts` before this step.
const oldInFlight = new Set<string>();
async function oldMarkEventMessagesRead(eventUuid: string, userUuid: string) {
  const lockKey = `${eventUuid}:${userUuid}`;
  if (oldInFlight.has(lockKey)) return;
  oldInFlight.add(lockKey);
  try {
    const messages = await typedGetAll(
      db.selectFrom("EventMessages").select(["id"]).where("event_uuid", "=", eventUuid).compile(),
      expectType<{ id: string }>(),
    );
    if (messages.length === 0) {
      await clearEventChatUnread(eventUuid, userUuid);
      return;
    }
    const messageIds = messages.map((m) => m.id);
    const existing = await typedGetAll(
      db
        .selectFrom("EventMessageReadReceipts")
        .select(["message_id"])
        .where("user_uuid", "=", userUuid)
        .where("message_id", "in", messageIds)
        .compile(),
      expectType<{ message_id: string | null }>(),
    );
    const existingSet = new Set(existing.map((r) => r.message_id));
    const now = new Date().toISOString();
    for (const msg of messages) {
      if (existingSet.has(msg.id)) continue;
      const justCreated = await typedGetAll(
        db
          .selectFrom("EventMessageReadReceipts")
          .select(["id"])
          .where("message_id", "=", msg.id)
          .where("user_uuid", "=", userUuid)
          .limit(1)
          .compile(),
        expectType<{ id: string }>(),
      );
      if (justCreated.length > 0) {
        existingSet.add(msg.id);
        continue;
      }
      await typedExecute(
        db
          .insertInto("EventMessageReadReceipts")
          .values({
            id: crypto.randomUUID(),
            message_id: msg.id,
            user_uuid: userUuid,
            read_at: now,
          })
          .compile(),
      );
      existingSet.add(msg.id);
    }
    await clearEventChatUnread(eventUuid, userUuid);
  } finally {
    oldInFlight.delete(lockKey);
  }
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const USERS = ["u1", "u2", "u3"];
const EVENTS = ["ev0", "ev1", "ev2"];

function seededDatabase(seed: number): DatabaseSync {
  const rand = mulberry32(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "EventMessages" (id text primary key, event_uuid text, user_uuid text,
      body text, is_system integer, reply_to_message_id text, created_at text, edited_at text);
    create table "EventMessageReadReceipts" (id text primary key, message_id text,
      user_uuid text, read_at text);
    create unique index receipts_unique on "EventMessageReadReceipts"(message_id, user_uuid);
    create table "EventSubscriptions" (id text primary key, event_uuid text, user_uuid text,
      created_at text, unread integer);
  `);
  const insert = (sql: string, values: SQLInputValue[]) => sqlite.prepare(sql).run(...values);

  const messageIds: string[] = [];
  for (let i = 0; i < 14; i++) {
    const id = `m${i}`;
    messageIds.push(id);
    insert(
      `insert into "EventMessages" (id, event_uuid, user_uuid, body, is_system) values (?, ?, ?, ?, ?)`,
      [id, pick(EVENTS), pick([...USERS, null]), "hi", pick([0, 0, 1])],
    );
  }
  // Receipts: unique (message, user) pairs, so the real constraint holds.
  const pairs = new Set<string>();
  for (let i = 0; i < 12; i++) pairs.add(`${pick(messageIds)}|${pick(USERS)}`);
  let n = 0;
  for (const pair of pairs) {
    const [messageId, userId] = pair.split("|");
    insert(
      `insert into "EventMessageReadReceipts" (id, message_id, user_uuid, read_at) values (?, ?, ?, ?)`,
      [`r${n++}`, messageId, userId, "2026-01-01T00:00:00.000Z"],
    );
  }
  for (const eventUuid of EVENTS) {
    for (const userUuid of USERS) {
      if (rand() < 0.15) continue; // no subscription row at all
      insert(
        `insert into "EventSubscriptions" (id, event_uuid, user_uuid, unread) values (?, ?, ?, ?)`,
        [`s-${eventUuid}-${userUuid}`, eventUuid, userUuid, pick([0, 1, null])],
      );
    }
  }
  return sqlite;
}

const snapshot = (sqlite: DatabaseSync) => ({
  // Ids are random and `read_at` is a timestamp, so receipts are compared by what they say.
  receipts: (
    sqlite
      .prepare(`select message_id, user_uuid, read_at from "EventMessageReadReceipts"`)
      .all() as { message_id: string; user_uuid: string; read_at: string | null }[]
  )
    .map((r) => [r.message_id, r.user_uuid, r.read_at === null ? "null" : "set"].join("|"))
    .sort(),
  subscriptions: sqlite
    .prepare(`select event_uuid, user_uuid, unread from "EventSubscriptions" order by 1, 2`)
    .all()
    .map((r) => JSON.stringify({ ...(r as object) })),
  messages: sqlite
    .prepare(`select id, event_uuid, user_uuid, body, is_system from "EventMessages" order by id`)
    .all()
    .map((r) => JSON.stringify({ ...(r as object) })),
});

describe("markEventMessagesRead: the old implementation against the new one", () => {
  it("leaves the same data for 200 random databases, every user and every chat", async () => {
    let oldTransactions = 0;
    let newTransactions = 0;
    let receiptsWritten = 0;

    for (let dataset = 1; dataset <= 200; dataset++) {
      for (const user of USERS) {
        for (const eventUuid of EVENTS) {
          const before = seededDatabase(dataset);
          const oldDb = seededDatabase(dataset);
          const newDb = seededDatabase(dataset);

          const oldFake = createFakePowerSyncDb(oldDb);
          holder.current = oldFake;
          await oldMarkEventMessagesRead(eventUuid, user);

          const newFake = createFakePowerSyncDb(newDb);
          holder.current = newFake;
          await markEventMessagesRead(eventUuid, user);

          const label = `dataset ${dataset}, ${user}, ${eventUuid}`;
          const after = snapshot(newDb);
          expect(after.receipts, `receipts, ${label}`).toEqual(snapshot(oldDb).receipts);
          expect(after.subscriptions, `unread flags, ${label}`).toEqual(
            snapshot(oldDb).subscriptions,
          );
          expect(after.messages, `messages untouched, ${label}`).toEqual(snapshot(before).messages);

          expect(newFake.stats.writeTransactions, `at most two, ${label}`).toBeLessThanOrEqual(2);
          expect(
            newFake.stats.writeTransactions,
            `not more than before, ${label}`,
          ).toBeLessThanOrEqual(oldFake.stats.writeTransactions);
          oldTransactions += oldFake.stats.writeTransactions;
          newTransactions += newFake.stats.writeTransactions;
          receiptsWritten += after.receipts.length - snapshot(before).receipts.length;

          before.close();
          oldDb.close();
          newDb.close();
        }
      }
    }

    // Guard against a vacuous pass, and show the gain.
    expect(receiptsWritten).toBeGreaterThan(500);
    expect(newTransactions).toBeLessThan(oldTransactions);
  }, 60_000);
});
