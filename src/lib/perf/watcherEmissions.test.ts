import { beforeEach, describe, expect, it } from "vitest";
import {
  buildReport,
  clearPerfLog,
  countWatcherEmission,
  countWatcherMount,
  countWatcherUnmount,
  formatWatcherEmissions,
  getPerfLog,
  resetPerfCounters,
  summarizeWatcherEmissionsByTable,
  tablesInSql,
  watcherEmissionCounts,
  watcherKeyFromSql,
} from "./perfTrace";

describe("watcherKeyFromSql", () => {
  it("collapses whitespace so the same query keys identically however it was formatted", () => {
    expect(watcherKeyFromSql('select *\n  from "Users"\n\twhere id = ?')).toBe(
      'select * from "Users" where id = ?',
    );
  });

  it("trims surrounding whitespace", () => {
    expect(watcherKeyFromSql('  select 1 from "Users"  ')).toBe('select 1 from "Users"');
  });

  it("keeps different queries distinct", () => {
    expect(watcherKeyFromSql('select * from "Users"')).not.toBe(
      watcherKeyFromSql('select * from "Drivers"'),
    );
  });
});

describe("tablesInSql", () => {
  it("finds the table behind a plain select", () => {
    expect(tablesInSql('select "id" from "WorkTrackers" where "id" = ?')).toEqual(["WorkTrackers"]);
  });

  it("finds every joined table, which is what a watcher actually wakes on", () => {
    const sql =
      'select * from "WorkTrackers" as "wt" ' +
      'inner join "Drivers" as "d" on "d"."id" = "wt"."driver_uuid" ' +
      'left join "Users" as "u" on "u"."id" = "d"."user_uuid"';
    expect(tablesInSql(sql)).toEqual(["WorkTrackers", "Drivers", "Users"]);
  });

  it("reports each table once however often it is mentioned", () => {
    const sql = 'select * from "Alerts" inner join "Alerts" as "a2" on "a2"."id" = "Alerts"."id"';
    expect(tablesInSql(sql)).toEqual(["Alerts"]);
  });

  it("returns nothing it cannot recognise rather than guessing", () => {
    expect(tablesInSql("select 1")).toEqual([]);
  });
});

describe("watcher emission counters", () => {
  beforeEach(() => resetPerfCounters());

  const usersSql = 'select * from "Users" where "id" = ?';
  const trackersSql = 'select * from "WorkTrackers"';

  it("starts empty", () => {
    expect(watcherEmissionCounts()).toEqual([]);
  });

  it("records a mounted watcher before it has emitted anything", () => {
    countWatcherMount(usersSql);

    expect(watcherEmissionCounts()).toEqual([
      { key: usersSql, tables: ["Users"], emissions: 0, watchers: 1 },
    ]);
  });

  it("counts one emission per watcher per commit", () => {
    countWatcherMount(usersSql);
    countWatcherMount(usersSql);
    countWatcherEmission(usersSql);
    countWatcherEmission(usersSql);

    expect(watcherEmissionCounts()[0]).toMatchObject({ emissions: 2, watchers: 2 });
  });

  it("aggregates queries that differ only in formatting", () => {
    countWatcherEmission('select *\nfrom "Users"');
    countWatcherEmission('select * from "Users"');

    expect(watcherEmissionCounts()).toHaveLength(1);
    expect(watcherEmissionCounts()[0].emissions).toBe(2);
  });

  it("sorts the hottest query first", () => {
    countWatcherEmission(usersSql);
    countWatcherEmission(trackersSql);
    countWatcherEmission(trackersSql);

    expect(watcherEmissionCounts().map((row) => row.emissions)).toEqual([2, 1]);
  });

  it("drops a watcher's registration when it unmounts but keeps its emissions", () => {
    countWatcherMount(usersSql);
    countWatcherEmission(usersSql);
    countWatcherUnmount(usersSql);

    expect(watcherEmissionCounts()[0]).toMatchObject({ emissions: 1, watchers: 0 });
  });

  it("never lets an unmatched unmount drive the live count negative", () => {
    countWatcherUnmount(usersSql);

    expect(watcherEmissionCounts()[0].watchers).toBe(0);
  });

  it("is cleared by resetPerfCounters, so perfLog.clear() starts a clean measurement", () => {
    countWatcherMount(usersSql);
    countWatcherEmission(usersSql);
    resetPerfCounters();

    expect(watcherEmissionCounts()).toEqual([]);
  });
});

describe("summarizeWatcherEmissionsByTable", () => {
  it("charges a joined query's emissions to every table it wakes on", () => {
    const rows = [
      { key: "a", tables: ["WorkTrackers", "Drivers"], emissions: 4, watchers: 1 },
      { key: "b", tables: ["Drivers"], emissions: 3, watchers: 2 },
    ];

    expect(summarizeWatcherEmissionsByTable(rows)).toEqual([
      { table: "Drivers", emissions: 7, queries: 2 },
      { table: "WorkTrackers", emissions: 4, queries: 1 },
    ]);
  });

  it("ignores queries whose tables could not be identified", () => {
    expect(
      summarizeWatcherEmissionsByTable([{ key: "a", tables: [], emissions: 9, watchers: 1 }]),
    ).toEqual([]);
  });
});

describe("formatWatcherEmissions", () => {
  const rows = [
    { key: 'select * from "WorkTrackers"', tables: ["WorkTrackers"], emissions: 40, watchers: 2 },
    { key: 'select * from "Users"', tables: ["Users"], emissions: 10, watchers: 1 },
  ];

  it("leads with the total, which is the number the hypothesis is about", () => {
    expect(formatWatcherEmissions(rows)[0]).toBe(
      "watched-query emissions: 50 across 2 distinct queries (3 live watchers)",
    );
  });

  it("lists a per-table roll-up before the per-query lines", () => {
    expect(formatWatcherEmissions(rows)).toContain("  by table: WorkTrackers 40, Users 10");
  });

  it("lists the hottest queries with their live watcher count", () => {
    expect(formatWatcherEmissions(rows)).toContain(
      '  40 emissions  ×2 watchers  select * from "WorkTrackers"',
    );
  });

  it("keeps the report readable by capping both the list and each SQL line", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      key: `select ${"x".repeat(200)} from "T${i}"`,
      tables: [`T${i}`],
      emissions: 30 - i,
      watchers: 1,
    }));

    const lines = formatWatcherEmissions(many, 5);
    const queryLines = lines.filter((line) => line.includes("emissions  ×"));

    expect(queryLines).toHaveLength(5);
    expect(queryLines.every((line) => line.length <= 140)).toBe(true);
    expect(lines[lines.length - 1]).toBe("  … 25 more queries");
  });

  it("says nothing at all when no watcher has emitted", () => {
    expect(formatWatcherEmissions([])).toEqual([]);
  });
});

describe("buildReport with watcher emissions", () => {
  beforeEach(() => {
    resetPerfCounters();
    clearPerfLog();
  });

  it("includes the emission section once a watcher has emitted", () => {
    countWatcherMount('select * from "WorkTrackers"');
    countWatcherEmission('select * from "WorkTrackers"');

    const report = buildReport(getPerfLog());

    expect(report).toContain("watched-query emissions: 1 across 1 distinct queries");
    expect(report).toContain("by table: WorkTrackers 1");
  });

  it("leaves the report as it was when nothing is watched", () => {
    expect(buildReport(getPerfLog())).not.toContain("watched-query emissions");
  });
});
