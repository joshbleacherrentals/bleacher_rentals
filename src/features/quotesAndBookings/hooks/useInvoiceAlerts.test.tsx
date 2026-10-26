import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/qbo-invoice-11-counts-and-marks.md §3 and §8. The hook is rendered on the server
// with `useTypedQuery` replaced: what is under test is the query it asks the local database, who it
// is built for, and that the map and the count are the one answer.

const mocks = vi.hoisted(() => ({
  answer: { data: [], isLoading: false, error: undefined } as {
    data: unknown[] | undefined;
    isLoading: boolean;
    error: Error | undefined;
  },
  compiled: undefined as { sql: string; parameters: unknown[] } | undefined,
  // zustand reads its initial state under a static server render, so the store is replaced rather
  // than set; the capabilities hook reads it through selectors.
  permissions: {
    current: {
      roles: ["accountant"] as string[],
      userId: "user-7",
      leadZoneIds: [] as string[],
      accountManagerZoneIds: [] as string[],
    },
  },
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const { DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } =
    await import("kysely");
  return {
    db: new Kysely({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new SqliteIntrospector(kysely),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      },
    }),
  };
});
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: (compiled: { sql: string; parameters: unknown[] }) => {
    mocks.compiled = compiled;
    return mocks.answer;
  },
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (selector: (state: typeof mocks.permissions.current) => unknown) =>
    selector(mocks.permissions.current),
}));

import { useInvoiceAlerts } from "./useInvoiceAlerts";

function Probe() {
  const { reasonsByEvent, count } = useInvoiceAlerts();
  return <p>{JSON.stringify({ entries: [...reasonsByEvent], count })}</p>;
}

const drawn = (): { entries: [string, string[]][]; count: number } =>
  JSON.parse(
    renderToStaticMarkup(<Probe />)
      .replace(/<\/?p>/g, "")
      .replaceAll("&quot;", '"'),
  );

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  qbo_invoice_id: `inv-${id}`,
  qbo_invoice_mismatch: 1,
  qbo_invoice_mismatch_reasons: '["dates"]',
  ...over,
});

const asRoles = (...roles: string[]) => {
  mocks.permissions.current = { ...mocks.permissions.current, roles };
};

describe("useInvoiceAlerts", () => {
  beforeEach(() => {
    mocks.answer = { data: [], isLoading: false, error: undefined };
    mocks.compiled = undefined;
    asRoles("accountant");
  });

  describe("the query, for an accountant", () => {
    it("reads the four columns from Events", () => {
      drawn();

      const sql = mocks.compiled?.sql ?? "";
      expect(sql).toContain('from "Events"');
      for (const column of [
        '"id"',
        '"qbo_invoice_id"',
        '"qbo_invoice_mismatch"',
        '"qbo_invoice_mismatch_reasons"',
      ]) {
        expect(sql).toContain(column);
      }
      // Not the invoice's other columns, and not the event's.
      expect(sql).not.toContain("qbo_invoice_checked_at");
      expect(sql).not.toContain("event_name");
    });

    it("asks only for non-deleted events that have an invoice and whose flag is set", () => {
      drawn();

      expect(mocks.compiled?.sql).toContain('"qbo_invoice_id" is not null');
      expect(mocks.compiled?.sql).toContain('"qbo_invoice_mismatch" = ?');
      expect(mocks.compiled?.sql).toContain('"deleted" = ?');
      expect(mocks.compiled?.parameters).toEqual([1, 0]);
    });

    it("has no join: one query per table", () => {
      drawn();

      expect(mocks.compiled?.sql).not.toMatch(/\bjoin\b/i);
    });

    it("is built the same for an admin who is also an accountant", () => {
      asRoles("admin", "accountant");

      drawn();

      expect(mocks.compiled?.parameters).toEqual([1, 0]);
    });
  });

  describe("the answer", () => {
    it("maps each event to its reasons, in spec 06's order, and counts the events in the map", () => {
      mocks.answer = {
        data: [
          row("evt-1"),
          row("evt-2", { qbo_invoice_mismatch_reasons: '["totals","dates"]' }),
          row("evt-3", { qbo_invoice_mismatch_reasons: null }),
        ],
        isLoading: false,
        error: undefined,
      };

      expect(drawn()).toEqual({
        entries: [
          ["evt-1", ["dates"]],
          ["evt-2", ["dates", "totals"]],
          ["evt-3", ["unspecified"]],
        ],
        count: 3,
      });
    });

    it("leaves out an event the rule says needs nothing, so the count and the map agree", () => {
      mocks.answer = {
        data: [
          row("evt-1"),
          row("evt-2", { qbo_invoice_mismatch: 0 }),
          row("evt-3", { qbo_invoice_id: null }),
          row("evt-4", { qbo_invoice_mismatch: null }),
        ],
        isLoading: false,
        error: undefined,
      };

      const { entries, count } = drawn();

      expect(entries).toEqual([["evt-1", ["dates"]]]);
      expect(count).toBe(1);
    });

    it("counts an event once, however many rows name it", () => {
      mocks.answer = { data: [row("evt-1"), row("evt-1")], isLoading: false, error: undefined };

      expect(drawn()).toEqual({ entries: [["evt-1", ["dates"]]], count: 1 });
    });

    it("is empty, with a count of 0, when nothing needs attention", () => {
      expect(drawn()).toEqual({ entries: [], count: 0 });
    });

    it("is empty, with a count of 0, until the local database has answered", () => {
      mocks.answer = { data: undefined, isLoading: true, error: undefined };

      expect(drawn()).toEqual({ entries: [], count: 0 });
    });
  });

  describe("for a user who is not an accountant", () => {
    it("builds a query that matches no row, so there is nothing to watch for", () => {
      asRoles("admin");

      drawn();

      const sql = mocks.compiled?.sql ?? "";
      expect(sql).toContain('from "Events"');
      expect(sql).toMatch(/where 0 = 1/);
      expect(sql).not.toContain('qbo_invoice_mismatch" = ?');
      expect(mocks.compiled?.parameters).toEqual([]);
    });

    it("answers with an empty map and 0 for every role but the accountant, whatever rows arrive", () => {
      mocks.answer = { data: [row("evt-1"), row("evt-2")], isLoading: false, error: undefined };

      for (const roles of [
        ["admin"],
        ["account_manager"],
        ["viewer"],
        ["developer"],
        ["driver"],
        ["maintainer"],
        ["admin", "viewer"],
        [],
      ]) {
        asRoles(...roles);
        expect(drawn(), roles.join("+") || "no roles").toEqual({ entries: [], count: 0 });
      }
    });

    it("is rebuilt when the role is added or removed while signed in", () => {
      mocks.answer = { data: [row("evt-1")], isLoading: false, error: undefined };

      asRoles("admin");
      expect(drawn().count).toBe(0);
      asRoles("admin", "accountant");
      expect(drawn().count).toBe(1);
      expect(mocks.compiled?.parameters).toEqual([1, 0]);
      asRoles("admin");
      expect(drawn().count).toBe(0);
      expect(mocks.compiled?.sql).toMatch(/where 0 = 1/);
    });
  });
});
