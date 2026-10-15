import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  createFakePowerSyncDb,
  type FakePowerSyncDb,
} from "@/lib/powersync/testing/fakePowerSyncDb";

// Spec: docs/specs/slow-local-db-step2-fewer-calls.md §3.2, §5, §6 and §7.

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

import { addEventChatMember, leaveEventChat, removeEventChatMember } from "./conversationActions";

const ACTOR = "actor";
const TARGET = "target";

let sqlite: DatabaseSync;
let fake: FakePowerSyncDb;

const subscribe = (eventUuid: string, userUuid: string, unread = 0) =>
  sqlite
    .prepare(
      `insert into "EventSubscriptions" (id, event_uuid, user_uuid, created_at, unread)
       values (?, ?, ?, ?, ?)`,
    )
    .run(`sub-${eventUuid}-${userUuid}`, eventUuid, userUuid, "2026-01-01", unread);

const subscriptions = () =>
  sqlite
    .prepare(
      `select id, event_uuid, user_uuid, created_at, unread from "EventSubscriptions" order by event_uuid, user_uuid`,
    )
    .all() as {
    id: string;
    event_uuid: string;
    user_uuid: string;
    created_at: string | null;
    unread: number | null;
  }[];

const messages = () =>
  sqlite
    .prepare(
      `select event_uuid, user_uuid, body, is_system, reply_to_message_id, created_at from "EventMessages"`,
    )
    .all() as {
    event_uuid: string;
    user_uuid: string;
    body: string;
    is_system: number;
    reply_to_message_id: string | null;
    created_at: string | null;
  }[];

const system = (body: string, userUuid = ACTOR) => ({ userUuid, body });

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    create table "EventSubscriptions" (id text primary key, event_uuid text, user_uuid text,
      created_at text, unread integer);
    create unique index subscriptions_unique on "EventSubscriptions"(event_uuid, user_uuid);
    create table "EventMessages" (id text primary key, event_uuid text, user_uuid text,
      body text, is_system integer, reply_to_message_id text, created_at text, edited_at text);
  `);
  fake = createFakePowerSyncDb(sqlite);
  holder.current = fake;
});

describe("addEventChatMember", () => {
  it("subscribes the user and posts the system message in one write transaction", async () => {
    const id = await addEventChatMember("ev1", TARGET, system("Actor added Target."));

    const [row] = subscriptions();
    expect(id).toBe(row.id);
    expect(row).toMatchObject({ event_uuid: "ev1", user_uuid: TARGET, unread: 0 });
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(messages()).toMatchObject([
      {
        event_uuid: "ev1",
        user_uuid: ACTOR,
        body: "Actor added Target.",
        is_system: 1,
        reply_to_message_id: null,
      },
    ]);
    expect(fake.stats.writeTransactions).toBe(1);
  });

  it("keeps the existing subscription and returns its id, and still posts the message", async () => {
    subscribe("ev1", TARGET, 1);

    const id = await addEventChatMember("ev1", TARGET, system("Actor added Target."));

    expect(id).toBe("sub-ev1-target");
    expect(subscriptions()).toHaveLength(1);
    expect(subscriptions()[0].unread).toBe(1);
    expect(messages()).toHaveLength(1);
  });

  it("posts no message when there is none to post, and still subscribes", async () => {
    await addEventChatMember("ev1", TARGET, null);

    expect(subscriptions()).toHaveLength(1);
    expect(messages()).toEqual([]);
    expect(fake.stats.writeTransactions).toBe(1);
  });

  it("leaves other subscriptions and other chats alone", async () => {
    subscribe("ev1", "someone-else");
    subscribe("ev2", TARGET);

    await addEventChatMember("ev1", TARGET, null);

    expect(subscriptions().map((s) => `${s.event_uuid}:${s.user_uuid}`)).toEqual([
      "ev1:someone-else",
      "ev1:target",
      "ev2:target",
    ]);
  });

  it("writes nothing and rejects when the message cannot be written", async () => {
    sqlite.exec(`
      create trigger no_messages before insert on "EventMessages"
      begin select raise(abort, 'boom'); end;
    `);

    await expect(addEventChatMember("ev1", TARGET, system("x"))).rejects.toThrow("boom");

    expect(subscriptions()).toEqual([]);
    expect(messages()).toEqual([]);
  });
});

describe("removeEventChatMember", () => {
  it("deletes the subscription and posts the system message in one write transaction", async () => {
    subscribe("ev1", TARGET);
    subscribe("ev1", "someone-else");

    await removeEventChatMember("ev1", TARGET, system("Actor removed Target."));

    expect(subscriptions().map((s) => s.user_uuid)).toEqual(["someone-else"]);
    expect(messages()).toMatchObject([
      { event_uuid: "ev1", user_uuid: ACTOR, body: "Actor removed Target.", is_system: 1 },
    ]);
    expect(fake.stats.writeTransactions).toBe(1);
  });

  it("posts no message when there is none to post", async () => {
    subscribe("ev1", TARGET);

    await removeEventChatMember("ev1", TARGET, null);

    expect(subscriptions()).toEqual([]);
    expect(messages()).toEqual([]);
  });

  it("deletes nothing for a user who is not a member, and still posts the message", async () => {
    subscribe("ev1", "someone-else");

    await removeEventChatMember("ev1", TARGET, system("Actor removed Target."));

    expect(subscriptions()).toHaveLength(1);
    expect(messages()).toHaveLength(1);
  });

  it("keeps the subscription and rejects when the message cannot be written", async () => {
    subscribe("ev1", TARGET);
    sqlite.exec(`
      create trigger no_messages before insert on "EventMessages"
      begin select raise(abort, 'boom'); end;
    `);

    await expect(removeEventChatMember("ev1", TARGET, system("x"))).rejects.toThrow("boom");

    expect(subscriptions()).toHaveLength(1);
  });
});

describe("leaveEventChat", () => {
  it("unsubscribes the user and posts '<name> left the chat.' as that user, in one transaction", async () => {
    subscribe("ev1", ACTOR);

    await leaveEventChat("ev1", ACTOR, "Alex");

    expect(subscriptions()).toEqual([]);
    expect(messages()).toMatchObject([
      { event_uuid: "ev1", user_uuid: ACTOR, body: "Alex left the chat.", is_system: 1 },
    ]);
    expect(fake.stats.writeTransactions).toBe(1);
  });
});
