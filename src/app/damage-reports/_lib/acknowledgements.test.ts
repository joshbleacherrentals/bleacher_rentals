import { describe, it, expect, vi } from "vitest";
import {
  Kysely,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (d) => new SqliteIntrospector(d),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: () => ({ data: [] }),
}));

import { buildAcknowledgementsQuery, summariseAcknowledgements } from "./acknowledgements";

/**
 * Acknowledgements, on the manager's side.
 *
 * Spec: br_driver/docs/specs/damage-report-dedupe.md
 *
 * Drivers stopped filing duplicate reports and started confirming the open one
 * instead. Without this half, the change reads to a manager as "fewer reports
 * arrive" — which is indistinguishable from drivers giving up on reporting.
 * What they are owed is the opposite signal: three people have now seen this,
 * most recently on the 8th, and it is still broken.
 */

describe("what is fetched", () => {
  it("names the driver who confirmed, not just their id", () => {
    const { sql } = buildAcknowledgementsQuery(["dr-1"]);

    expect(sql).toContain('"Users"');
    expect(sql).toContain("first_name");
  });

  it("leaves out withdrawn acknowledgements", () => {
    const { sql, parameters } = buildAcknowledgementsQuery(["dr-1"]);

    expect(sql).toContain('"deleted" = ?');
    expect(parameters).toContain(0);
  });

  it("asks only about the reports on screen", () => {
    const { sql, parameters } = buildAcknowledgementsQuery(["dr-1", "dr-2"]);

    expect(sql).toContain('"damage_report_uuid" in (?, ?)');
    expect(parameters).toContain("dr-2");
  });
});

describe("what the manager reads", () => {
  const rows = [
    {
      id: "a1",
      damage_report_uuid: "dr-1",
      created_at: "2026-09-01T10:00:00.000Z",
      inspection_uuid: "insp-1",
      first_name: "Sam",
      last_name: "Rivera",
    },
    {
      id: "a2",
      damage_report_uuid: "dr-1",
      created_at: "2026-09-08T10:00:00.000Z",
      inspection_uuid: null,
      first_name: "Alex",
      last_name: "Chen",
    },
    {
      id: "a3",
      damage_report_uuid: "dr-2",
      created_at: "2026-09-02T10:00:00.000Z",
      inspection_uuid: null,
      first_name: null,
      last_name: null,
    },
  ];

  it("counts confirmations per report", () => {
    const summary = summariseAcknowledgements(rows);

    expect(summary["dr-1"].count).toBe(2);
    expect(summary["dr-2"].count).toBe(1);
  });

  it("surfaces the most recent one — that is what says it is still broken", () => {
    expect(summariseAcknowledgements(rows)["dr-1"].latestAt).toBe("2026-09-08T10:00:00.000Z");
  });

  it("lists who confirmed, newest first", () => {
    const entries = summariseAcknowledgements(rows)["dr-1"].entries;

    expect(entries.map((entry) => entry.name)).toEqual(["Alex Chen", "Sam Rivera"]);
  });

  it("says where it came from, since an inspection is stronger evidence", () => {
    const entries = summariseAcknowledgements(rows)["dr-1"].entries;

    expect(entries[0].source).toBe("standalone");
    expect(entries[1].source).toBe("inspection");
  });

  it("falls back to a label rather than an empty name", () => {
    expect(summariseAcknowledgements(rows)["dr-2"].entries[0].name).toBe("A driver");
  });

  it("says nothing about a report nobody confirmed", () => {
    expect(summariseAcknowledgements(rows)["dr-3"]).toBeUndefined();
  });
});
