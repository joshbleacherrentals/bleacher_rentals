import { describe, expect, it } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import {
  buildChatNotificationsQueries,
  unreadChats,
  unreadMentionEventIds,
} from "./chatNotificationsData";

// Spec: docs/specs/slow-local-db-step1-split-watchers.md §7 (D6).
//
// The two old JOIN queries of `useEventChatNotifications` and the new five small queries plus the
// JS rules run against the same random data in an in-memory SQLite and must return the same rows.

// The old unread query, verbatim from the hook before this step (compiled by Kysely).
// Parameters: the user's id, 0 (not deleted), the user's id, 1 (flagged unread).
const OLD_UNREAD_SQL = `select "es"."event_uuid" as "eventUuid", "e"."event_name" as "eventName", max(m.created_at) as "latestMessageAt" from "EventSubscriptions" as "es" inner join "EventMessages" as "m" on "m"."event_uuid" = "es"."event_uuid" inner join "Events" as "e" on "e"."id" = "es"."event_uuid" left join "EventMessageReadReceipts" as "rr" on "rr"."message_id" = "m"."id" and "rr"."user_uuid" = "es"."user_uuid" where "es"."user_uuid" = ? and "e"."deleted" = ? and (("m"."user_uuid" != ? and "rr"."id" is null) or "es"."unread" = ?) group by "es"."event_uuid", "e"."event_name"`;

// The old mentions query. Parameters: the user's id, 0 (not deleted), the user's id.
const OLD_MENTION_SQL = `select "m"."event_uuid" as "eventUuid" from "EventMessageMentions" as "men" inner join "EventMessages" as "m" on "m"."id" = "men"."message_id" inner join "Events" as "e" on "e"."id" = "m"."event_uuid" inner join "EventSubscriptions" as "es" on "es"."event_uuid" = "m"."event_uuid" and "es"."user_uuid" = "men"."mentioned_user_uuid" left join "EventMessageReadReceipts" as "rr" on "rr"."message_id" = "m"."id" and "rr"."user_uuid" = "men"."mentioned_user_uuid" where "men"."mentioned_user_uuid" = ? and "e"."deleted" = ? and "m"."user_uuid" != ? and "rr"."id" is null group by "m"."event_uuid"`;

const compileOnlyDb = new Kysely<PowerSyncDB>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

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
const STAMPS = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-02-01", "a", "B", null];

function seed(db: DatabaseSync, rand: () => number): void {
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const orNull = <T>(value: T, p = 0.15): T | null => (rand() < p ? null : value);

  db.exec(`
    create table "EventSubscriptions" (id text primary key, event_uuid text, user_uuid text,
      unread integer);
    create table "Events" (id text primary key, event_name text, deleted integer);
    create table "EventMessages" (id text primary key, event_uuid text, user_uuid text,
      created_at text);
    create table "EventMessageReadReceipts" (id text primary key, message_id text,
      user_uuid text);
    create table "EventMessageMentions" (id text primary key, message_id text,
      mentioned_user_uuid text);
  `);
  const insert = (sql: string, values: SQLInputValue[]) => db.prepare(sql).run(...values);

  const eventIds = Array.from({ length: 6 }, (_, i) => `ev${i}`);
  for (const id of eventIds) {
    insert(`insert into "Events" values (?, ?, ?)`, [
      id,
      orNull(`Event ${id}`),
      pick([0, 0, 0, 1, null]),
    ]);
  }

  const messageIds = Array.from({ length: 22 }, (_, i) => `m${i}`);
  messageIds.forEach((id) => {
    insert(`insert into "EventMessages" values (?, ?, ?, ?)`, [
      id,
      orNull(pick([...eventIds, "ev-missing"]), 0.1),
      orNull(pick(USERS), 0.15),
      pick(STAMPS),
    ]);
  });

  for (let i = 0; i < 16; i++) {
    insert(`insert into "EventSubscriptions" values (?, ?, ?, ?)`, [
      `s${i}`,
      orNull(pick([...eventIds, "ev-missing"]), 0.08),
      pick(USERS),
      pick([0, 1, null]),
    ]);
  }
  for (let i = 0; i < 14; i++) {
    insert(`insert into "EventMessageReadReceipts" values (?, ?, ?)`, [
      `r${i}`,
      pick([...messageIds, "m-missing"]),
      pick(USERS),
    ]);
  }
  for (let i = 0; i < 9; i++) {
    insert(`insert into "EventMessageMentions" values (?, ?, ?)`, [
      `n${i}`,
      pick([...messageIds, "m-missing"]),
      pick(USERS),
    ]);
  }
}

type UnreadRow = { eventUuid: string; eventName: string | null; latestMessageAt: string | null };

const byEvent = (rows: UnreadRow[]) =>
  [...rows]
    .map((r) => [r.eventUuid, r.eventName, r.latestMessageAt])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

describe("useEventChatNotifications: old JOIN queries against the new small queries", () => {
  it("returns the same unread chats and mention events for 200 random datasets and every user", () => {
    let unreadCompared = 0;
    let mentionCompared = 0;
    let nullLatest = 0;

    for (let dataset = 1; dataset <= 200; dataset++) {
      const db = new DatabaseSync(":memory:");
      seed(db, mulberry32(dataset));

      for (const user of USERS) {
        const queries = buildChatNotificationsQueries(compileOnlyDb, user);
        const run = (compiled: { sql: string; parameters: readonly unknown[] }) =>
          db.prepare(compiled.sql).all(...(compiled.parameters as SQLInputValue[]));
        const partsOfUser = {
          subscriptions: run(queries.subscriptions),
          events: run(queries.events),
          messages: run(queries.messages),
          receipts: run(queries.receipts),
          mentions: run(queries.mentions),
        } as never;

        const oldUnread = db
          .prepare(OLD_UNREAD_SQL)
          .all(user, 0, user, 1)
          .map((r) => ({ ...(r as object) })) as UnreadRow[];
        const newUnread = unreadChats(partsOfUser, user);
        expect(byEvent(newUnread), `unread, dataset ${dataset}, ${user}`).toEqual(
          byEvent(oldUnread),
        );

        const oldMentions = db
          .prepare(OLD_MENTION_SQL)
          .all(user, 0, user)
          .map((r) => (r as { eventUuid: string }).eventUuid)
          .sort();
        const newMentions = [...unreadMentionEventIds(partsOfUser, user)].sort();
        expect(newMentions, `mentions, dataset ${dataset}, ${user}`).toEqual(oldMentions);

        unreadCompared += oldUnread.length;
        mentionCompared += oldMentions.length;
        nullLatest += oldUnread.filter((r) => r.latestMessageAt === null).length;
      }
      db.close();
    }

    // Guard against a vacuous pass.
    expect(unreadCompared).toBeGreaterThan(300);
    expect(mentionCompared).toBeGreaterThan(30);
    expect(nullLatest).toBeGreaterThan(0);
  });
});
