import { describe, expect, it, vi } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  createFakePowerSyncDb,
  type FakePowerSyncDb,
} from "@/lib/powersync/testing/fakePowerSyncDb";

// Spec: docs/specs/slow-local-db-step2-fewer-calls.md §7.
//
// The old way of adding, removing and leaving (a subscription call, then a message call, each its
// own transaction) and the new functions run on identical random databases and must leave the
// same subscription and message rows.

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

import { sendEventMessage } from "./messages";
import { subscribeToEvent, unsubscribeFromEvent } from "./subscriptions";
import { addEventChatMember, leaveEventChat, removeEventChatMember } from "./conversationActions";

// The old flows, as the members modal and `leaveEventChat` ran them before this step.
async function oldAdd(
  eventUuid: string,
  target: string,
  message: { userUuid: string; body: string } | null,
) {
  await subscribeToEvent(eventUuid, target);
  if (message) {
    await sendEventMessage({
      eventUuid,
      userUuid: message.userUuid,
      body: message.body,
      isSystem: true,
    });
  }
}
async function oldRemove(
  eventUuid: string,
  target: string,
  message: { userUuid: string; body: string } | null,
) {
  await unsubscribeFromEvent(eventUuid, target);
  if (message) {
    await sendEventMessage({
      eventUuid,
      userUuid: message.userUuid,
      body: message.body,
      isSystem: true,
    });
  }
}
async function oldLeave(eventUuid: string, userUuid: string, actorName: string) {
  await unsubscribeFromEvent(eventUuid, userUuid);
  await sendEventMessage({
    eventUuid,
    userUuid,
    body: `${actorName} left the chat.`,
    isSystem: true,
  });
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

const USERS = ["u1", "u2", "u3", "u4"];
const EVENTS = ["ev0", "ev1"];

function seededDatabase(seed: number): DatabaseSync {
  const rand = mulberry32(seed);
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "EventSubscriptions" (id text primary key, event_uuid text, user_uuid text,
      created_at text, unread integer);
    create unique index subscriptions_unique on "EventSubscriptions"(event_uuid, user_uuid);
    create table "EventMessages" (id text primary key, event_uuid text, user_uuid text,
      body text, is_system integer, reply_to_message_id text, created_at text, edited_at text);
  `);
  const insert = (sql: string, values: SQLInputValue[]) => sqlite.prepare(sql).run(...values);
  for (const eventUuid of EVENTS) {
    for (const userUuid of USERS) {
      if (rand() < 0.5) continue;
      insert(
        `insert into "EventSubscriptions" (id, event_uuid, user_uuid, created_at, unread) values (?, ?, ?, ?, ?)`,
        [`s-${eventUuid}-${userUuid}`, eventUuid, userUuid, "2026-01-01", rand() < 0.5 ? 1 : 0],
      );
    }
  }
  insert(
    `insert into "EventMessages" (id, event_uuid, user_uuid, body, is_system) values (?, ?, ?, ?, ?)`,
    ["m0", "ev0", "u1", "earlier", 0],
  );
  return sqlite;
}

// Ids and timestamps are random or clock-based, so rows are compared by what they say. For a
// subscription that is its event, user and unread flag, and that the id and time are set.
const snapshot = (sqlite: DatabaseSync) => ({
  subscriptions: (
    sqlite
      .prepare(`select id, event_uuid, user_uuid, created_at, unread from "EventSubscriptions"`)
      .all() as {
      id: string | null;
      event_uuid: string;
      user_uuid: string;
      created_at: string | null;
      unread: number | null;
    }[]
  )
    .map((r) =>
      [
        r.event_uuid,
        r.user_uuid,
        r.unread,
        r.id ? "id" : "noid",
        r.created_at ? "at" : "noat",
      ].join("|"),
    )
    .sort(),
  messages: (
    sqlite
      .prepare(
        `select id, event_uuid, user_uuid, body, is_system, reply_to_message_id, created_at from "EventMessages"`,
      )
      .all() as {
      id: string | null;
      event_uuid: string;
      user_uuid: string;
      body: string;
      is_system: number;
      reply_to_message_id: string | null;
      created_at: string | null;
    }[]
  )
    .map((r) =>
      [
        r.event_uuid,
        r.user_uuid,
        r.body,
        r.is_system,
        r.reply_to_message_id,
        r.id ? "id" : "noid",
        r.created_at ? "at" : "noat",
      ].join("|"),
    )
    .sort(),
});

describe("chat member actions: the old flows against the new functions", () => {
  it("leave the same rows for 200 random databases and every action", async () => {
    let oldTransactions = 0;
    let newTransactions = 0;
    let changed = 0;

    for (let dataset = 1; dataset <= 200; dataset++) {
      const rand = mulberry32(dataset * 7919);
      const eventUuid = EVENTS[Math.floor(rand() * EVENTS.length)];
      const target = USERS[Math.floor(rand() * USERS.length)];
      const actor = USERS[Math.floor(rand() * USERS.length)];
      const message = rand() < 0.2 ? null : { userUuid: actor, body: `by ${actor} on ${target}` };

      const cases: [string, (isOld: boolean) => Promise<void>][] = [
        ["add", (isOld) => (isOld ? oldAdd : addEventChatMemberVoid)(eventUuid, target, message)],
        [
          "remove",
          (isOld) => (isOld ? oldRemove : removeEventChatMemberVoid)(eventUuid, target, message),
        ],
        [
          "leave",
          (isOld) => (isOld ? oldLeave : leaveEventChat)(eventUuid, actor, `Name of ${actor}`),
        ],
      ];

      for (const [action, run] of cases) {
        const before = seededDatabase(dataset);
        const oldDb = seededDatabase(dataset);
        const newDb = seededDatabase(dataset);

        const oldFake = createFakePowerSyncDb(oldDb);
        holder.current = oldFake;
        await run(true);

        const newFake = createFakePowerSyncDb(newDb);
        holder.current = newFake;
        await run(false);

        const label = `dataset ${dataset}, ${action}`;
        expect(snapshot(newDb), label).toEqual(snapshot(oldDb));
        expect(newFake.stats.writeTransactions, `one transaction, ${label}`).toBe(1);
        oldTransactions += oldFake.stats.writeTransactions;
        newTransactions += newFake.stats.writeTransactions;
        if (JSON.stringify(snapshot(newDb)) !== JSON.stringify(snapshot(before))) changed++;

        before.close();
        oldDb.close();
        newDb.close();
      }
    }

    // Guard against a vacuous pass, and show the gain.
    expect(changed).toBeGreaterThan(400);
    expect(newTransactions).toBeLessThan(oldTransactions);
  }, 60_000);
});

// The new functions return a value; the cases above only need them to finish.
const addEventChatMemberVoid = async (...args: Parameters<typeof addEventChatMember>) => {
  await addEventChatMember(...args);
};
const removeEventChatMemberVoid = removeEventChatMember;
