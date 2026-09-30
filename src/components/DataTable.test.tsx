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

describe("DataTable header tooltips", () => {
  const withTip: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      sortKey: "name",
      headerTooltip: { label: "About Name", content: "Names things" },
      render: () => "-",
    },
    { key: "plain", header: "Plain", sortKey: "plain", render: () => "-" },
  ];
  const renderTip = () =>
    renderToStaticMarkup(
      <DataTable
        columns={withTip}
        data={[{ id: "1", name: "A" }]}
        keyExtractor={(r) => r.id}
        onSort={() => {}}
      />,
    );

  it("adds an info icon only to the column that asks for one", () => {
    expect(renderTip().match(/aria-label="About Name"/g)).toHaveLength(1);
  });

  it("keeps the icon out of the sort button, so clicking it never sorts", () => {
    const html = renderTip();
    const sortButton = html.match(/<button[^>]*>.*?<\/button>/)![0];
    expect(sortButton).toContain("Name");
    expect(sortButton).not.toContain("aria-label=");
    expect(html.match(/<button/g)).toHaveLength(3);
  });

  it("leaves a column without a tooltip exactly as before", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        data={[{ id: "1", name: "A" }]}
        keyExtractor={(r) => r.id}
        onSort={() => {}}
      />,
    );
    expect(html).not.toContain("aria-label=");
  });
});
