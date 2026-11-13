import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/accountant-audit-05-drivers-table.md §2.3, §4 (D16-D19, R2, R5, R22, R24, R25).
const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import type { AuditDriverRow } from "../utils/auditDriverRows";
import type { AuditSort } from "../utils/auditSort";
import { AuditDriversTable } from "./AuditDriversTable";

const row = (id: string, over: Partial<AuditDriverRow> = {}): AuditDriverRow => ({
  driverUuid: id,
  firstName: "Ann",
  lastName: "Lee",
  distanceMeters: 34400,
  driveMinutes: 125,
  payCents: 123400,
  payCurrency: "USD",
  tripCount: 7,
  ...over,
});

const PAY_DESC: AuditSort = { key: "pay", direction: "desc" };
const render = (
  rows: AuditDriverRow[],
  sort: AuditSort = PAY_DESC,
  empty = "No driver data for this range.",
) =>
  renderToStaticMarkup(
    <AuditDriversTable
      rows={rows}
      sort={sort}
      onSort={() => {}}
      getRowHref={(r) => `/accountant?tab=audit&driver=${r.driverUuid}`}
      emptyMessage={empty}
    />,
  );

beforeEach(() => router.push.mockReset());

describe("the headers", () => {
  it("are Driver, Distance, Drive Time, Trips, Pay, and there is no # column (D18)", () => {
    const html = render([row("d1")]);
    const headers = [...html.matchAll(/<th[^>]*>.*?<span>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(headers).toEqual(["Driver", "Distance", "Drive Time", "Trips", "Pay"]);
    expect(html).not.toContain(">#<");
  });

  it("every header is a button (D19)", () => {
    const html = render([row("d1")]);
    for (const key of ["driver", "distance", "time", "trips", "pay"]) {
      expect(html).toContain(`data-testid="audit-sort-${key}"`);
    }
    expect(html.match(/<button type="button"/g)).toHaveLength(5);
  });

  it("the sorted header carries aria-sort, the others none (R22)", () => {
    const html = render([row("d1")], { key: "pay", direction: "desc" });
    expect(html).toMatch(/<th[^>]*aria-sort="descending"[^>]*>.*?Pay/);
    expect(html.match(/aria-sort="none"/g)).toHaveLength(4);
    const asc = render([row("d1")], { key: "driver", direction: "asc" });
    expect(asc).toMatch(/<th[^>]*aria-sort="ascending"[^>]*>.*?Driver/);
  });

  it("shows an arrow on the sorted column and the both-ways icon on the others", () => {
    const html = render([row("d1")], { key: "pay", direction: "desc" });
    expect(html.match(/lucide-arrow-down/g)).toHaveLength(1);
    expect(html.match(/lucide-arrow-up-down/g)).toHaveLength(4);
  });

  it("a click on a header calls onSort with its key", () => {
    const keys: string[] = [];
    const t: any = AuditDriversTable({
      rows: [],
      sort: PAY_DESC,
      onSort: (k) => keys.push(k),
      getRowHref: () => "",
      emptyMessage: "",
    });
    // The header cells are the five children of the first table row: each gets the sort key it
    // stands for and the table's onSort, which it calls on a click.
    const headerRow =
      t.props.children.props.children.props.children[0].props.children.props.children;
    expect(headerRow.map((th: any) => th.props.sortKey)).toEqual([
      "driver",
      "distance",
      "time",
      "trips",
      "pay",
    ]);
    for (const th of headerRow) th.props.onSort(th.props.sortKey);
    expect(keys).toEqual(["driver", "distance", "time", "trips", "pay"]);
  });
});

describe("the cells (R24, R25)", () => {
  it("shows the name as a link to the driver page", () => {
    const html = render([row("d1")]);
    expect(html).toMatch(/<a [^>]*href="\/accountant\?tab=audit&amp;driver=d1"[^>]*>Ann Lee<\/a>/);
  });

  it("shows Unknown Driver for a driver with no name", () => {
    expect(render([row("d1", { firstName: null, lastName: null })])).toContain("Unknown Driver");
    expect(render([row("d1", { firstName: "Ann", lastName: null })])).toContain(">Ann<");
  });

  it("shows the distance in kilometres, then miles, in one cell", () => {
    expect(render([row("d1", { distanceMeters: 34400 })])).toContain("34.4 km/21.4 mi");
    expect(render([row("d1", { distanceMeters: 27726000 })])).toContain("27726.0 km/17228.2 mi");
    expect(render([row("d1", { distanceMeters: 0 })])).toContain("0.0 km/0.0 mi");
  });

  it("shows the drive time as 2h 5m, 45m, 2h or a dash", () => {
    expect(render([row("d1", { driveMinutes: 125 })])).toContain(">2h 5m<");
    expect(render([row("d1", { driveMinutes: 45 })])).toContain(">45m<");
    expect(render([row("d1", { driveMinutes: 120 })])).toContain(">2h<");
    expect(render([row("d1", { driveMinutes: 0 })])).toContain(">—<");
  });

  it("shows the trips as a plain number", () => {
    expect(render([row("d1", { tripCount: 7 })])).toContain(">7<");
  });

  it("shows the pay with the driver's currency (D17)", () => {
    expect(render([row("d1", { payCents: 123400, payCurrency: "USD" })])).toContain(
      "$1,234.00 USD",
    );
    expect(render([row("d1", { payCents: 56700, payCurrency: "CAD" })])).toContain("$567.00 CAD");
  });

  it("keeps the order of the rows it is given", () => {
    const html = render([row("a", { firstName: "Zed" }), row("b", { firstName: "Amy" })]);
    expect(html.indexOf("Zed")).toBeLessThan(html.indexOf("Amy"));
  });
});

describe("a row (D9, R5)", () => {
  it("has the pointer cursor and the hover", () => {
    const html = render([row("d1")]);
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("hover:bg-gray-50");
  });

  function rowOf(rows: AuditDriverRow[]) {
    const t: any = AuditDriversTable({
      rows,
      sort: PAY_DESC,
      onSort: () => {},
      getRowHref: (r) => `/x?driver=${r.driverUuid}`,
      emptyMessage: "",
    });
    const tbody = t.props.children.props.children.props.children[1];
    return tbody.props.children[0][0]; // the first <tr>
  }

  it("a click on the row pushes the driver page", () => {
    const tr = rowOf([row("d1")]);
    tr.props.onClick({ target: { closest: () => null } });
    expect(router.push).toHaveBeenCalledWith("/x?driver=d1");
  });

  it("a click that already hit the name link is not handled twice", () => {
    const tr = rowOf([row("d1")]);
    tr.props.onClick({ target: { closest: () => ({}) } });
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("the empty state", () => {
  it("shows the message it is given, in one cell across the table, and no rows", () => {
    const html = render([], PAY_DESC, "No driver found.");
    expect(html).toContain('data-testid="audit-drivers-empty"');
    expect(html).toContain("No driver found.");
    expect(html).toContain('colSpan="5"');
    expect(html).not.toContain('data-testid="audit-driver-row"');
  });

  it("shows no message when there are rows", () => {
    expect(render([row("d1")])).not.toContain('data-testid="audit-drivers-empty"');
  });
});

describe("the look", () => {
  it("left-aligns the Driver header and right-aligns the four number headers", () => {
    const html = render([row("d1")]);
    const classes = [...html.matchAll(/<th[^>]*class="([^"]*)"/g)].map((m) => m[1]);
    expect(classes).toHaveLength(5);
    expect(classes[0]).toContain("text-left");
    for (const c of classes.slice(1)) expect(c).toContain("text-right");
  });

  it("puts the initials beside each name, hidden from screen readers", () => {
    const html = render([row("d1", { firstName: "Matt", lastName: "Pilcher" })]);
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*data-initials="MP"[^>]*><\/span>/);
  });

  it("keeps the text of the name cell to the name alone, so the initials are not copied or tested as text", () => {
    const html = render([row("d1", { firstName: "Matt", lastName: "Pilcher" })]);
    const nameCell = html.match(/<td class="px-5 py-3">(.*?)<\/td>/)?.[1] ?? "";
    expect(nameCell.replace(/<[^>]+>/g, "")).toBe("Matt Pilcher");
  });

  it("right-aligns the number cells and darkens only the column the rows are sorted by", () => {
    const html = render([row("d1")], { key: "pay", direction: "desc" });
    const cells = [...html.matchAll(/<td class="([^"]*)"/g)].map((m) => m[1]);
    // The name cell has no number class; the four others are numbers.
    const numbers = cells.filter((c) => c.includes("text-right"));
    expect(numbers).toHaveLength(4);
    expect(numbers.filter((c) => c.includes("text-darkBlue"))).toHaveLength(1);
    expect(numbers[3]).toContain("text-darkBlue"); // Pay is the sorted column
  });
});

describe("the Pay total", () => {
  const totalOf = (html: string) =>
    html.match(/data-testid="audit-pay-total"[^>]*>([^<]*)</)?.[1] ?? null;

  it("sums the pay of every row in whole dollars under the Pay header", () => {
    const html = render([
      row("a", { payCents: 123400 }),
      row("b", { payCents: 56700 }),
      row("c", { payCents: 100 }),
    ]);
    expect(totalOf(html)).toBe("$1,802");
  });

  it("keeps the two currencies apart, USD first, as the Subtotal header does", () => {
    const html = render([
      row("a", { payCents: 123400, payCurrency: "USD" }),
      row("b", { payCents: 56700, payCurrency: "CAD" }),
      row("c", { payCents: 100000, payCurrency: "CAD" }),
    ]);
    expect(totalOf(html)).toBe("$1,234 + C$1,567");
  });

  it("adds up only the rows it is given, so a search narrows the total", () => {
    const all = [row("a", { payCents: 100000 }), row("b", { payCents: 50000 })];
    expect(totalOf(render(all))).toBe("$1,500");
    expect(totalOf(render(all.slice(1)))).toBe("$500");
  });

  it("is $0 when there are no rows", () => {
    expect(totalOf(render([], PAY_DESC, "No driver found."))).toBe("$0");
  });

  it("sits in the Pay header cell, below the sort button and not inside it", () => {
    const html = render([row("d1", { payCents: 123400 })]);
    const payTh = html.match(/<th[^>]*>(?:(?!<\/th>).)*audit-sort-pay.*?<\/th>/)?.[0] ?? "";
    expect(payTh).toContain('data-testid="audit-pay-total"');
    const button = payTh.match(/<button.*?<\/button>/)?.[0] ?? "";
    expect(button).not.toContain("audit-pay-total");
  });

  it("is only under Pay: the other four headers carry no total", () => {
    expect(render([row("d1")]).match(/data-testid="audit-pay-total"/g)).toHaveLength(1);
  });

  it("is told apart from the row amounts by a title that says what it is", () => {
    expect(render([row("d1")])).toMatch(/title="Total pay of the drivers listed"[^>]*data-testid/);
  });
});
