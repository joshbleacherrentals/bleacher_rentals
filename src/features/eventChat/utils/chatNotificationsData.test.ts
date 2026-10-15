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
  buildChatNotificationsQueries,
  unreadChats,
  unreadMentionEventIds,
  type ChatNotificationsParts,
} from "./chatNotificationsData";

// Spec: docs/specs/slow-local-db-step1-split-watchers.md §3.2 and §5.

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

const parts = (over: Partial<ChatNotificationsParts> = {}): ChatNotificationsParts => ({
  subscriptions: [],
  events: [],
  messages: [],
  receipts: [],
  mentions: [],
  ...over,
});

describe("unreadChats", () => {
  it("returns an event with a message from someone else that has no receipt", () => {
    const rows = unreadChats(
      parts({ subscriptions: [sub()], events: [event()], messages: [message()] }),
      ME,
    );
    expect(rows).toEqual([
      { eventUuid: "ev1", eventName: "Event one", latestMessageAt: "2026-01-02" },
    ]);
  });

  it("returns nothing for an empty input", () => {
    expect(unreadChats(parts(), ME)).toEqual([]);
  });

  it("ignores my own messages", () => {
    const rows = unreadChats(
      parts({
        subscriptions: [sub()],
        events: [event()],
        messages: [message({ user_uuid: ME })],
      }),
      ME,
    );
    expect(rows).toEqual([]);
  });

  it("ignores a message I have a receipt for", () => {
    const rows = unreadChats(
      parts({
        subscriptions: [sub()],
        events: [event()],
        messages: [message()],
        receipts: [{ message_id: "m1" }],
      }),
      ME,
    );
    expect(rows).toEqual([]);
  });

  it("does not count a message with no author as someone else's (SQL: NULL != me is not true)", () => {
    const rows = unreadChats(
      parts({
        subscriptions: [sub()],
        events: [event()],
        messages: [message({ user_uuid: null })],
      }),
      ME,
    );
    expect(rows).toEqual([]);
  });

  it("counts a system message from someone else, as the SQL does", () => {
    // The SQL has no is_system filter, and the message rows carry no such field.
    const rows = unreadChats(
      parts({ subscriptions: [sub()], events: [event()], messages: [message({ id: "sys" })] }),
      ME,
    );
    expect(rows).toHaveLength(1);
  });

  describe("a subscription flagged unread", () => {
    it("makes every message of the event qualify, mine included", () => {
      const rows = unreadChats(
        parts({
          subscriptions: [sub({ unread: 1 })],
          events: [event()],
          messages: [
            message({ id: "a", user_uuid: ME, created_at: "2026-01-09" }),
            message({ id: "b", user_uuid: OTHER, created_at: "2026-01-03" }),
          ],
          receipts: [{ message_id: "b" }],
        }),
        ME,
      );
      expect(rows).toEqual([
        { eventUuid: "ev1", eventName: "Event one", latestMessageAt: "2026-01-09" },
      ]);
    });

    it("gives no row when the event has no messages", () => {
      const rows = unreadChats(
        parts({ subscriptions: [sub({ unread: 1 })], events: [event()] }),
        ME,
      );
      expect(rows).toEqual([]);
    });

    it("is not triggered by 0 or NULL", () => {
      for (const unread of [0, null]) {
        const rows = unreadChats(
          parts({
            subscriptions: [sub({ unread })],
            events: [event()],
            messages: [message({ user_uuid: ME })],
          }),
          ME,
        );
        expect(rows).toEqual([]);
      }
    });
  });

  describe("rows the inner joins dropped", () => {
    it("drops a deleted event, and an event whose deleted flag is NULL", () => {
      for (const deleted of [1, null]) {
        const rows = unreadChats(
          parts({
            subscriptions: [sub()],
            events: [event({ deleted })],
            messages: [message()],
          }),
          ME,
        );
        expect(rows).toEqual([]);
      }
    });

    it("drops a subscription whose event is not synced locally", () => {
      const rows = unreadChats(parts({ subscriptions: [sub()], messages: [message()] }), ME);
      expect(rows).toEqual([]);
    });

    it("drops a subscription with no event id", () => {
      const rows = unreadChats(
        parts({
          subscriptions: [sub({ event_uuid: null })],
          events: [event()],
          messages: [message({ event_uuid: null })],
        }),
        ME,
      );
      expect(rows).toEqual([]);
    });

    it("ignores messages of events I am not subscribed to", () => {
      const rows = unreadChats(
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
    it("is the text maximum over the qualifying messages", () => {
      const rows = unreadChats(
        parts({
          subscriptions: [sub()],
          events: [event()],
          messages: [
            message({ id: "a", created_at: "2026-01-02" }),
            message({ id: "b", created_at: "2026-03-01" }),
            message({ id: "c", created_at: "2026-02-01" }),
          ],
        }),
        ME,
      );
      expect(rows[0].latestMessageAt).toBe("2026-03-01");
    });

    it("ignores NULL created_at, and is NULL when every one is NULL (the row stays)", () => {
      const mixed = unreadChats(
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

      const allNull = unreadChats(
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
      // Byte order puts "a" (97) after "B" (66); a locale compare would put "B" last.
      const rows = unreadChats(
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

  it("gives one row per event for duplicate subscription rows, qualifying by either", () => {
    const rows = unreadChats(
      parts({
        subscriptions: [sub({ unread: 0 }), sub({ unread: 1 })],
        events: [event()],
        messages: [message({ id: "mine", user_uuid: ME, created_at: "2026-05-05" })],
      }),
      ME,
    );
    expect(rows).toEqual([
      { eventUuid: "ev1", eventName: "Event one", latestMessageAt: "2026-05-05" },
    ]);
  });

  it("returns one row for each qualifying event", () => {
    const rows = unreadChats(
      parts({
        subscriptions: [sub({ event_uuid: "ev1" }), sub({ event_uuid: "ev2" })],
        events: [event({ id: "ev1" }), event({ id: "ev2", event_name: "Two" })],
        messages: [
          message({ id: "a", event_uuid: "ev1" }),
          message({ id: "b", event_uuid: "ev2", created_at: "2026-02-02" }),
        ],
      }),
      ME,
    );
    expect(rows.map((r) => r.eventUuid).sort()).toEqual(["ev1", "ev2"]);
  });
});

describe("unreadMentionEventIds", () => {
  const withMention = (over: Partial<ChatNotificationsParts> = {}) =>
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

  it("ignores a mention in my own message, and in a message with no author", () => {
    for (const user_uuid of [ME, null]) {
      const ids = unreadMentionEventIds(withMention({ messages: [message({ user_uuid })] }), ME);
      expect(ids.size).toBe(0);
    }
  });

  it("ignores a mention I already have a receipt for", () => {
    const ids = unreadMentionEventIds(withMention({ receipts: [{ message_id: "m1" }] }), ME);
    expect(ids.size).toBe(0);
  });

  it("ignores deleted events, NULL-deleted events, and events I am not subscribed to", () => {
    for (const over of [
      { events: [event({ deleted: 1 })] },
      { events: [event({ deleted: null })] },
      { subscriptions: [] },
      { subscriptions: [sub({ event_uuid: "ev2" })] },
    ]) {
      expect(unreadMentionEventIds(withMention(over), ME).size).toBe(0);
    }
  });

  it("ignores a mention whose message is not synced", () => {
    const ids = unreadMentionEventIds(withMention({ mentions: [{ message_id: "gone" }] }), ME);
    expect(ids.size).toBe(0);
  });

  it("does not depend on the subscription's unread flag, and returns an event once", () => {
    const ids = unreadMentionEventIds(
      withMention({
        subscriptions: [sub({ unread: 1 })],
        messages: [message({ id: "m1" }), message({ id: "m2" })],
        mentions: [{ message_id: "m1" }, { message_id: "m2" }],
      }),
      ME,
    );
    expect([...ids]).toEqual(["ev1"]);
  });
});

describe("buildChatNotificationsQueries", () => {
  const compileOnlyDb = new Kysely<PowerSyncDB>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  });
  const queries = buildChatNotificationsQueries(compileOnlyDb, "user-1");

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
