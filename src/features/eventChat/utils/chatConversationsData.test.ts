import { describe, expect, it } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import {
  buildChatConversationsQueries,
  conversationRows,
  unreadEventIds,
  unreadMentionEventIds,
  type ChatConversationsParts,
} from "./chatConversationsData";

// Spec: docs/specs/slow-local-db-step1-split-watchers.md §3.3 and §5.

const ME = "me";
const OTHER = "other";

const sub = (over: Record<string, unknown> = {}) => ({
  event_uuid: "ev1",
  unread: 0,
  ...over,
});
const event = (over: Record<string, unknown> = {}) => ({
  id: "ev1",
  event_name: "Event one",
  deleted: 0,
  ...over,
});
const message = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  event_uuid: "ev1",
  user_uuid: OTHER,
  created_at: "2026-01-02",
  ...over,
});

const parts = (over: Partial<ChatConversationsParts> = {}): ChatConversationsParts => ({
  subscriptions: [],
  events: [],
  messages: [],
  receipts: [],
  mentions: [],
  ...over,
});

describe("conversationRows", () => {
  it("returns a subscribed event that has messages, with the latest message of any author", () => {
    const rows = conversationRows(
      parts({
        subscriptions: [sub()],
        events: [event()],
        messages: [
          message({ id: "a", user_uuid: OTHER, created_at: "2026-01-02" }),
          message({ id: "b", user_uuid: ME, created_at: "2026-03-01" }),
        ],
      }),
      ME,
    );
    expect(rows).toEqual([
      { eventUuid: "ev1", eventName: "Event one", latestMessageAt: "2026-03-01" },
    ]);
  });

  it("returns nothing for an empty input", () => {
    expect(conversationRows(parts(), ME)).toEqual([]);
  });

  it("gives no row for an event with no messages", () => {
    expect(conversationRows(parts({ subscriptions: [sub()], events: [event()] }), ME)).toEqual([]);
  });

  it("is not affected by receipts or the unread flag", () => {
    const rows = conversationRows(
      parts({
        subscriptions: [sub({ unread: 1 })],
        events: [event()],
        messages: [message()],
        receipts: [{ message_id: "m1" }],
      }),
      ME,
    );
    expect(rows).toHaveLength(1);
  });

  describe("rows the inner joins dropped", () => {
    it("drops a deleted event, and an event whose deleted flag is NULL", () => {
      for (const deleted of [1, null]) {
        const rows = conversationRows(
          parts({ subscriptions: [sub()], events: [event({ deleted })], messages: [message()] }),
          ME,
        );
        expect(rows).toEqual([]);
      }
    });

    it("drops a subscription whose event is not synced, and one with no event id", () => {
      expect(
        conversationRows(parts({ subscriptions: [sub()], messages: [message()] }), ME),
      ).toEqual([]);
      expect(
        conversationRows(
          parts({
            subscriptions: [sub({ event_uuid: null })],
            events: [event()],
            messages: [message({ event_uuid: null })],
          }),
          ME,
        ),
      ).toEqual([]);
    });

    it("ignores messages of events I am not subscribed to", () => {
      const rows = conversationRows(
        parts({
          subscriptions: [sub({ event_uuid: "ev1" })],
          events: [event({ id: "ev1" }), event({ id: "ev2" })],
          messages: [message({ event_uuid: "ev2" })],
        }),
        ME,
      );
      expect(rows).toEqual([]);
    });
  });

  describe("latestMessageAt", () => {
    it("ignores NULL created_at, and is NULL when every one is NULL (the row stays)", () => {
      const mixed = conversationRows(
        parts({
          subscriptions: [sub()],
          events: [event()],
          messages: [
            message({ id: "a", created_at: null }),
            message({ id: "b", created_at: "2026-01-02" }),
          ],
        }),
        ME,
      );
      expect(mixed[0].latestMessageAt).toBe("2026-01-02");

      const allNull = conversationRows(
        parts({
          subscriptions: [sub()],
          events: [event()],
          messages: [message({ created_at: null })],
        }),
        ME,
      );
      expect(allNull).toEqual([
        { eventUuid: "ev1", eventName: "Event one", latestMessageAt: null },
      ]);
    });

    it("compares as text byte by byte, not with locale rules", () => {
      const rows = conversationRows(
        parts({
          subscriptions: [sub()],
          events: [event()],
          messages: [message({ id: "a", created_at: "B" }), message({ id: "b", created_at: "a" })],
        }),
        ME,
      );
      expect(rows[0].latestMessageAt).toBe("a");
    });
  });

  it("gives one row per event for duplicate subscription rows", () => {
    const rows = conversationRows(
      parts({
        subscriptions: [sub(), sub()],
        events: [event()],
        messages: [message()],
      }),
      ME,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("unreadEventIds", () => {
  const unreadOf = (over: Partial<ChatConversationsParts> = {}) =>
    unreadEventIds(
      parts({ subscriptions: [sub()], events: [event()], messages: [message()], ...over }),
      ME,
    );

  it("includes an event with a message from someone else that has no receipt", () => {
    expect([...unreadOf()]).toEqual(["ev1"]);
  });

  it("returns an empty set for an empty input", () => {
    expect(unreadEventIds(parts(), ME).size).toBe(0);
  });

  it("ignores my own messages, a message with a receipt, and a message with no author", () => {
    expect(unreadOf({ messages: [message({ user_uuid: ME })] }).size).toBe(0);
    expect(unreadOf({ receipts: [{ message_id: "m1" }] }).size).toBe(0);
    expect(unreadOf({ messages: [message({ user_uuid: null })] }).size).toBe(0);
  });

  it("includes an event whose subscription is flagged unread, when it has any message", () => {
    const flagged = unreadOf({
      subscriptions: [sub({ unread: 1 })],
      messages: [message({ user_uuid: ME })],
    });
    expect([...flagged]).toEqual(["ev1"]);

    const noMessages = unreadOf({ subscriptions: [sub({ unread: 1 })], messages: [] });
    expect(noMessages.size).toBe(0);
  });

  it("is not triggered by an unread flag of 0 or NULL", () => {
    for (const unread of [0, null]) {
      expect(
        unreadOf({ subscriptions: [sub({ unread })], messages: [message({ user_uuid: ME })] }).size,
      ).toBe(0);
    }
  });

  it("drops deleted events, NULL-deleted events, and unsynced events", () => {
    expect(unreadOf({ events: [event({ deleted: 1 })] }).size).toBe(0);
    expect(unreadOf({ events: [event({ deleted: null })] }).size).toBe(0);
    expect(unreadOf({ events: [] }).size).toBe(0);
  });

  it("ignores messages of events I am not subscribed to", () => {
    expect(
      unreadOf({ subscriptions: [sub({ event_uuid: "ev2" })], events: [event({ id: "ev2" })] })
        .size,
    ).toBe(0);
  });
});

describe("unreadMentionEventIds", () => {
  const withMention = (over: Partial<ChatConversationsParts> = {}) =>
    parts({
      subscriptions: [sub()],
      events: [event()],
      messages: [message()],
      mentions: [{ message_id: "m1" }],
      ...over,
    });

  it("returns the event of an unread message from someone else that mentions me", () => {
    expect([...unreadMentionEventIds(withMention(), ME)]).toEqual(["ev1"]);
  });

  it("returns an empty set for an empty input", () => {
    expect(unreadMentionEventIds(parts(), ME).size).toBe(0);
  });

  it("ignores my own message, a message with no author, and a mention with a receipt", () => {
    for (const user_uuid of [ME, null]) {
      expect(
        unreadMentionEventIds(withMention({ messages: [message({ user_uuid })] }), ME).size,
      ).toBe(0);
    }
    expect(unreadMentionEventIds(withMention({ receipts: [{ message_id: "m1" }] }), ME).size).toBe(
      0,
    );
  });

  it("ignores deleted, NULL-deleted and unsubscribed events, and unsynced messages", () => {
    for (const over of [
      { events: [event({ deleted: 1 })] },
      { events: [event({ deleted: null })] },
      { subscriptions: [] },
      { mentions: [{ message_id: "gone" }] },
    ]) {
      expect(unreadMentionEventIds(withMention(over), ME).size).toBe(0);
    }
  });
});

describe("buildChatConversationsQueries", () => {
  const compileOnlyDb = new Kysely<PowerSyncDB>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  });
  const queries = buildChatConversationsQueries(compileOnlyDb, "user-1");

  it("makes five queries, none of them with a JOIN", () => {
    expect(Object.keys(queries).sort()).toEqual([
      "events",
      "mentions",
      "messages",
      "receipts",
      "subscriptions",
    ]);
    for (const compiled of Object.values(queries)) {
      expect(compiled.sql).not.toMatch(/\bjoin\b/i);
    }
  });

  it("binds every query to the user's id", () => {
    for (const compiled of Object.values(queries)) {
      expect(compiled.parameters).toContain("user-1");
    }
  });

  it("reads events and messages only through the user's own subscriptions", () => {
    for (const compiled of [queries.events, queries.messages]) {
      expect(compiled.sql).toMatch(/in \(select "es"\."event_uuid" from "EventSubscriptions"/);
    }
  });
});
