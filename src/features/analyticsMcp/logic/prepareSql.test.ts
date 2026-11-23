import { describe, it, expect } from "vitest";
import { prepareSql } from "./prepareSql";
import { MAX_SQL_CHARS } from "../constants";

// docs/specs/analytics-mcp.md §3: the friendly check in front of the database's own refusals.
describe("prepareSql", () => {
  it("accepts a plain select and returns it trimmed", () => {
    expect(prepareSql('  select * from "Events"  ')).toEqual({
      ok: true,
      sql: 'select * from "Events"',
    });
  });

  it.each([
    ["with", "WITH a AS (select 1) select * from a"],
    ["values", "VALUES (1), (2)"],
    ["table", 'TABLE "Events"'],
    ["a parenthesised select", "(select 1) union (select 2)"],
    ["upper case", "SELECT 1"],
  ])("accepts %s", (_label, sql) => {
    expect(prepareSql(sql).ok).toBe(true);
  });

  it("strips trailing semicolons, so Claude's habit of ending with one still works", () => {
    expect(prepareSql("select 1;;  ")).toEqual({ ok: true, sql: "select 1" });
  });

  it("skips leading comments", () => {
    expect(prepareSql('-- count them\n/* really */ select count(*) from "Events"').ok).toBe(true);
  });

  it.each([
    'insert into "Events" values (1)',
    'delete from "Events"',
    'update "Events" set x = 1',
    "drop table x",
    "truncate x",
    "create table x (a int)",
    "alter table x add column y int",
    "grant all on x to y",
    "call do_it()",
    "do $$ begin end $$",
    "explain select 1",
    "set role postgres",
    "begin",
    "commit",
    "select_all()",
  ])("refuses %s", (sql) => {
    const r = prepareSql(sql);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/only select/i);
  });

  it("refuses an empty query", () => {
    for (const sql of ["", "   ", ";", "-- nothing"]) {
      const r = prepareSql(sql);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/write/i);
    }
  });

  it("refuses a query over the length limit", () => {
    const r = prepareSql("select " + "1,".repeat(MAX_SQL_CHARS));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too long/i);
  });
});
