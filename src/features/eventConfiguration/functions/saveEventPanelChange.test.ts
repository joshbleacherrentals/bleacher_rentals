import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

const executed: CompiledQuery[] = [];
/** What the "is it linked already?" read returns. */
let existingLinks: { id: string }[] = [];
/** How long that read takes, to prove writes for one event keep their order. */
let readDelayMs = 0;
let executeError: Error | null = null;

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: async () => {
    if (readDelayMs) await new Promise((r) => setTimeout(r, readDelayMs));
    return existingLinks;
  },
  typedExecute: async (compiled: CompiledQuery) => {
    if (executeError) throw executeError;
    executed.push(compiled);
  },
}));

import { commitEventHue, setEventBleacherLinked, setEventHue } from "./saveEventPanelChange";

beforeEach(() => {
  executed.length = 0;
  existingLinks = [];
  readDelayMs = 0;
  executeError = null;
});

describe("setEventBleacherLinked", () => {
  it("inserts the link when the event is not on that bleacher yet", async () => {
    await setEventBleacherLinked({ eventUuid: "ev-1", bleacherUuid: "b-1", linked: true });

    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toMatch(/^insert into "BleacherEvents"/);
    // The same default columns Update used to write.
    expect(executed[0].parameters).toEqual(expect.arrayContaining(["b-1", "ev-1", "", 0]));
  });

  it("does not insert a second row when the link already exists", async () => {
    existingLinks = [{ id: "be-1" }];

    await setEventBleacherLinked({ eventUuid: "ev-1", bleacherUuid: "b-1", linked: true });

    expect(executed).toHaveLength(0);
  });

  it("deletes the row of that event and that bleacher, and nothing else", async () => {
    await setEventBleacherLinked({ eventUuid: "ev-1", bleacherUuid: "b-1", linked: false });

    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toMatch(/^delete from "BleacherEvents" where/);
    expect(executed[0].sql).toContain('"event_uuid" = ?');
    expect(executed[0].sql).toContain('"bleacher_uuid" = ?');
    expect(executed[0].parameters).toEqual(["ev-1", "b-1"]);
  });

  it("lets the error from the database reach the caller", async () => {
    executeError = new Error("disk full");

    await expect(
      setEventBleacherLinked({ eventUuid: "ev-1", bleacherUuid: "b-1", linked: false }),
    ).rejects.toThrow("disk full");
  });

  it("runs the writes of one event in the order they were asked for", async () => {
    // The first call spends a while reading; without a queue the delete would overtake the insert
    // and the bleacher would stay linked.
    readDelayMs = 30;
    const link = setEventBleacherLinked({ eventUuid: "ev-1", bleacherUuid: "b-1", linked: true });
    const unlink = setEventBleacherLinked({
      eventUuid: "ev-1",
      bleacherUuid: "b-1",
      linked: false,
    });
    await Promise.all([link, unlink]);

    expect(executed.map((q) => q.sql.split(" ")[0])).toEqual(["insert", "delete"]);
  });

  it("keeps going after a write failed", async () => {
    executeError = new Error("boom");
    const failing = setEventBleacherLinked({
      eventUuid: "ev-1",
      bleacherUuid: "b-1",
      linked: false,
    });
    await expect(failing).rejects.toThrow("boom");

    executeError = null;
    await setEventBleacherLinked({ eventUuid: "ev-1", bleacherUuid: "b-2", linked: false });

    expect(executed).toHaveLength(1);
    expect(executed[0].parameters).toEqual(["ev-1", "b-2"]);
  });
});

describe("setEventHue", () => {
  it("writes hsl_hue on that event", async () => {
    await setEventHue({ eventUuid: "ev-1", hslHue: 210 });

    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toMatch(/^update "Events" set "hsl_hue" = \?/);
    expect(executed[0].parameters).toEqual([210, "ev-1"]);
  });

  it("lets the error from the database reach the caller", async () => {
    executeError = new Error("disk full");

    await expect(setEventHue({ eventUuid: "ev-1", hslHue: 10 })).rejects.toThrow("disk full");
  });
});

describe("commitEventHue (a slider release)", () => {
  it("writes the colour once when it moved during the gesture", async () => {
    const result = await commitEventHue({ eventUuid: "ev-1", startHue: 10, endHue: 200 });

    expect(result).toBe("saved");
    expect(executed).toHaveLength(1);
    expect(executed[0].parameters).toEqual([200, "ev-1"]);
  });

  it("writes nothing when the slider was let go where it started", async () => {
    const result = await commitEventHue({ eventUuid: "ev-1", startHue: 120, endHue: 120 });

    expect(result).toBe("unchanged");
    expect(executed).toHaveLength(0);
  });

  it("writes when the event had no colour and the slider ended on a value", async () => {
    const result = await commitEventHue({ eventUuid: "ev-1", startHue: null, endHue: 0 });

    expect(result).toBe("saved");
    expect(executed).toHaveLength(1);
  });

  it("lets a failed write reach the caller, so the caller can put the colour back", async () => {
    executeError = new Error("disk full");

    await expect(commitEventHue({ eventUuid: "ev-1", startHue: 10, endHue: 200 })).rejects.toThrow(
      "disk full",
    );
  });
});
