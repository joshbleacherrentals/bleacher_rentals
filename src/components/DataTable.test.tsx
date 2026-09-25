import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable, type Column, type DataTableSort } from "./DataTable";

type Row = { id: string; name: string };

const columns: Column<Row>[] = [
  { key: "name", header: "Name", sortKey: "name", render: (r) => r.name },
  { key: "plain", header: "Plain", render: () => "-" },
];

const render = (sort?: DataTableSort, onSort?: (key: string) => void) =>
  renderToStaticMarkup(
    <DataTable
      columns={columns}
      data={[{ id: "1", name: "A" }]}
      keyExtractor={(r) => r.id}
      sort={sort}
      onSort={onSort}
    />,
  );

describe("DataTable sorting", () => {
  it("makes only sortable headers clickable", () => {
    const html = render(undefined, () => {});
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("marks the active column with its direction", () => {
    expect(render({ key: "name", direction: "asc" }, () => {})).toContain('aria-sort="ascending"');
    expect(render({ key: "name", direction: "desc" }, () => {})).toContain(
      'aria-sort="descending"',
    );
  });

  it("renders plain headers when the table is not sortable", () => {
    expect(render()).not.toContain("<button");
  });
});
