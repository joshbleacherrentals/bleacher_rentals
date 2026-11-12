import { beforeEach, describe, expect, it, vi } from "vitest";
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

const calls: string[] = [];
const executed: CompiledQuery[] = [];
let failWrite = false;

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecute: (compiled: CompiledQuery) => {
    if (failWrite) return Promise.reject(new Error("write failed"));
    calls.push("write");
    executed.push(compiled);
    return Promise.resolve();
  },
}));

const logSingleChange = vi.fn((..._args: unknown[]) => {
  calls.push("log");
  return Promise.resolve();
});
vi.mock("./logEventChanges", () => ({
  logSingleChange: (...args: unknown[]) => logSingleChange(...args),
}));

import { changeBookedAt } from "./changeBookedAt";

const supabase = {} as never;

beforeEach(() => {
  calls.length = 0;
  executed.length = 0;
  failWrite = false;
  logSingleChange.mockClear();
});

describe("changeBookedAt", () => {
  it("writes the chosen day at 12:00 in the app's timezone to the event's booked_at, and nothing else", async () => {
    const changed = await changeBookedAt(
      {
        eventId: "ev-1",
        from: "2026-11-05T22:43:00.000Z",
        day: "2026-11-12",
        timezone: "America/Toronto",
      },
      supabase,
      "user-1",
    );

    expect(changed).toBe(true);
    expect(executed).toHaveLength(1);
    const { sql, parameters } = executed[0];
    expect(sql).toBe('update "Events" set "booked_at" = ? where "id" = ?');
    expect(parameters).toEqual(["2026-11-12T17:00:00.000Z", "ev-1"]);
  });

  it("logs the change as an update of Booked At, from the old day to the new one, by the user", async () => {
    await changeBookedAt(
      {
        eventId: "ev-1",
        from: "2026-11-05T22:43:00.000Z",
        day: "2026-11-12",
        timezone: "America/Toronto",
      },
      supabase,
      "user-1",
    );

    expect(logSingleChange).toHaveBeenCalledTimes(1);
    expect(logSingleChange).toHaveBeenCalledWith(
      supabase,
      "ev-1",
      "user-1",
      "booked_at",
      "Nov 5, 2026",
      "Nov 12, 2026",
      "update",
    );
  });

  it("writes the old day as the day it was in the app's timezone, not in UTC", async () => {
    // 22:43 on 5 Nov in Toronto is already 03:43 on the 6th in UTC.
    await changeBookedAt(
      {
        eventId: "ev-1",
        from: "2026-11-06T03:43:00.000Z",
        day: "2026-11-12",
        timezone: "America/Toronto",
      },
      supabase,
      null,
    );

    expect(logSingleChange.mock.calls[0].slice(4, 6)).toEqual(["Nov 5, 2026", "Nov 12, 2026"]);
  });

  it("has no old day to log when the event had none", async () => {
    await changeBookedAt(
      { eventId: "ev-1", from: null, day: "2026-11-12", timezone: "UTC" },
      supabase,
      "user-1",
    );

    expect(logSingleChange.mock.calls[0].slice(4, 6)).toEqual([null, "Nov 12, 2026"]);
  });

  it("writes before it logs", async () => {
    await changeBookedAt(
      { eventId: "ev-1", from: null, day: "2026-11-12", timezone: "UTC" },
      supabase,
      "user-1",
    );

    expect(calls).toEqual(["write", "log"]);
  });

  it("does nothing when the chosen day is the day already there: the time of day is kept and the Log has no empty row", async () => {
    const changed = await changeBookedAt(
      {
        eventId: "ev-1",
        from: "2026-11-12T15:20:00.000Z",
        day: "2026-11-12",
        timezone: "America/Toronto",
      },
      supabase,
      "user-1",
    );

    expect(changed).toBe(false);
    expect(executed).toHaveLength(0);
    expect(logSingleChange).not.toHaveBeenCalled();
  });

  it("passes the error on and logs nothing when the write fails", async () => {
    failWrite = true;

    await expect(
      changeBookedAt(
        { eventId: "ev-1", from: null, day: "2026-11-12", timezone: "UTC" },
        supabase,
        "user-1",
      ),
    ).rejects.toThrow("write failed");
    expect(logSingleChange).not.toHaveBeenCalled();
  });

  it("refuses a day that is not a day, before writing", async () => {
    await expect(
      changeBookedAt(
        { eventId: "ev-1", from: null, day: "2026-13-45", timezone: "UTC" },
        supabase,
        "user-1",
      ),
    ).rejects.toThrow();
    expect(executed).toHaveLength(0);
  });
});
